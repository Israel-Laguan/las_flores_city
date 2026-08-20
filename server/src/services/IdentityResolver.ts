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
import path from 'node:path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import type { ContentPlan, ContentPlanItem, IdentityResolution, ResolutionAlternative } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { normalizeName } from './types/LLMTypes.js';
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
  // Scan EVERY normalized index entry so we pick up all of the matched entity's
  // known names — including aliases that do not share the queried spelling
  // (e.g. a match via the "Marcus" alias should also surface "M.A.R.C.U.S.").
  for (const entries of Object.values(index)) {
    for (const c of entries) {
      if (c.entityId === resolution.entityId && !out.includes(c.alias)) {
        out.push(c.alias);
      }
    }
  }
  return out;
}

/** Roman suffix sequence used by `suggestNextName` (client names: I, II, III…). */
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

/** Hard ceiling on how many variants we will ever propose for one base name. */
const MAX_VARIANT_ATTEMPTS = 100;

/** Convert a positive integer to an uppercase Roman numeral (1 → I, 11 → XI…). */
function toRoman(n: number): string {
  if (n >= 1 && n <= ROMAN_NUMERALS.length) return ROMAN_NUMERALS[n - 1];
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let remaining = n;
  for (const [value, symbol] of table) {
    while (remaining >= value) {
      out += symbol;
      remaining -= value;
    }
  }
  return out;
}

/** Parse a canonical uppercase Roman numeral back to its integer value. */
function fromRoman(s: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const v = values[s[i]];
    if (v === undefined) return 0; // not a Roman numeral
    if (v < prev) total -= v;
    else { total += v; prev = v; }
  }
  return total;
}

/**
 * Derive a "name N…" suggestion for a new variant of an existing name.
 *
 * Returns `null` when no unused variant can be found within `MAX_VARIANT_ATTEMPTS`
 * — i.e. the suffix space is exhausted. Callers must NOT fabricate a colliding
 * name; they should report exhaustion instead.
 */
function suggestNextName(name: string, used: ReadonlySet<string> = new Set()): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Unnamed';
  // Split an existing trailing Roman/Jr./Sr. suffix off so we can increment it.
  // We recognize EVERY canonical Roman numeral `toRoman` can emit (I, II, …, XI,
  // XII, …) — not just the first ten — plus Jr./Sr. This keeps e.g. "Marcus XI"
  // incrementing to "Marcus XII" instead of producing a nested "Marcus XI II".
  const lastSpace = trimmed.lastIndexOf(' ');
  const tail = (lastSpace >= 0 ? trimmed.slice(lastSpace + 1) : trimmed).toUpperCase();
  const parsedRoman = fromRoman(tail);
  let base: string;
  let startNumber: number;
  if (lastSpace >= 0 && parsedRoman > 0 && toRoman(parsedRoman) === tail) {
    // A genuine trailing Roman numeral preceded by a separator — increment past
    // it. The separator requirement keeps a bare single-Roman token such as `I`
    // or `X` from being treated as a suffix (which would otherwise strip the
    // whole name and return `Unnamed`); instead we base the suggestion on the
    // full name.
    base = trimmed.slice(0, lastSpace).trim();
    startNumber = parsedRoman + 1;
  } else if (lastSpace >= 0 && /^Jr\.?$|^Sr\.?$/i.test(tail)) {
    // A Jr./Sr. suffix — start proposing "II" as the first distinct variant.
    base = lastSpace >= 0 ? trimmed.slice(0, lastSpace).trim() : '';
    startNumber = 2;
  } else {
    base = trimmed;
    startNumber = 2;
  }
  if (!base) return 'Unnamed';

  // Walk the numeral sequence until the suggested name is not already in use.
  // Extends well past X (XI, XII, …) so exhausting the fixed list is no longer a
  // collision: we keep searching until we hit the `MAX_VARIANT_ATTEMPTS` ceiling.
  for (let n = startNumber; n < startNumber + MAX_VARIANT_ATTEMPTS; n += 1) {
    const candidate = `${base} ${toRoman(n)}`;
    if (!used.has(normalizeName(candidate))) return candidate;
  }
  // Suffix space exhausted; report it instead of returning a colliding name.
  return null;
}

/** Folder directory for each content type (mirrors `resolveFilePath`'s dirMap). */
const TYPE_DIR: Record<string, string> = {
  character: 'characters',
  dialogue: 'dialogues',
  scene: 'scenes',
  overlay: 'overlays',
  mission: 'missions',
  story: 'stories',
  story_beat: 'story_beats',
  shop_item: 'shop',
  location: 'locations',
  map_tile: 'maps',
  gig: 'gigs',
  vault: 'vault',
};

/**
 * Per-invocation resolution context. The caches are confined to a single
 * `resolvePlanItems` call (never the singleton) so concurrent requests can
 * never share or clear each other's alias/slug indexes.
 */
interface ResolveContext {
  aliasIndexCache: Map<string, AliasIndex>;
  canonicalSlugCache: Map<string, Map<string, string | null>>;
}

export class IdentityResolver {
  /** Build a fresh per-invocation context for one resolve pass. */
  private createContext(): ResolveContext {
    return {
      aliasIndexCache: new Map(),
      canonicalSlugCache: new Map(),
    };
  }

  private async loadAliasIndex(ctx: ResolveContext, entityType: string): Promise<AliasIndex> {
    const cached = ctx.aliasIndexCache.get(entityType);
    if (cached) return cached;
    const result = await queryOLTP<AliasRow>(
      `SELECT entity_id, alias, is_primary FROM entity_aliases WHERE entity_type = $1 ORDER BY is_primary DESC, alias ASC`,
      [entityType],
    );
    let index = indexFromRows(result.rows);

    // Locations are file-only; latch YAML aliases so resolution covers them.
    if (entityType === 'location') {
      const locIndex = await syncLocationAliases();
      index = mergeIndexes(index, locIndex);
    }
    ctx.aliasIndexCache.set(entityType, index);
    return index;
  }

  /**
   * Find the canonical content slug (the per-folder name) for a matched entity by
   * scanning the entity type's content folder for a file whose `id` matches
   * `entityId`. The DB stores no slug — it is the folder name under
   * content/<type>/ — so this is how we learn the real file path for a `matched`
   * identity. Locations live under content/districts/…, so they fall back to a
   * full-tree scan. Returns null when unknown (best-effort). The per-type
   * id→slug map is built once per resolve pass and cached.
   */
  private async canonicalSlugFor(ctx: ResolveContext, entityType: string, entityId: string): Promise<string | null> {
    const cache = ctx.canonicalSlugCache;
    let byId = cache.get(entityType);
    if (!byId) {
      byId = new Map<string, string | null>();
      const contentDir = resolveContentDir();
      const dir = TYPE_DIR[entityType];
      // Locations (and any unknown type) are nested deeper and must be scanned
      // across the whole tree to locate their file by id.
      const pattern = dir && entityType !== 'location'
        ? `${contentDir}/${dir}/*/*.yaml`
        : `${contentDir}/**/*.yaml`;
      try {
        const files = await glob(pattern, { absolute: true });
        for (const file of files) {
          try {
            const raw = await fs.readFile(file, 'utf-8');
            const data: any = yaml.load(raw);
            if (!data || typeof data !== 'object') continue;
            const id = String(data.id ?? '');
            if (!id || byId.has(id)) continue;
            const folder = path.basename(path.dirname(file));
            // The folder name is the slug `resolveFilePath` expects; only keep
            // it if it would pass the slug validation.
            if (/^[a-z0-9_]+$/.test(folder)) byId.set(id, folder);
          } catch {
            // skip files that fail to parse
          }
        }
      } catch {
        // ignore glob/scan failures — caller falls back to the item's own slug
      }
      cache.set(entityType, byId);
    }
    return byId.get(entityId) ?? null;
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
    return this.resolveWithCtx(this.createContext(), entityType, name, opts);
  }

  /**
   * Context-aware resolution used internally by `resolvePlanItems`. The supplied
   * `ctx` keeps the alias/slug caches local to a single resolve pass, so this
   * method never touches shared singleton state (and concurrent passes cannot
   * step on each other's caches).
   */
  private async resolveWithCtx(
    ctx: ResolveContext,
    entityType: string,
    name: string,
    opts: { description?: string } = {},
  ): Promise<IdentityResolution> {
    const normalized = normalizeName(name);
    if (!normalized) {
      const suggested = opts.description?.trim().slice(0, 60) || '<unnamed>';
      return { status: 'new_candidate', entityType, suggestedName: suggested };
    }
    const index = await this.loadAliasIndex(ctx, entityType);
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
    // The `existing` alternative carries the entity's REAL canonical alias so a
    // caller resolving the ambiguity can persist the actual alias (not the
    // picker short-name).
    const alternatives: ResolutionAlternative[] = deduped.map((h) => ({
      kind: 'existing',
      id: h.entityId,
      alias: h.alias,
      name: existingLabel(h.entityId, h.alias),
    }));
    // Build the set of all known normalized aliases for this type so the
    // proposed new-variant name can never collide with ANY existing alias
    // (not just the ones sharing the queried spelling), e.g. so
    // `new: Marcus III` never proposes an already-in-use name.
    const used = new Set(Object.keys(index));
    const next = suggestNextName(name, used);
    if (next) {
      alternatives.push({ kind: 'new', name: `new: ${next}`, exhausted: false });
    } else {
      // Every variant of this base name is already taken. Do NOT fabricate a
      // colliding option — surface exhaustion so the author must reconcile the
      // duplicates (or rename) rather than create a duplicate variant.
      alternatives.push({
        kind: 'new',
        name: `new: ${name} (all variants in use)`,
        exhausted: true,
      });
    }

    return { status: 'ambiguous', entityType, alternatives };
  }

  /**
   * Annotate every plan item with its identity resolution. Matched items get
   * `entity_id` + inline aliases; ambiguous items keep `resolution.status ===
   * 'ambiguous'` so the admin can pick. Items already carrying a verified
   * stable `entity_id` (real `update` references) are left untouched; everything
   * else goes through the resolver so the LLM never silently dictates identity.
   */
  async resolvePlanItems(plan: ContentPlan): Promise<ContentPlan> {
    // Fresh per-invocation context: alias/slug indexes are confined to this
    // single pass, so a long-lived singleton never serves stale aliases and
    // concurrent requests never share or clear each other's indexes.
    const ctx = this.createContext();
    const items: ContentPlanItem[] = [];
    for (const item of plan.items) {
      items.push(
        item.action === 'update' && !!item.entity_id
          ? item // already identity-stable; nothing to resolve
          : await this.annotateNewItem(ctx, item),
      );
    }
    return { ...plan, items };
  }

  private async annotateNewItem(ctx: ResolveContext, item: ContentPlanItem): Promise<ContentPlanItem> {
    const resolution = await this.resolveWithCtx(ctx, item.type, item.name, { description: item.description });
    const next: ContentPlanItem = { ...item, resolution };

    if (resolution.status === 'matched') {
      next.entity_id = resolution.entityId;
      // Point the item at the entity's canonical file slug before the action may
      // switch to `update`; otherwise staging would target the LLM's alias slug
      // (e.g. `marcus`) which may not match the canonical folder, and fail with
      // "Cannot update non-existent file".
      const canonicalSlug = await this.canonicalSlugFor(ctx, item.type, resolution.entityId);
      if (canonicalSlug && canonicalSlug !== next.slug) next.slug = canonicalSlug;

      const aliases = existingAliasesFor(item.type, await this.loadAliasIndex(ctx, item.type), resolution);
      if (aliases.length > 0) next.aliases = aliases;
      // A matched entity is a first-class content item; swap `create` for
      // `update` so the author is explicitly extending existing canon rather
      // than creating a duplicate.
      if (item.action !== 'update') next.action = 'update';
    } else if (resolution.status === 'new_candidate' && item.action === 'update') {
      // An outline-marked `update` that resolves to a brand-new candidate has no
      // existing entity to modify — reject the stale update by demoting it to a
      // `create` proposal so it is never staged against a non-existent path.
      next.action = 'create';
    }
    // `ambiguous` (and staying `create`) items keep their resolution attached and
    // are NOT flipped: Never set entity_id or change action on an unclear identity
    // — the author must resolve it first so nothing is silently merged.
    return next;
  }
}

export const identityResolver = new IdentityResolver();