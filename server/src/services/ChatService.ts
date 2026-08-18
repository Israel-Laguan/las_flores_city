// ============================================================
// ChatService — M29 conversational chat assistant (Moment 4)
//
// Ephemeral chat: the server is STATELESS for conversation; the client sends
// the full multi-turn history on every request and the service stages it into
// the provider. There is deliberately NO chat table.
//
// Responsibilities:
//   - explain()   — prose answers grounded in the plan's canon neighborhood
//                   (+ an optional `ConflictChatContext` when started from a
//                   :Conflict via "Copy to Chat").
//   - propose()   — structured `GraphDelta` proposals (reject-and-refine lives
//                   in the provider; apply revalidates before write).
//   - applyDeltas() — the write gate: validates every delta against
//                   `GraphDeltaSchema`, enforces the plan scope, requires the
//                   graph, applies delta(s), and marks a resolved conflict
//                   'addressed' (durable Postgres + graph mirror).
//   - discardDelta() — "[Keep existing]" on the review queue.
//   - getReviewQueue() — global `needs_review`: open annotations ∪ all deltas.
// ============================================================

import { GraphDeltaSchema, GraphDeltaEdgeSchema, type ConflictChatContext, type CritiqueAnnotation, type GraphDelta, type GraphDeltaEdge, type ReviewQueueItem, type ChatMessage } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { createLLMProvider } from './LLMService.js';
import { buildMergedRevision } from './GraphMerger.js';
import { applyDelta, applyDeltaEdge, removeDelta, getAllDeltas, getDeltaEdgesForPlans, preflightDeltas, preflightDeltaEdges } from './GraphDeltaService.js';
import { aiCritiqueService, type AICritiqueService } from './AICritiqueService.js';
import { postgresNeighborhoodProvider, neo4jNeighborhoodProvider, type NeighborhoodProvider } from './NeighborhoodProvider.js';
import { isNeo4jEnabled, runNeo4jTransaction } from './Neo4jClient.js';
import type { LLMProvider, ExistingContentContext, LLMUsage } from './types/LLMTypes.js';

/** Delta-validation gate failed (route → 400). */
export class ChatDeltaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatDeltaValidationError';
  }
}

/** Graph required but disabled (route → 409). */
export class ChatGraphDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatGraphDisabledError';
  }
}

/** Requested annotation is missing / not scoped to the plan (route → 404). */
export class ChatAnnotationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatAnnotationNotFoundError';
  }
}

export class ChatService {
  private provider: LLMProvider;
  private critique: AICritiqueService;

  constructor(provider?: LLMProvider, critique?: AICritiqueService) {
    this.provider = provider || createLLMProvider();
    this.critique = critique ?? aiCritiqueService;
  }

  /** Select the neighborhood seam per call (graph-backed when enabled). */
  private get neighborhoodProvider(): NeighborhoodProvider {
    return isNeo4jEnabled() ? neo4jNeighborhoodProvider : postgresNeighborhoodProvider;
  }

  /** Build the §13 "Copy to Chat" bundle server-side from a durable annotation. */
  private buildConflictContext(annotation: CritiqueAnnotation): ConflictChatContext {
    return {
      conflictId: annotation.id,
      planId: annotation.planId,
      type: annotation.type,
      severity: annotation.severity,
      description: annotation.description,
      evidence: annotation.evidence,
      relatedEntities: annotation.relatedEntities,
      aiModel: annotation.aiModel,
      detectedAt: annotation.createdAt,
    };
  }

  /** Resolve an annotation's conflict bundle, verifying it belongs to `planId`. */
  private async resolveConflict(planId: string, annotationId?: string): Promise<ConflictChatContext | undefined> {
    if (!annotationId) return undefined;
    const annotation = await this.critique.getAnnotation(annotationId);
    if (!annotation) {
      throw new ChatAnnotationNotFoundError(`Annotation not found: ${annotationId}`);
    }
    if (annotation.planId !== planId) {
      throw new ChatAnnotationNotFoundError(`Annotation ${annotationId} does not belong to plan ${planId}`);
    }
    return this.buildConflictContext(annotation);
  }

  /** Shared context gathering for explain/propose. */
  private async gather(): Promise<ExistingContentContext> {
    return this.neighborhoodProvider.gatherContext();
  }

  /** Load the durable plan description so prompts render the plan context. */
  private async loadPlanDescription(planId: string): Promise<string | undefined> {
    const result = await queryOLTP<{ description: string | null }>(
      `SELECT description FROM content_plans WHERE id = $1`,
      [planId],
    );
    return result.rows[0]?.description ?? undefined;
  }

  /** Prose reply — no structured side-effects. */
  async explain(
    planId: string,
    messages: ChatMessage[],
    annotationId?: string,
  ): Promise<{ reply: string; usage: LLMUsage | null }> {
    const [context, conflict, description] = await Promise.all([
      this.gather(),
      this.resolveConflict(planId, annotationId),
      this.loadPlanDescription(planId),
    ]);
    return this.provider.chatExplain(planId, messages, context, conflict, description);
  }

  /** Structured proposal — returns schema-valid deltas (+ optional edges). */
  async propose(
    planId: string,
    messages: ChatMessage[],
    annotationId?: string,
  ): Promise<{ reply: string; deltas: GraphDelta[]; deltaEdges: GraphDeltaEdge[]; usage: LLMUsage | null }> {
    const [context, conflict, description] = await Promise.all([
      this.gather(),
      this.resolveConflict(planId, annotationId),
      this.loadPlanDescription(planId),
    ]);
    return this.provider.chatPropose(planId, messages, context, conflict, description);
  }

  /**
   * Apply proposed deltas — the human-in-the-loop write gate.
   *   ① validate every delta against `GraphDeltaSchema` (collect issues, throw)
   *   ② enforce `delta.planId === planId`                          (400)
   *   ③ require the graph (409 when disabled)
   *   ④ `applyDelta`/`applyDeltaEdge` sequentially (base-node guards live in
   *      the service, so an invalid MODIFY target throws before any write sticks)
   *   ⑤ if `annotationId`: mark the conflict 'addressed' (Postgres + graph sync)
   *   ⑥ return `{ appliedCount, mergedView }` (the merged-view refresh)
   */
  async applyDeltas(
    planId: string,
    deltas: GraphDelta[],
    deltaEdges: GraphDeltaEdge[] = [],
    annotationId?: string,
  ): Promise<{ appliedCount: number; mergedView: Awaited<ReturnType<typeof buildMergedRevision>> }> {
    // ① validate before write — a malformed delta must never corrupt the graph.
    const issues: string[] = [];
    deltas.forEach((d, i) => {
      const parsed = GraphDeltaSchema.safeParse(d);
      if (!parsed.success) {
        issues.push(`deltas[${i}]: ${parsed.error.issues.map((x) => x.message).join('; ')}`);
        return;
      }
      // ② the server is the scope authority — a delta for another plan is rejected.
      if (d.planId !== planId) {
        issues.push(`deltas[${i}]: planId ${d.planId} does not match ${planId}`);
      }
    });
    deltaEdges.forEach((e, i) => {
      const parsed = GraphDeltaEdgeSchema.safeParse(e);
      if (!parsed.success) {
        issues.push(`deltaEdges[${i}]: ${parsed.error.issues.map((x) => x.message).join('; ')}`);
        return;
      }
      if (e.planId !== planId) {
        issues.push(`deltaEdges[${i}]: planId ${e.planId} does not match ${planId}`);
      }
    });
    if (issues.length > 0) {
      throw new ChatDeltaValidationError(`Invalid delta payload: ${issues.join('; ')}`);
    }

    // ① validate annotation scope BEFORE any write loops
    if (annotationId) {
      const annotation = await this.critique.getAnnotation(annotationId);
      if (!annotation) {
        throw new ChatAnnotationNotFoundError(`Annotation not found: ${annotationId}`);
      }
      if (annotation.planId !== planId) {
        throw new ChatAnnotationNotFoundError(`Annotation ${annotationId} does not belong to plan ${planId}`);
      }
    }

    // Resolve the target annotation before any write so a bad annotationId
    // cannot leave the graph mutated while the route returns 404.
    if (annotationId) {
      await this.resolveConflict(planId, annotationId);
    }

    // ③ the graph substrate must be present to write real deltas.
    if (!isNeo4jEnabled()) {
      throw new ChatGraphDisabledError('Neo4j authoring graph is disabled — cannot apply deltas. Enable NEO4J_ENABLED first.');
    }

    // ④ write the WHOLE batch in a single Neo4j transaction so a later
    //    guard/edge failure (or a concurrent graph change) can never leave a
    //    partially-applied proposal in the graph. Deltas are written first, then
    //    each delta-edge endpoint is validated (so an edge whose source/target
    //    is a delta authored in THIS same request is visible) and written — all
    //    atomically. Any throw rolls back the entire batch.
    await runNeo4jTransaction(async (tx) => {
      await preflightDeltas(deltas, tx);
      for (const delta of deltas) {
        await applyDelta(delta, tx);
      }
      await preflightDeltaEdges(deltaEdges, tx);
      for (const edge of deltaEdges) {
        await applyDeltaEdge(edge, tx);
      }
    });

    // ⑥ mark the conflict that started the chat 'addressed' (durable Postgres
    //    + graph sync). The annotation scope is already validated above.
    if (annotationId) {
      await this.critique.setAnnotationStatus(annotationId, 'addressed');
    }

    // ⑦ return the merged-view refresh so the UI reflects the new shadow node.
    return {
      appliedCount: deltas.length,
      mergedView: await buildMergedRevision(planId),
    };
  }

  /** "[Keep existing]" — decline a proposed delta, base graph untouched. */
  async discardDelta(planId: string, nodeType: string, nodeId: string): Promise<void> {
    await removeDelta(planId, nodeType, nodeId);
  }

  /** Global `needs_review` queue: open annotations ∪ all deltas. */
  async getReviewQueue(): Promise<ReviewQueueItem[]> {
    const [annotations, allDeltas] = await Promise.all([
      this.critique.getAllOpenAnnotations(),
      getAllDeltas(),
    ]);

    // Resolve plan descriptions for every plan referenced by the queue rows.
    // Also exclude orphaned deltas whose plan no longer exists (e.g. Neo4j
    // cleanup failed after a plan deletion), so a deleted plan is never
    // presented as an actionable review item.
    const planIds = Array.from(new Set([
      ...annotations.map((a) => a.planId),
      ...allDeltas.map((d) => d.planId),
    ]));
    const existingPlanIds = new Set<string>();
    const descById = new Map<string, string>();
    if (planIds.length > 0) {
      const result = await queryOLTP<{ id: string; description: string | null }>(
        `SELECT id, description FROM content_plans WHERE id = ANY($1)`,
        [planIds],
      );
      for (const row of result.rows) {
        existingPlanIds.add(row.id);
        if (row.description) descById.set(row.id, row.description);
      }
    }
    const deltas = allDeltas.filter((d) => existingPlanIds.has(d.planId));

    // Group each plan's delta edges by their (planId, source) key so the queue
    // item can expose the relationships authored alongside a proposed delta.
    // The key includes the planId so two plans proposing the same
    // (nodeType, nodeId) never share edges. All plans are read in a single
    // scoped query to keep /review-queue latency flat as plan count grows.
    const edgesBySource = new Map<string, GraphDeltaEdge[]>();
    if (isNeo4jEnabled() && existingPlanIds.size > 0) {
      for (const e of await getDeltaEdgesForPlans([...existingPlanIds])) {
        const key = `${e.planId}:${e.sourceNodeType}:${e.sourceNodeId}`;
        const list = edgesBySource.get(key) ?? [];
        list.push(e);
        edgesBySource.set(key, list);
      }
    }

    const items: ReviewQueueItem[] = [
      ...annotations.map((a): ReviewQueueItem => ({
        kind: a.type, // 'conflict' | 'suggestion'
        planId: a.planId,
        planDescription: descById.get(a.planId),
        annotation: a,
        deltaEdges: [],
      })),
      ...deltas.map((d): ReviewQueueItem => ({
        kind: 'delta',
        planId: d.planId,
        planDescription: descById.get(d.planId),
        delta: d,
        deltaEdges: edgesBySource.get(`${d.planId}:${d.nodeType}:${d.nodeId}`) ?? [],
      })),
    ];

    // Newest first — annotations and deltas both carry an ISO createdAt.
    return items.sort((x, y) => {
      const aAt = x.annotation?.createdAt ?? x.delta?.createdAt ?? '';
      const bAt = y.annotation?.createdAt ?? y.delta?.createdAt ?? '';
      return bAt.localeCompare(aAt);
    });
  }
}

/** Singleton export for route handlers. */
export const chatService = new ChatService();