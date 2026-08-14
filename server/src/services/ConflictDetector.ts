// ============================================================
// ConflictDetector - bounded, neighborhood-scoped conflict detection (M25)
//
// §15.6: never aim to find *all* contradictions (unbounded). Run targeted,
// per-entity-type checks scoped to the patch's neighborhood (nearby timeline,
// same location, same lineage) and record an honest "checked scope" per job so
// "how much did we check?" is answerable.
//
// This layer is distinct from:
//   * `PlanVerificationService.verifyPlanCrossReferences` — deterministic
//     FK/path/asset checks (the §15.5 harness), and
//   * `LLMProvider.analyzeIntakeConflicts` — Moment-1 LLM surface scan.
// Each rule records the entity ids it actually examined in its CheckedScope;
// rules never panic the whole report on a missing neighborhood (best-effort,
// scope reflects exactly what was (not) checked).
// ============================================================

import type { ContentPlan, ContentPlanItem, CheckedScope, BoundedConflict, ConflictReport } from '@las-flores/shared';
import { ConflictReportSchema } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';

export type ConflictRuleName = 'location_conflict' | 'timeline_overlap' | 'lineage_conflict';

/** Neighborhood inputs shared across the per-rule checks. */
interface RuleResult {
  scope: CheckedScope;
  findings: BoundedConflict[];
}

interface SceneNeighborhood {
  district: string;
  sceneId: string;
}

interface BeatWindow {
  slug: string;
  order: number;
}

/** Normalize a text district/name for bounded comparisons (case-insensitive). */
function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * Build the timeline neighborhood (story-beat order) best-effort from the DB.
 * Returns `null` when beats are unavailable (query failure) so the caller can
 * report the timeline scope as unavailable rather than as having no references.
 */
async function loadBeatWindows(): Promise<BeatWindow[] | null> {
  try {
    // `story_beats` orders by the quoted `"order"` column (migration 044).
    const result = await queryOLTP<{ slug: string; order: number }>(
      `SELECT slug, "order" FROM story_beats ORDER BY "order" ASC`,
      [],
    );
    return result.rows.map((r) => ({ slug: r.slug, order: r.order }));
  } catch {
    return null;
  }
}

export class ConflictDetector {
  /**
   * Run the bounded neighborhood-scoped checks over a plan's items, build a
   * `ConflictReport` recording the honest checked-scope per rule, and persist
   * it to the `conflict_reports` table. Returns the report.
   */
  async detectConflicts(
    plan: ContentPlan,
    opts: { patchId?: string | null } = {},
  ): Promise<ConflictReport> {
    const checkedAt = new Date().toISOString();

    const [location, timeline, lineage] = await Promise.all([
      this.checkLocationConflicts(plan, checkedAt),
      this.checkTimelineOverlaps(plan, checkedAt),
      this.checkLineageConflicts(plan, checkedAt),
    ]);

    const checkedScopes = [location.scope, timeline.scope, lineage.scope]
      .filter((s) => s.entityIdsChecked.length > 0 || s.scopeDescriptor.length > 0);
    const findings = [...location.findings, ...timeline.findings, ...lineage.findings];

    const report = ConflictReportSchema.parse({
      planId: plan.id,
      patchId: opts.patchId ?? null,
      checkedAt,
      passed: findings.every((f) => f.severity === 'warning'),
      checkedScopes,
      findings,
    });

    await this.persistReport(report);
    return report;
  }

  /**
   * location_conflict — a resolved character appears in a scene item whose
   * district differs from the character's home district within the patch
   * neighborhood. Bounded to the scenes/characters referenced by this plan.
   */
  private async checkLocationConflicts(plan: ContentPlan, checkedAt: string): Promise<RuleResult> {
    const sceneItems = plan.items.filter((i) => i.type === 'scene');

    // Character home districts + entity ids for resolution provenance. Index by
    // BOTH the display name and the entity_id so scene items that reference the
    // character via the supported `character_id` form still find the home.
    const charHome = new Map<string, { entityId?: string; homeDistrict: string }>();
    for (const it of plan.items) {
      if (it.type !== 'character') continue;
      const raw = String(it.fields?.district ?? '').trim();
      const home = norm(raw);
      if (!home) continue;
      const entry = { entityId: it.entity_id, homeDistrict: raw };
      charHome.set(norm(it.name), entry);
      if (it.entity_id) charHome.set(norm(it.entity_id), entry);
    }

    // Neighborhood: every scene item in the plan.
    const neighborhood: SceneNeighborhood[] = sceneItems.map((it) => ({
      district: norm(it.fields?.district),
      sceneId: it.entity_id ?? it.id,
    }));

    const findings: BoundedConflict[] = [];
    for (const scene of sceneItems) {
      const rawSceneDistrict = String(scene.fields?.district ?? '').trim();
      const sceneDistrict = norm(rawSceneDistrict);
      if (!sceneDistrict) continue;
      const refs = sceneRefs(scene);
      for (const refName of refs) {
        const home = charHome.get(norm(refName));
        if (!home) continue;
        const refDistrict = norm(home.homeDistrict);
        // Compare normalized values — a case/whitespace variant of the same
        // district is not a conflict.
        if (!refDistrict || refDistrict === sceneDistrict) continue;
        findings.push({
          rule: 'location_conflict',
          severity: 'warning',
          description: `Character "${refName}" has home district "${home.homeDistrict}" but appears in scene "${scene.name}" in district "${rawSceneDistrict}".`,
          entityRefs: [home.entityId, scene.entity_id].filter((x): x is string => !!x),
          itemIds: [scene.id],
          hitByCheckedScope: true,
        });
      }
    }

    return {
      scope: {
        entityType: 'character',
        rule: 'location_conflict',
        scopeDescriptor: `scenes in plan (${neighborhood.length})`,
        entityIdsChecked: [...neighborhood.map((n) => n.sceneId as any), ...Array.from(charHome.values()).map((c) => c.entityId as any)].filter(Boolean),
        checkedAt,
      },
      findings,
    };
  }
  /**
   * timeline_overlap — two scene items reference the same story-beat order,
   * meaning they'd load into the same narrative moment. Bounded to beats
   * reachable from this plan.
   */
  private async checkTimelineOverlaps(plan: ContentPlan, checkedAt: string): Promise<RuleResult> {
    const referenced = new Set<string>();
    for (const it of plan.items) {
      for (const ref of collectBeatRefs(it)) {
        referenced.add(ref);
      }
    }

    const beats = await loadBeatWindows();

    if (beats === null) {
      // The timeline neighborhood could not be loaded — report the scope as
      // unavailable rather than pretending the plan references no beats.
      return {
        scope: {
          entityType: 'scene',
          rule: 'timeline_overlap',
          scopeDescriptor: 'story-beat timeline unavailable (query error)',
          entityIdsChecked: [],
          checkedAt,
        },
        findings: [],
      };
    }

    const orderBySlug = new Map(beats.map((b) => [b.slug, b.order]));
    const reachable = beats.filter((b) => referenced.has(b.slug));

    if (reachable.length === 0) {
      return {
        scope: {
          entityType: 'scene',
          rule: 'timeline_overlap',
          scopeDescriptor: 'no story-beats referenced by plan',
          entityIdsChecked: [],
          checkedAt,
        },
        findings: [],
      };
    }

    const sceneItems = plan.items.filter((i) => i.type === 'scene');
    const scenesByOrder = new Map<number, ContentPlanItem[]>();
    for (const it of sceneItems) {
      for (const ref of collectBeatRefs(it)) {
        const order = orderBySlug.get(ref);
        if (order === undefined) continue;
        const list = scenesByOrder.get(order) ?? [];
        list.push(it);
        scenesByOrder.set(order, list);
      }
    }

    const findings: BoundedConflict[] = [];
    for (const [order, items] of scenesByOrder) {
      if (items.length > 1) {
        findings.push({
          rule: 'timeline_overlap',
          severity: 'warning',
          description: `Multiple scenes tied to the same story-beat (order ${order}): ${items.map((i) => i.name).join(', ')}.`,
          entityRefs: items.map((i) => i.entity_id as any).filter(Boolean),
          itemIds: items.map((i) => i.id),
          hitByCheckedScope: true,
        });
      }
    }

    return {
      scope: {
        entityType: 'scene',
        rule: 'timeline_overlap',
        scopeDescriptor: `story-beats reachable from plan (${reachable.length})`,
        entityIdsChecked: reachable.map((b) => b.slug as any),
        checkedAt,
      },
      findings,
    };
  }

  /**
   * lineage_conflict — two characters claim the same exclusive relationship
   * slot (spouse/partner/sibling) to the same target entity. Bounded to the
   * plan's character items.
   */
  private checkLineageConflicts(plan: ContentPlan, checkedAt: string): RuleResult {
    const charItems = plan.items.filter((i) => i.type === 'character');

    const claims = new Map<string, Map<string, { item: ContentPlanItem; display: string }>>();

    for (const it of charItems) {
      const rels = it.fields?.relationships;
      if (!Array.isArray(rels)) continue;
      for (const rel of rels) {
        const slot = String(rel?.type ?? rel?.label ?? '').toLowerCase();
        const rawTarget = String(rel?.character_id ?? rel?.name ?? '');
        if (!EXCLUSIVE_SLOTS.has(slot) || !norm(rawTarget)) continue;
        const byTarget = claims.get(slot) ?? new Map();
        const key = norm(rawTarget);
        if (!byTarget.has(key)) byTarget.set(key, { item: it, display: rawTarget });
        claims.set(slot, byTarget);
      }
    }

    const findings: BoundedConflict[] = [];
    for (const [slot, byTarget] of claims) {
      for (const [targetKey, claim] of byTarget) {
        const contenders = charItems.filter((c) =>
          Array.isArray(c.fields?.relationships) &&
          (c.fields!.relationships as any[]).some(
            (r) => String(r?.type ?? r?.label ?? '').toLowerCase() === slot &&
              norm(r?.character_id ?? r?.name ?? '') === targetKey,
          ),
        );
        if (contenders.length > 1) {
          findings.push({
            rule: 'lineage_conflict',
            severity: 'error',
            description: `Multiple characters claim ${slot} to "${claim.display}": ${contenders.map((c) => c.name).join(', ')}.`,
            entityRefs: contenders.map((c) => c.entity_id as any).filter(Boolean),
            itemIds: contenders.map((c) => c.id),
            hitByCheckedScope: true,
          });
        }
      }
    }

    return {
      scope: {
        entityType: 'character',
        rule: 'lineage_conflict',
        scopeDescriptor: `characters in plan (${charItems.length})`,
        entityIdsChecked: charItems.map((c) => c.entity_id as any).filter(Boolean),
        checkedAt,
      },
      findings,
    };
  }

  /** Best-effort persist of the report; never throws to callers. */
  private async persistReport(report: ConflictReport): Promise<void> {
    try {
      await queryOLTP(
        `INSERT INTO conflict_reports (plan_id, patch_id, checked_scope, findings, passed)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          report.planId,
          report.patchId ?? null,
          JSON.stringify(report.checkedScopes),
          JSON.stringify(report.findings),
          report.passed,
        ],
      );
    } catch {
      // Best-effort: a persistence failure must never fail verification. The
      // in-memory report already carries the honest checked scope for callers.
    }
  }
}

// Relationship types that are implicitly exclusive (monogamous lineage). Note
// `sibling` is intentionally NOT exclusive — a character may legitimately have
// many siblings, so multi-sibling families must not be flagged as conflicts.
const EXCLUSIVE_SLOTS = new Set(['spouse', 'partner', 'mother', 'father', 'patron']);

/** Extract story-beat slugs an item references (fields + lore_refs). */
function collectBeatRefs(item: ContentPlanItem): string[] {
  const out: string[] = [];
  const refs = [item.lore_refs, item.fields?.story_beat, item.fields?.beats];
  for (const ref of refs) {
    if (Array.isArray(ref)) {
      for (const r of ref) {
        if (typeof r === 'string') out.push(r.replace(/^beat[:/]/, '').replace(/_beat$/, ''));
      }
    } else if (typeof ref === 'string') {
      out.push(ref.replace(/^beat[:/]/, '').replace(/_beat$/, ''));
    }
  }
  return out;
}

/** Extract character names a scene item references (fields.characters | fields.character_id). */
function sceneRefs(scene: ContentPlanItem): string[] {
  const out: string[] = [];
  const chars = scene.fields?.characters;
  if (Array.isArray(chars)) {
    for (const c of chars) {
      if (typeof c === 'string') out.push(c);
      else if (typeof c === 'object' && c && typeof c.name === 'string') out.push(c.name);
    }
  }
  if (typeof scene.fields?.character_id === 'string') out.push(scene.fields.character_id as string);
  return out;
}

export const conflictDetector = new ConflictDetector();