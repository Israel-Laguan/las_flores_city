import type {
  ContentPlan,
  ContentPlanItem,
  HarnessFinding,
  HarnessReport,
} from '@las-flores/shared';
import type { ExistingContentContext } from './types/LLMTypes.js';

/**
 * Deterministic validation harness (M20 / ARCHITECTURE_SEPARATION_ANALYSIS §15.5).
 *
 * Cheap, reproducible rules the LLM can't be trusted to do faithfully: duplicate
 * slug/name detection, timeline overlap, foreign-key integrity, and
 * ordering/succession. Runs as a pre-approve gate inside `approveAndSolidifyPlan`
 * **before** staging. `passed` is false iff any finding has severity === 'error';
 * warnings never block.
 *
 * The harness is strictly deterministic — it performs no LLM calls and no I/O
 * beyond the `ExistingContentContext` supplied by the caller. It is unit-testable
 * purely from `(plan, context)`.
 */

export function runValidationHarness(
  plan: ContentPlan,
  context: ExistingContentContext,
): HarnessReport {
  const findings: HarnessFinding[] = [];
  findings.push(...checkDuplicateSlugOrName(plan, context));
  findings.push(...checkTimelineOverlap(plan));
  findings.push(...checkForeignKeyIntegrity(plan, context));
  findings.push(...checkOrderingSuccession(plan));

  const hasErrors = findings.some((f) => f.severity === 'error');
  return { passed: !hasErrors, findings };
}

/** Normalize a name/slug for collision detection (case-insensitive, punctuation-insensitive). */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Rule: duplicate slug/name.
 * - Identical normalized names within the plan → `error` (would silently collide).
 * - A `create` item whose normalized name matches an existing entity of the SAME
 *   content type → `error`. Matching a different type → `warning` (advisory).
 */
function checkDuplicateSlugOrName(
  plan: ContentPlan,
  context: ExistingContentContext,
): HarnessFinding[] {
  const findings: HarnessFinding[] = [];

  // Within-plan name collisions.
  const byName = new Map<string, ContentPlanItem[]>();
  for (const item of plan.items) {
    const key = normalize(item.name || '');
    if (!key) continue;
    const arr = byName.get(key) ?? [];
    arr.push(item);
    byName.set(key, arr);
  }
  for (const [name, items] of byName) {
    if (items.length > 1) {
      findings.push({
        code: 'duplicate_slug_or_name',
        severity: 'error',
        message: `Duplicate item name "${items[0].name}" (normalized "${name}") appears ${items.length} times in the plan.`,
        itemIds: items.map((i) => i.id),
      });
    }
  }

  // Within-plan slug collisions (slug drives on-disk file names). Only flag when
  // the colliding items have distinct names — identical name+slug is already
  // reported by the name check above, so we avoid double-reporting one cause.
  const bySlug = new Map<string, ContentPlanItem[]>();
  for (const item of plan.items) {
    const key = normalize(item.slug ?? '');
    if (!key) continue;
    const arr = bySlug.get(key) ?? [];
    arr.push(item);
    bySlug.set(key, arr);
  }
  for (const [slug, items] of bySlug) {
    if (items.length > 1 && new Set(items.map((i) => normalize(i.name || ''))).size > 1) {
      findings.push({
        code: 'duplicate_slug_or_name',
        severity: 'error',
        message: `Duplicate item slug "${slug}" appears ${items.length} times in the plan.`,
        itemIds: items.map((i) => i.id),
      });
    }
  }
  // create-vs-existing collisions keyed by (type -> normalized name).
  const existingByType = existingEntitiesByType(context);
  for (const item of plan.items) {
    if (item.action !== 'create') continue;
    const key = normalize(item.name || '');
    if (!key) continue;
    const sameType = existingByType.get(item.type)?.get(key);
    if (sameType) {
      findings.push({
        code: 'duplicate_slug_or_name',
        severity: 'error',
        message: `"${item.name}" (${item.type}) matches an existing ${item.type} "${sameType}".`,
        itemIds: [item.id],
      });
      continue;
    }
    // Different type collision — advisory.
    for (const [type, names] of existingByType) {
      if (type === item.type) continue;
      if (names.has(key)) {
        findings.push({
          code: 'duplicate_slug_or_name',
          severity: 'warning',
          message: `"${item.name}" (${item.type}) shares a name with an existing ${type} "${names.get(key)}". Confirm this is intentional.`,
          itemIds: [item.id],
        });
        break;
      }
    }
  }

  return findings;
}

/** Build a map of existing entity type -> normalized name -> display name. */
function existingEntitiesByType(context: ExistingContentContext): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  const add = (type: string, name: string) => {
    if (!name) return;
    const key = normalize(name);
    let inner = map.get(type);
    if (!inner) {
      inner = new Map();
      map.set(type, inner);
    }
    if (!inner.has(key)) inner.set(key, name);
  };
  context.characters.forEach((c) => add('character', c.name));
  context.scenes.forEach((s) => add('scene', s.name));
  context.dialogues.forEach((d) => add('dialogue', d.name));
  context.missions.forEach((m) => add('mission', m.title));
  context.overlays.forEach((o) => add('overlay', o.name));
  context.locations.forEach((l) => add('location', l.name));
  return map;
}

// ── Timeline overlap ────────────────────────────────────────────────────────

interface Range {
  item: ContentPlanItem;
  start: number;
  end: number;
}

/**
 * Best-effort parse of a timeline-bearing field into a numeric [start, end]
 * range. Recognizes `period` ("2077-2078"), `start`/`end`, `born`/`died`,
 * `coversFrom`/`coversTo`, `year`/`date`. Returns null when unparseable.
 */
function parseRange(item: ContentPlanItem): Range | null {
  const f = item.fields as Record<string, any>;
  const tryYear = (v: unknown): number | null => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const m = v.match(/\b(19|20)\d{2}\b/);
      if (m) return parseInt(m[0], 10);
    }
    return null;
  };

  let start: number | null = null;
  let end: number | null = null;

  const period = f.period;
  if (typeof period === 'string') {
    const m = period.match(/\b(19|20)\d{2}\b/g);
    if (m && m.length >= 1) {
      start = parseInt(m[0], 10);
      end = m.length >= 2 ? parseInt(m[1], 10) : start;
    }
  }

  if (start === null) start = tryYear(f.start) ?? tryYear(f.born) ?? tryYear(f.coversFrom) ?? tryYear(f.year);
  if (end === null) end = tryYear(f.end) ?? tryYear(f.died) ?? tryYear(f.coversTo) ?? start;

  if (start === null || end === null) return null;
  if (end < start) [start, end] = [end, start];
  return { item, start, end };
}

/**
 * Rule: timeline overlap. Flag overlapping numeric ranges among plan items.
 * - If the overlapping items share an explicit relationship (same district, or one
 *   references the other via `dependsOn`/`lore_refs`) → `error`.
 * - Otherwise → `warning` (potential, cannot confirm).
 */
function checkTimelineOverlap(plan: ContentPlan): HarnessFinding[] {
  const findings: HarnessFinding[] = [];
  const ranges = plan.items.map(parseRange).filter((r): r is Range => r !== null);
  if (ranges.length < 2) return findings;

  // Bound the number of unrelated (advisory) overlap warnings so a plan with
  // many dated items can't emit O(n²) noise to the admin UI. Related overlaps
  // are real errors and are never capped.
  const MAX_UNRELATED_OVERLAP_WARNINGS = 50;
  let unrelatedWarnings = 0;

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      const overlap = Math.min(a.end, b.end) >= Math.max(a.start, b.start);
      if (!overlap) continue;

      const related =
        (a.item.dependsOn ?? []).includes(b.item.id) ||
        (b.item.dependsOn ?? []).includes(a.item.id) ||
        (a.item.lore_refs ?? []).some((r) => (b.item.lore_refs ?? []).includes(r)) ||
        (asRecord(a.item.fields).district && asRecord(a.item.fields).district === asRecord(b.item.fields).district);

      if (related) {
        findings.push({
          code: 'timeline_overlap',
          severity: 'error',
          message: `Timeline overlap: "${a.item.name}" (${a.start}-${a.end}) and "${b.item.name}" (${b.start}-${b.end}) clash and are related.`,
          itemIds: [a.item.id, b.item.id],
        });
      } else {
        if (unrelatedWarnings >= MAX_UNRELATED_OVERLAP_WARNINGS) continue;
        unrelatedWarnings++;
        findings.push({
          code: 'timeline_overlap',
          severity: 'warning',
          message: `Potential timeline overlap: "${a.item.name}" (${a.start}-${a.end}) and "${b.item.name}" (${b.start}-${b.end}).`,
          itemIds: [a.item.id, b.item.id],
        });
      }
    }
  }

  return findings;
}

function asRecord(v: unknown): Record<string, any> {
  return v && typeof v === 'object' ? (v as Record<string, any>) : {};
}

// ── Foreign-key integrity ───────────────────────────────────────────────────

/** Collect every entity id known to exist in the supplied context. */
function existingEntityIds(context: ExistingContentContext): Set<string> {
  const ids = new Set<string>();
  context.characters.forEach((c) => ids.add(c.id));
  context.scenes.forEach((s) => ids.add(s.id));
  context.dialogues.forEach((d) => ids.add(d.id));
  context.missions.forEach((m) => ids.add(m.id));
  context.overlays.forEach((o) => ids.add(o.id));
  context.locations.forEach((l) => ids.add(l.id));
  return ids;
}

/**
 * Rule: foreign-key integrity.
 * - `dependsOn` ids must resolve to a plan item or an existing entity.
 * - overlay `target_tree_id` must reference an existing/planned dialogue.
 * - scene `district` should match a known district string (warning when unknown).
 */
function checkForeignKeyIntegrity(
  plan: ContentPlan,
  context: ExistingContentContext,
): HarnessFinding[] {
  const findings: HarnessFinding[] = [];
  const planItemIds = new Set(plan.items.map((i) => i.id));
  const existingIds = existingEntityIds(context);
  // Built once up-front (not per scene item) so construction cost is O(1) per plan.
  const knownDistricts = new Set(context.scenes.map((s) => s.district).filter(Boolean));

  for (const item of plan.items) {
    for (const depId of item.dependsOn ?? []) {
      if (planItemIds.has(depId) || existingIds.has(depId)) continue;
      findings.push({
        code: 'foreign_key_integrity',
        severity: 'error',
        message: `Item "${item.name}" dependsOn "${depId}" which is neither a plan item nor an existing entity.`,
        itemIds: [item.id],
      });
    }

    const f = asRecord(item.fields);
    if (item.type === 'overlay') {
      const target = f.target_tree_id;
      if (target && !planItemIds.has(String(target)) && !existingIds.has(String(target))) {
        findings.push({
          code: 'foreign_key_integrity',
          severity: 'error',
          message: `Overlay "${item.name}" references unknown target_tree_id "${target}".`,
          itemIds: [item.id],
        });
      }
    }

    if (item.type === 'scene' && f.district) {
      if (!knownDistricts.has(String(f.district))) {
        findings.push({
          code: 'foreign_key_integrity',
          severity: 'warning',
          message: `Scene "${item.name}" references unknown district "${f.district}".`,
          itemIds: [item.id],
        });
      }
    }
  }

  return findings;
}

// ── Ordering / succession ───────────────────────────────────────────────────

/**
 * Rule: ordering/succession. Reject self-dependencies and cyclic dependency
 * chains (a `dependsOn` graph must be a DAG).
 */
function checkOrderingSuccession(plan: ContentPlan): HarnessFinding[] {
  const findings: HarnessFinding[] = [];
  const byId = new Map(plan.items.map((i) => [i.id, i]));

  for (const item of plan.items) {
    const deps = item.dependsOn ?? [];
    if (deps.includes(item.id)) {
      findings.push({
        code: 'ordering_succession',
        severity: 'error',
        message: `Item "${item.name}" depends on itself.`,
        itemIds: [item.id],
      });
    }
  }

  // Cycle detection over the plan-local dependency graph (only edges between plan items).
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: ContentPlanItem[] = [];

  for (const item of plan.items) color.set(item.id, WHITE);

  const visit = (item: ContentPlanItem): void => {
    color.set(item.id, GRAY);
    stack.push(item);
    for (const depId of item.dependsOn ?? []) {
      if (depId === item.id) continue; // self-dependency already reported above
      const dep = byId.get(depId);
      if (!dep) continue; // external/existing dependency — not part of the plan graph
      const depColor = color.get(depId);
      if (depColor === WHITE) {
        visit(dep);
      } else if (depColor === GRAY) {
        const cycle = [...stack.map((i) => i.name), dep.name].join(' → ');
        findings.push({
          code: 'ordering_succession',
          severity: 'error',
          message: `Circular dependency detected: ${cycle}.`,
          itemIds: stack.map((i) => i.id),
        });
      }
    }
    stack.pop();
    color.set(item.id, BLACK);
  };

  for (const item of plan.items) {
    if (color.get(item.id) === WHITE) visit(item);
  }

  return findings;
}