// ============================================================
// IdentityResolver - split entity identity from entity existence (M25)
//
// §15.3: every entity has a stable `entity_id` separate from its
// aliases/names; resolution is a DEDICATED deterministic pass that returns
// `matched`, `new_candidate`, or `ambiguous` — it NEVER lets the LLM silently
// decide identity by best-guess.
//
// Resolution looks entity-agnostic through the `entity_aliases` table (seeded
// by migration 069 from canonical names, plus explicit aliases). Locations are
// file-only, so their aliases are latched from YAML on first resolve.
// ============================================================

import fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import type { ContentPlan, ContentPlanItem, IdentityResolution, ResolutionAlternative } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { normalizeName } from './OutlineChunking.js';
import { resolveContentDir } from './StoryBuilderLore.js';

/** Raw `entity_aliases` row returned by the lookup query. */
interface AliasRow {
  entity_id: string;
  alias: string;
  is_primary: boolean;
}

/** Sorted collection of known aliases for an entity type (keyed by normalized alias). */
interface AliasIndex {
  [normalizedAlias: string]: Array<{ entityId: string; alias: string; primary: boolean }>;
}

/** Produce a stable short label for an existing candidate, e.g. `a193 Marcus`. */
function existingLabel(entityId: string, name: string): string {
  const short = String(entityId).split('-')[0]?.slice(0, 4) ?? '????';
  return `${short} ${name}`;
}

/** Persist YAML location aliases into `entity_aliases` (file-only type). */
async function syncLocationAliases(): Promise<AliasIndex> {
  const contentDir = resolveContentDir();
  const upsert: Array<{ entityId: string; alias: string }> = [];
  const seen = new Set<string>();

  try {
    const files = await glob(`${contentDir}/districts/*/locations/*/*.yaml`, { absolute: true });
    for (const file of files) {
      try {
        const raw = await fs.readFile(file, 'utf-8');
        const data: any = yaml.load(raw);
        if (!data || typeof data !== 'object' || !data.id) continue;
        const entityId = String(data.id);
        const names: string[] = [];
        if (data.name && typeof data.name === 'string') names.push(data.name);
        if (Array.isArray(data.aliases)) {
          names.push(...data.aliases.filter((a: unknown): a is string => typeof a === 'string'));
        }
        for (const alias of names) {
          const key = `${entityId}::${normalizeName(alias)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          upsert.push({ entityId, alias });
        }
      } catch {
        // skip files that fail to parse
      }
    }
  } catch {
    return {};
  }

  if (upsert.length > 0) {
    try {
      const params: any[] = [];
      const values = upsert.map(({ entityId, alias }, i) => {
        const base = i * 3;
        params.push('location', entityId, alias);
        return `($${base + 1}, $${base + 2}, $${base + 3}, 'yaml_aliases', FALSE)`;
      });
      await queryOLTP<AliasRow>(
        `INSERT INTO entity_aliases (entity_type, entity_id, alias, source, is_primary)
         VALUES ${values.join(', ')}
         ON CONFLICT (entity_type, entity_id, lower(alias)) DO NOTHING`,
        params,
      );
    } catch {
      // Best-effort: resolution falls back to the in-memory index below.
    }
  }

  const index: AliasIndex = {};
  for (const { entityId, alias } of upsert) {
    const key = normalizeName(alias);
    if (!index[key]) index[key] = [];
    index[key].push({ entityId, alias, primary: false });
  }
  return index;
}

function indexFromRows(rows: AliasRow[]): AliasIndex {
  const index: AliasIndex = {};
  for (const row of rows) {
    const key = normalizeName(row.alias);
    if (!index[key]) index[key] = [];
    index[key].push({ entityId: row.entity_id, alias: row.alias, primary: row.is_primary });
  }
  return index;
}

function mergeIndexes(a: AliasIndex, b: AliasIndex): AliasIndex {
  const out: AliasIndex = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key] ?? [];
    const right = b[key] ?? [];
    const byEntity = new Map<string, { entityId: string; alias: string; primary: boolean }>();
    for (const c of [...left, ...right]) {
      if (!byEntity.has(c.entityId) || c.primary) byEntity.set(c.entityId, c);
    }
    out[key] = Array.from(byEntity.values());
  }
  return out;
}

function dedupeCandidates(
  candidates: Array<{ entityId: string; alias: string; primary: boolean }>,
): Array<{ entityId: string; alias: string }> {
  // Collapse duplicate ENTRIES for the same entity (preferring the primary
  // alias), but keep DISTINCT entities that happen to share the queried name —
  // that is the ambiguity we must surface, not merge.
  const byEntity = new Map<string, { entityId: string; alias: string }>();
  for (const c of candidates) {
    const existing = byEntity.get(c.entityId);
    if (!existing || c.primary) {
      byEntity.set(c.entityId, { entityId: c.entityId, alias: c.alias });
    }
  }
  return Array.from(byEntity.values());
}

/** Collect the aliases attached to a matched resolution for item annotation. */
function existingAliasesFor(
  entityType: string,
  index: AliasIndex,
  resolution: IdentityResolution,
): string[] {
  if (resolution.status !== 'matched') return [];
  const out: string[] = [];
  const ordered = index[normalizeName(resolution.alias)] ?? [];
  for (const c of ordered) {
    if (c.entityId === resolution.entityId && !out.includes(c.alias)) {
      out.push(c.alias);
    }
  }
  return out;
}

/** Derive a "name II" style suggestion for a new variant of an existing name. */
function suggestNextName(name: string): string {
  const trimmed = name.trim().replace(/\s+(II|III|IV|Jr\.?|Sr\.?)$/i, '');
  if (!trimmed) return 'Unnamed';
  return `${trimmed} II`;
}

export class IdentityResolver {
  private async loadAliasIndex(entityType: string): Promise<AliasIndex> {
    const result = await queryOLTP<AliasRow>(
      `SELECT entity_id, alias, is_primary FROM entity_aliases WHERE entity_type = $1 ORDER BY is_primary DESC, alias ASC`,
      [entityType],
    );
    const dbIndex = indexFromRows(result.rows);

    // Locations are file-only; latch YAML aliases so resolution covers them.
    if (entityType === 'location') {
      const locIndex = await syncLocationAliases();
      return mergeIndexes(dbIndex, locIndex);
    }
    return dbIndex;
  }

  /**
   * Resolve a single candidate name against known aliases for `entityType`.
   * Returns `matched` (single normalized match), `new_candidate` (no match),
   * or `ambiguous` (several plausible identities) — never a guess.
   */
  async resolve(
    entityType: string,
    name: string,
    opts: { description?: string } = {},
  ): Promise<IdentityResolution> {
    const normalized = normalizeName(name);
    if (!normalized) {
      const suggested = opts.description?.trim().slice(0, 60) || '&lt;unnamed&gt;';
      return { status: 'new_candidate', entityType, suggestedName: suggested };
    }
    const index = await this.loadAliasIndex(entityType);
    const deduped = dedupeCandidates(index[normalized] ?? []);

    if (deduped.length === 0) {
      return {
        status: 'new_candidate',
        entityType,
        suggestedName: name.trim(),
      };
    }

    if (deduped.length === 1) {
      return {
        status: 'matched',
        entityType,
        entityId: deduped[0].entityId,
        alias: deduped[0].alias,
      };
    }

    // Multiple distinct identities share this (normalized) name. Surface a
    // picker rather than guessing. Always include the option to create a new
    // variant, matching the milestone's `["a193 Marcus", "new: Marcus II"]`.
    const alternatives: ResolutionAlternative[] = deduped.map((h) => ({
      kind: 'existing',
      id: h.entityId,
      name: existingLabel(h.entityId, h.alias),
    }));
    alternatives.push({ kind: 'new', name: `new: ${suggestNextName(name)}` });

    return { status: 'ambiguous', entityType, alternatives };
  }

  /**
   * Annotate every plan item with its identity resolution. Matched items get
   * `entity_id` + inline aliases; ambiguous items keep `resolution.status ===
   * 'ambiguous'` so the admin can pick. Never mutates identity silently.
   */
  async resolvePlanItems(plan: ContentPlan): Promise<ContentPlan> {
    const items: ContentPlanItem[] = [];
    for (const item of plan.items) {
      items.push(
        item.action === 'update'
          ? item // existing references are already identity-stable; nothing to resolve
          : await this.annotateNewItem(item),
      );
    }
    return { ...plan, items };
  }

  private async annotateNewItem(item: ContentPlanItem): Promise<ContentPlanItem> {
    const resolution = await this.resolve(item.type, item.name, { description: item.description });
    const next: ContentPlanItem = { ...item, resolution };

    if (resolution.status === 'matched') {
      next.entity_id = resolution.entityId;
      const aliases = existingAliasesFor(item.type, await this.loadAliasIndex(item.type), resolution);
      if (aliases.length > 0) next.aliases = aliases;
      // A matched entity is a first-class content item; swap `create` for
      // `update` so the author is explicitly extending existing canon rather
      // than creating a duplicate.
      if (item.action !== 'update') next.action = 'update';
    }
    if (resolution.status === 'ambiguous') {
      // Do NOT set entity_id or flip action on an ambiguous identity — the
      // author must resolve it first. Keep the item as a create proposal until
      // then so nothing is silently merged.
      next.resolution = resolution;
    }
    return next;
  }
}

export const identityResolver = new IdentityResolver();