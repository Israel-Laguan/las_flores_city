// ============================================================
// AICritiqueService — AI semantic critique (Moment 3 / M26)
//
// Orchestrates the critique loop:
//   1. Load the plan from Postgres.
//   2. Gather the existing-canon neighborhood (via the NeighborhoodProvider seam).
//   3. Build a deterministic input hash from (plan items + context + scope) so
//      unchanged subgraphs are not re-analyzed (annotation caching).
//   4. If (aiModel, inputHash) already has non-dismissed annotations → return cached.
//   5. Otherwise, call LLM → parse → persist → return new annotations.
//
// M26 persists to Postgres (`critique_annotations`). M27-b will swap the
// `NeighborhoodProvider` and also write graph nodes.
//
// Live overrides: authors can set annotation status to 'dismissed' (false-positive)
// via PATCH. M29's apply-delta will set 'addressed'.
// ============================================================

import crypto from 'node:crypto';
import { queryOLTP } from '@las-flores/infra';
import { createLLMProvider } from './LLMService.js';
import { postgresNeighborhoodProvider } from './NeighborhoodProvider.js';
import type { LLMProvider, CritiqueScopeType, ExistingContentContext } from './types/LLMTypes.js';
import type { CritiqueAnnotation, CritiqueAnnotationsResult } from '@las-flores/shared';

const LOG_PREFIX = '[AICritiqueService]';

/** Number of existing-context entries to include in the hash (keep stable). */
const HASH_CONTEXT_LIMIT = 500;

export class AICritiqueService {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider || createLLMProvider();
  }

  /**
   * Build a stable deterministic hash from the plan + context that will be sent
   * to the LLM. Two runs with identical canon produce the same hash; any edit to
   * plan items or a change in existing canon produces a different hash, triggering
   * a re-analyze.
   *
   * The context is sliced to HASH_CONTEXT_LIMIT items per category so a growing
   * canon does not cause constant cache misses for stable plans.
   */
  private buildInputHash(
    plan: { id: string; items: Array<{ id: string; name: string; type: string; action: string; fields?: any; slug?: string }> },
    context: ExistingContentContext,
    scope: CritiqueScopeType,
  ): string {
    const stable = {
      planId: plan.id,
      items: plan.items.map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        action: i.action,
        slug: i.slug,
        fields: i.fields ? JSON.parse(JSON.stringify(i.fields)) : null,
      })),
      context: {
        characters: context.characters.slice(0, HASH_CONTEXT_LIMIT).map((c) => `${c.id}:${c.name}`).sort(),
        scenes: context.scenes.slice(0, HASH_CONTEXT_LIMIT).map((s) => `${s.id}:${s.name}`).sort(),
        dialogues: context.dialogues.slice(0, HASH_CONTEXT_LIMIT).map((d) => `${d.id}:${d.name}`).sort(),
        missions: context.missions.slice(0, HASH_CONTEXT_LIMIT).map((m) => `${m.id}:${m.title}`).sort(),
        overlays: context.overlays.slice(0, HASH_CONTEXT_LIMIT).map((o) => `${o.id}:${o.name}`).sort(),
        locations: context.locations.slice(0, HASH_CONTEXT_LIMIT).map((l) => `${l.id}:${l.name}`).sort(),
      },
      scope,
    };
    return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  }

  /**
   * Run a full semantic critique.
   *
   * @param planId - the content plan to analyze
   * @param scope  - 'entity' (cheap per-item) | 'cross_entity' (deep full-plan)
   * @param opts   - forceReanalyze: ignore cache; neighborhood: optional override
   * @returns      - annotations + whether they came from cache
   */
  async runCritique(
    planId: string,
    scope: CritiqueScopeType = 'entity',
    opts: { forceReanalyze?: boolean; neighborhood?: ExistingContentContext } = {},
  ): Promise<CritiqueAnnotationsResult> {
    // 1. Load plan from DB
    const planResult = await queryOLTP<{ plan_json: any; description: string }>(
      'SELECT plan_json, description FROM content_plans WHERE id = $1',
      [planId],
    );
    if (planResult.rows.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const plan = planResult.rows[0].plan_json;
    if (!plan || !Array.isArray(plan.items)) {
      throw new Error(`Plan ${planId} has no items — nothing to critique`);
    }
    plan.description = planResult.rows[0].description;
    plan.id = planId;

    // 2. Gather canon context
    const context = opts.neighborhood ?? await postgresNeighborhoodProvider.gatherContext();

    // 3. Build input hash for caching
    const inputHash = this.buildInputHash(plan, context, scope);

    // 4. Check cache (skip if forceReanalyze)
    if (!opts.forceReanalyze) {
      const cached = await this.findCachedAnnotations(planId, scope, inputHash);
      if (cached) {
        console.log(`${LOG_PREFIX} Cache hit for plan ${planId} (scope=${scope}, hash=${inputHash.substring(0, 12)}…)`);
        return cached;
      }
      console.log(`${LOG_PREFIX} Cache miss for plan ${planId} (scope=${scope})`);
    }

    // 5. Call LLM
    const { annotations: rawAnnotations, usage } = await this.provider.analyzePlanForConflicts(
      plan,
      context,
      scope,
    );

    // Assign the correct input hash (the mock provider leaves inputHash empty)
    const annotations = rawAnnotations.map((a) => ({
      ...a,
      inputHash: a.inputHash || inputHash,
    }));

    console.log(`${LOG_PREFIX} LLM returned ${annotations.length} annotations for plan ${planId} (scope=${scope})`);

    // 6. Persist annotations
    await this.persistAnnotations(annotations);
    if (usage) {
      console.log(`${LOG_PREFIX} Usage: ${JSON.stringify(usage)}`);
    }

    return { annotations, cached: false, model: usage?.model || '' };
  }
  /**
   * Fetch all non-dismissed annotations for a plan, ordered by recency.
   */
  async getAnnotations(planId: string): Promise<CritiqueAnnotation[]> {
    const result = await queryOLTP<CritiqueAnnotation>(
      `SELECT id, type, severity, description, evidence, related_entities,
              scope, ai_model, input_hash, status, plan_id, item_ids, created_at
         FROM critique_annotations
        WHERE plan_id = $1 AND status <> 'dismissed'
        ORDER BY created_at DESC`,
      [planId],
    );
    return result.rows.map(r => this.rowToAnnotation(r));
  }

  /**
   * Fetch a single annotation by id.
   */
  async getAnnotation(annotationId: string): Promise<CritiqueAnnotation | null> {
    const result = await queryOLTP<CritiqueAnnotation>(
      `SELECT id, type, severity, description, evidence, related_entities,
              scope, ai_model, input_hash, status, plan_id, item_ids, created_at
         FROM critique_annotations
        WHERE id = $1`,
      [annotationId],
    );
    return result.rows.length > 0 ? this.rowToAnnotation(result.rows[0]) : null;
  }

  /**
   * Live override: update the status of an annotation.
   * 'dismissed' = author judges false-positive (M26). 'addressed' is set by M29.
   */
  async setAnnotationStatus(annotationId: string, status: 'open' | 'addressed' | 'dismissed'): Promise<void> {
    const result = await queryOLTP(
      `UPDATE critique_annotations SET status = $1 WHERE id = $2`,
      [status, annotationId],
    );
    if (result.rowCount === 0) {
      throw new Error(`Annotation not found: ${annotationId}`);
    }
  }

  /**
   * Clear annotations for a plan (removes cache entries, forces re-analyze).
   */
  async clearAnnotations(planId: string): Promise<void> {
    await queryOLTP(
      `DELETE FROM critique_annotations WHERE plan_id = $1`,
      [planId],
    );
  }

  /**
   * Find cached annotations for a (plan, scope, inputHash) combo.
   * Returns null when no cache hit exists (caller runs the LLM).
   */
  private async findCachedAnnotations(
    planId: string,
    scope: string,
    inputHash: string,
  ): Promise<CritiqueAnnotationsResult | null> {
    const result = await queryOLTP<{ id: string; ai_model: string; created_at: any }>(
      `SELECT id, ai_model, created_at
         FROM critique_annotations
        WHERE plan_id = $1
          AND scope = $2
          AND input_hash = $3
          AND status <> 'dismissed'
        LIMIT 1`,
      [planId, scope, inputHash],
    );
    if (result.rows.length === 0) return null;

    // Cache hit — return existing annotations directly
    const annotations = await this.getAnnotations(planId);
    return {
      annotations,
      cached: true,
      model: result.rows[0].ai_model,
    };
  }

  /**
   * Persist annotation rows to the critique_annotations table.
   */
  private async persistAnnotations(annotations: CritiqueAnnotation[]): Promise<void> {
    for (const annotation of annotations) {
      await queryOLTP(
        `INSERT INTO critique_annotations
           (id, type, severity, description, evidence, related_entities,
            scope, ai_model, input_hash, status, plan_id, item_ids, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          annotation.id,
          annotation.type,
          annotation.severity,
          annotation.description,
          JSON.stringify(annotation.evidence || []),
          JSON.stringify(annotation.relatedEntities || []),
          annotation.scope,
          annotation.aiModel,
          annotation.inputHash,
          annotation.status,
          annotation.planId,
          // item_ids as a Postgres text array literal
          `{${(annotation.itemIds || []).map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',')}}`,
          annotation.createdAt,
        ],
      );
    }
    console.log(`${LOG_PREFIX} Persisted ${annotations.length} annotations`);
  }

  /**
   * Convert a raw DB row to a typed CritiqueAnnotation.
   */
  private rowToAnnotation(row: any): CritiqueAnnotation {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      description: row.description,
      evidence: typeof row.evidence === 'string' ? JSON.parse(row.evidence) : (row.evidence || []),
      relatedEntities: typeof row.related_entities === 'string'
        ? JSON.parse(row.related_entities)
        : (row.related_entities || []),
      scope: row.scope,
      aiModel: row.ai_model,
      inputHash: row.input_hash,
      status: row.status,
      planId: row.plan_id,
      itemIds: Array.isArray(row.item_ids) ? row.item_ids as string[] : [],
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    };
  }
}

/** Singleton export for route handlers. */
export const aiCritiqueService = new AICritiqueService();

