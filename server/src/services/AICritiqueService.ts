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
import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import { createLLMProvider } from './LLMService.js';
import { boundedPlanItems, serializeCritiqueContext } from './LLMPrompts.js';
import type { LLMProvider, CritiqueScopeType, ExistingContentContext } from './types/LLMTypes.js';
import type { CritiqueAnnotation, CritiqueAnnotationsResult, ContentPlan } from '@las-flores/shared';
import { postgresNeighborhoodProvider, neo4jNeighborhoodProvider, type NeighborhoodProvider } from './NeighborhoodProvider.js';
import { isNeo4jEnabled } from './Neo4jClient.js';
import { graphCritiqueService, type GraphCritiqueService } from './GraphCritiqueService.js';

const LOG_PREFIX = '[AICritiqueService]';

export class AICritiqueService {
  private provider: LLMProvider;
  private neighborhoodProvider: NeighborhoodProvider;
  private graph: GraphCritiqueService;

  constructor(provider?: LLMProvider, graph?: GraphCritiqueService) {
    this.provider = provider || createLLMProvider();
    this.graph = graph ?? graphCritiqueService;
    // M27-b: swap the neighborhood seam to the Neo4j traversal when the authoring
    // graph is enabled; Postgres gatherer remains the default/fallback.
    this.neighborhoodProvider = isNeo4jEnabled() ? neo4jNeighborhoodProvider : postgresNeighborhoodProvider;
  }

  /**
   * Build a stable deterministic hash from the exact inputs sent to the LLM.
   *
   * The hash mirrors the prompt serialization used by `buildSemanticCritiquePrompt`
   * (same bounded plan items + same canonical-context fields), so any edit to a
   * plan item or a change in existing canon — including canon *fields* such as a
   * character's role — changes the hash and triggers a re-analyze instead of
   * returning stale cached annotations. Every context entry is included (no
   * per-category cap) so adding a canon entity also invalidates the cache.
   *
   * `itemCount` (total plan items) is included even though only the first
   * PLAN_ITEM_CAP items are serialized — adding or removing an omitted item
   * changes the prompt (the "[N additional item(s) omitted]" note) but would
   * not change the hash without this field, causing stale cache hits.
   */
  private buildInputHash(
    plan: { id: string; items: Array<any>; description?: string },
    context: ExistingContentContext,
    scope: CritiqueScopeType,
  ): string {
    const stable = {
      plan: {
        id: plan.id,
        description: plan.description,
        items: boundedPlanItems(plan.items as any[]),
        itemCount: plan.items.length,
      },
      context: serializeCritiqueContext(context),
      scope,
    };
    return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  }

  /**
   * Run a full semantic critique.
   *
   * @param planId - the content plan to analyze
   * @param scope  - 'entity' (cheap per-item) | 'cross_entity' (deep full-plan) | 'cross_mission'
   * @param opts   - forceReanalyze: ignore cache; neighborhood: optional override;
   *                 planJson: validated plan (e.g. from the admin's unsaved edits);
   *                 when provided, the plan is used directly instead of loading
   *                 plan_json from the DB, so unsaved edits are critiqued.
   * @returns      - annotations + whether they came from cache
   */
  async runCritique(
    planId: string,
    scope: CritiqueScopeType = 'entity',
    opts: { forceReanalyze?: boolean; neighborhood?: ExistingContentContext; planJson?: ContentPlan } = {},
  ): Promise<CritiqueAnnotationsResult> {
    let plan: any;

    if (opts.planJson) {
      // Use the author's validated plan directly (may contain unsaved edits).
      plan = opts.planJson;
      plan.id = planId;
    } else {
      // 1. Load plan from DB
      const planResult = await queryOLTP<{ plan_json: any; description: string }>(
        'SELECT plan_json, description FROM content_plans WHERE id = $1',
        [planId],
      );
      if (planResult.rows.length === 0) {
        throw new Error(`Plan not found: ${planId}`);
      }

      const row = planResult.rows[0];
      plan = row.plan_json;
      if (!plan || !Array.isArray(plan.items)) {
        throw new Error(`Plan ${planId} has no items — nothing to critique`);
      }
      plan.description = row.description;
      plan.id = planId;
    }

    // 2. Gather canon context
    const context = opts.neighborhood ?? await this.neighborhoodProvider.gatherContext();

    // 3. Build input hash for caching
    const inputHash = this.buildInputHash(plan, context, scope);
    // The model the LLM will actually use for this scope (deep-model split).
    // It is part of the cache key so a model change forces a re-analyze.
    const model = this.provider.critiqueModel(scope);

    // 4. Check cache (skip if forceReanalyze)
    if (!opts.forceReanalyze) {
      // M27-b: when the graph is enabled the `(ai_model, input_hash)` cache is
      // served from the graph; otherwise the Postgres marker/row path is used.
      const cached = isNeo4jEnabled()
        ? await this.graph.findCached(planId, scope, inputHash, model)
        : await this.findCachedAnnotations(planId, scope, inputHash, model);
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

    // Always stamp the service's computed input hash — the model never controls it.
    const annotations = rawAnnotations.map((a) => ({
      ...a,
      inputHash,
    }));

    console.log(`${LOG_PREFIX} LLM returned ${annotations.length} annotations for plan ${planId} (scope=${scope})`);

    // 6. Persist annotations (or a cache marker when the plan is clean)
    await this.persistAnnotations(annotations, { planId, scope, inputHash, model });
    if (usage) {
      console.log(`${LOG_PREFIX} Usage: ${JSON.stringify(usage)}`);
    }

    return { annotations, cached: false, model: usage?.model || model };
  }
  /**
   * Postgres path for getAnnotations (durable source of truth / fallback).
   * Cache markers (clean-plan runs) are excluded — they are internal to the
   * cache, never shown to authors.
   */
  private async postgresGetAnnotations(planId: string): Promise<CritiqueAnnotation[]> {
    const result = await queryOLTP<Record<string, unknown>>(
      `SELECT id, type, severity, description, evidence, related_entities,
               scope, ai_model, input_hash, status, plan_id, item_ids, created_at
          FROM critique_annotations
         WHERE plan_id = $1 AND status <> 'dismissed' AND is_marker = FALSE
         ORDER BY created_at DESC`,
      [planId],
    );
    return result.rows.map(r => this.rowToAnnotation(r));
  }

  /**
   * M27-b: read annotations for a plan. When the authoring graph is enabled the
   * admin overlays read the graph; on a graph failure we degrade to the durable
   * Postgres rows rather than surfacing an error.
   */
  async getAnnotations(planId: string): Promise<CritiqueAnnotation[]> {
    if (!isNeo4jEnabled()) return this.postgresGetAnnotations(planId);
    try {
      return await this.graph.getAnnotations(planId);
    } catch (err) {
      console.warn('[AICritiqueService] graph read degraded to Postgres:', (err as Error).message);
      return this.postgresGetAnnotations(planId);
    }
  }

  /**
   * Fetch a single annotation by id. Graph-backed when enabled, Postgres fallback.
   */
  private async postgresGetAnnotation(annotationId: string): Promise<CritiqueAnnotation | null> {
    const result = await queryOLTP<Record<string, unknown>>(
      `SELECT id, type, severity, description, evidence, related_entities,
              scope, ai_model, input_hash, status, plan_id, item_ids, created_at
         FROM critique_annotations
        WHERE id = $1`,
      [annotationId],
    );
    return result.rows.length > 0 ? this.rowToAnnotation(result.rows[0]) : null;
  }

  /**
   * Fetch a single annotation by id. Graph-backed when enabled, Postgres fallback.
   */
  async getAnnotation(annotationId: string): Promise<CritiqueAnnotation | null> {
    if (!isNeo4jEnabled()) return this.postgresGetAnnotation(annotationId);
    try {
      return await this.graph.getAnnotation(annotationId);
    } catch (err) {
      console.warn('[AICritiqueService] graph read degraded to Postgres:', (err as Error).message);
      return this.postgresGetAnnotation(annotationId);
    }
  }

  /**
   * Live override: update the status of an annotation.
   * 'dismissed' = author judges false-positive (M26). 'addressed' is set by M29
   * (and mirrored as `markAddressed` on the graph in M27-b).
   */
  async setAnnotationStatus(annotationId: string, status: 'open' | 'addressed' | 'dismissed'): Promise<void> {
    const result = await queryOLTP(
      `UPDATE critique_annotations SET status = $1 WHERE id = $2`,
      [status, annotationId],
    );
    if (result.rowCount === 0) {
      throw new Error(`Annotation not found: ${annotationId}`);
    }
    // M27-b: keep the graph conflict in sync (best-effort; a stale graph status
    // is rebuildable from the durable Postgres row).
    if (isNeo4jEnabled()) {
      try {
        await this.graph.setAnnotationStatus(annotationId, status);
      } catch (err) {
        console.warn('[AICritiqueService] graph status update degraded (Postgres kept):', (err as Error).message);
      }
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
    // M27-b: also detach-delete the plan's graph annotation nodes (best-effort).
    if (isNeo4jEnabled()) {
      try {
        await this.graph.clearAnnotations(planId);
      } catch (err) {
        console.warn('[AICritiqueService] graph clear degraded (Postgres kept):', (err as Error).message);
      }
    }
  }

  /**
   * Find cached annotations for a (plan, scope, inputHash) combo.
   * Returns null when no cache hit exists (caller runs the LLM).
   */
  private async findCachedAnnotations(
    planId: string,
    scope: string,
    inputHash: string,
    model: string,
  ): Promise<CritiqueAnnotationsResult | null> {
    const result = await queryOLTP<Record<string, unknown>>(
      `SELECT id, type, severity, description, evidence, related_entities,
               scope, ai_model, input_hash, status, plan_id, item_ids, created_at, is_marker
          FROM critique_annotations
         WHERE plan_id = $1
           AND scope = $2
           AND input_hash = $3
           AND ai_model = $4
           AND status <> 'dismissed'
         ORDER BY created_at DESC`,
      [planId, scope, inputHash, model],
    );
    if (result.rows.length === 0) return null;

    // The result is scoped to (plan, scope, input_hash, model) — never a
    // plan-wide superset, and never a stale annotation from another scope/hash.
    // A single cache-marker row (clean-plan run) may be present; it proves the
    // hit but is excluded from the annotations returned to the caller.
    const annotations = result.rows
      .filter((r) => !r.is_marker)
      .map((r) => this.rowToAnnotation(r));
    return {
      annotations,
      cached: true,
      model: result.rows[0].ai_model as string,
    };
  }

  /**
   * Persist annotation rows to the critique_annotations table.
   *
   * All real annotations (plus an optional cache marker for a clean plan) are
   * written inside one transaction so the batch commits or rolls back
   * atomically — a partial insert could otherwise masquerade as a cache hit.
   *
   * When the LLM finds no conflicts, we still persist a single `is_marker` row
   * so the next unchanged analysis is a cache hit rather than re-calling the LLM.
   *
   * Before persisting, any prior OPEN annotations for the same (plan, scope) are
   * retired (deleted) so the new run cleanly replaces the old one. Dismissed
   * and addressed annotations are preserved — they represent author actions
   * that remain valid across re-analyses.
   */
  private async persistAnnotations(
    annotations: CritiqueAnnotation[],
    meta: { planId: string; scope: CritiqueScopeType; inputHash: string; model: string },
  ): Promise<void> {
    await withOLTPTransaction(async (client) => {
      // Retire prior OPEN annotations for this (plan, scope) so the new run
      // cleanly replaces the old one. Dismissed/addressed annotations are
      // preserved — they represent author actions that survive re-analysis.
      await client.query(
        `DELETE FROM critique_annotations WHERE plan_id = $1 AND scope = $2 AND status = 'open'`,
        [meta.planId, meta.scope],
      );

      for (const annotation of annotations) {
        await client.query(
          `INSERT INTO critique_annotations
              (id, type, severity, description, evidence, related_entities,
               scope, ai_model, input_hash, status, plan_id, item_ids, created_at, is_marker)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE)`,
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
            // item_ids is TEXT[]; pass the JS array directly so pg escapes it
            // (manual array-literal escaping could corrupt backslashes/trailing).
            annotation.itemIds || [],
            annotation.createdAt,
          ],
        );
      }

      if (annotations.length === 0) {
        await client.query(
          `INSERT INTO critique_annotations
              (id, type, severity, description, evidence, related_entities,
               scope, ai_model, input_hash, status, plan_id, item_ids, created_at, is_marker)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE)`,
          [
            crypto.randomUUID(),
            'suggestion',
            'info',
            'No conflicts found — critique ran clean for this scope.',
            JSON.stringify([]),
            JSON.stringify([]),
            meta.scope,
            meta.model,
            meta.inputHash,
            'open',
            meta.planId,
            [],
            new Date().toISOString(),
          ],
        );
      }
    });
    console.log(`${LOG_PREFIX} Persisted ${annotations.length} annotation(s) to Postgres`);

    // M27-b: mirror the durable Postgres rows into the authoring graph. The graph
    // is disposable IR — a failed write only leaves overlays stale (rebuildable
    // from the rows), never fails the analyze or blocks approval.
    if (isNeo4jEnabled()) {
      try {
        await this.graph.writeAnnotations(annotations, meta);
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} Graph critique write failed (overlays stale; durable Postgres rows kept):`,
          (err as Error).message,
        );
      }
    }
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

