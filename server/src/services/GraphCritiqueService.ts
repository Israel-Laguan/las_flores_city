// ============================================================
// GraphCritiqueService — `:Conflict` / `:Suggestion` nodes + `:FLAGGED_IN` edge
//
// M27-b lifts the M26 AI-critique annotations (durable Postgres rows in
// `critique_annotations`) into the Neo4j authoring graph. This service is the
// graph write/read authority:
//   - writeAnnotations() → `(:Conflict|:Suggestion)` nodes with provenance
//     (`ai_model`, `input_hash`, `status`, ...) linked `-[:FLAGGED_IN]-> (:Content)`
//   - findCached()       → the `(ai_model, input_hash)` cache key from the graph
//   - getAnnotations() / getAnnotation() → admin overlays read the graph
//   - setAnnotationStatus() / markAddressed() → live override + M29 apply-delta
//   - clearAnnotations() → detach-delete a plan's graph annotations
//
// The graph is a disposable authoring IR: Postgres rows remain the durable
// source of truth. Every method no-ops to empty when NEO4J_ENABLED is off, so
// existing Postgres paths are untouched when the graph substrate is absent.
// ============================================================

import type { ManagedTransaction } from 'neo4j-driver';
import type { CritiqueAnnotation, CritiqueAnnotationsResult, CritiqueScope, CritiqueStatus } from '@las-flores/shared';
import { contentKey } from './GraphBaseService.js';
import { isNeo4jEnabled, runNeo4jQuery, runNeo4jTransaction } from './Neo4jClient.js';

const LOG_PREFIX = '[GraphCritiqueService]';

/** Coerce an optional JSON-string array back into a JS array. */
function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Map a stored graph-node property bag back to the portable CritiqueAnnotation. */
function nodeToAnnotation(p: Record<string, unknown>): CritiqueAnnotation {
  return {
    id: String(p.id ?? ''),
    type: p.type === 'suggestion' ? 'suggestion' : 'conflict',
    severity: (p.severity as CritiqueAnnotation['severity']) ?? 'warning',
    description: String(p.description ?? ''),
    evidence: parseJsonArray(p.evidenceJson) as CritiqueAnnotation['evidence'],
    relatedEntities: parseJsonArray(p.relatedEntitiesJson) as CritiqueAnnotation['relatedEntities'],
    scope: (p.scope as CritiqueScope) ?? 'entity',
    aiModel: String(p.aiModel ?? ''),
    inputHash: String(p.inputHash ?? ''),
    status: (p.status as CritiqueStatus) ?? 'open',
    planId: String(p.planId ?? ''),
    itemIds: Array.isArray(p.itemIds) ? (p.itemIds as string[]) : [],
    createdAt: String(p.createdAt ?? new Date().toISOString()),
  };
}

/** Property bag stored on a `:Conflict`/`:Suggestion` node. */
function annotationProps(a: CritiqueAnnotation): Record<string, unknown> {
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    description: a.description,
    evidenceJson: JSON.stringify(a.evidence ?? []),
    relatedEntitiesJson: JSON.stringify(a.relatedEntities ?? []),
    scope: a.scope,
    aiModel: a.aiModel,
    inputHash: a.inputHash,
    status: a.status,
    planId: a.planId,
    itemIds: a.itemIds ?? [],
    createdAt: a.createdAt,
  };
}

/** Property bag stored on a `:CacheMarker` node (clean-plan cache hits). */
function markerProps(
  id: string,
  meta: { planId: string; scope: CritiqueScope; inputHash: string; model: string },
): Record<string, unknown> {
  return {
    id,
    type: 'suggestion',
    severity: 'info',
    description: 'No conflicts found — critique ran clean for this scope.',
    evidenceJson: '[]',
    relatedEntitiesJson: '[]',
    scope: meta.scope,
    aiModel: meta.model,
    inputHash: meta.inputHash,
    status: 'open',
    planId: meta.planId,
    itemIds: [],
    createdAt: new Date().toISOString(),
  };
}

export class GraphCritiqueService {
  /**
   * Persist a critique run's annotations (or a clean marker) as graph nodes,
   * linking each evidence excerpt `-[:FLAGGED_IN]-> (:Content)`. Retires prior
   * OPEN annotations for the same (plan, scope), preserving addressed/dismissed
   * author actions. No-op when Neo4j is disabled.
   */
  async writeAnnotations(
    annotations: CritiqueAnnotation[],
    meta: { planId: string; scope: CritiqueScope; inputHash: string; model: string },
  ): Promise<void> {
    if (!isNeo4jEnabled()) return;
    await runNeo4jTransaction(async (tx: ManagedTransaction) => {
      // Retire prior OPEN annotations + markers for (plan, scope); author
      // overrides (addressed/dismissed) survive re-analysis.
      await tx.run(
        `MATCH (a:Conflict|Suggestion)
         WHERE a.planId = $planId AND a.scope = $scope AND a.status = 'open'
         DETACH DELETE a`,
        { planId: meta.planId, scope: meta.scope },
      );
      await tx.run(
        `MATCH (m:CacheMarker)
         WHERE m.planId = $planId AND m.scope = $scope
         DETACH DELETE m`,
        { planId: meta.planId, scope: meta.scope },
      );

      for (const a of annotations) {
        // Label is interpolated from the enum-confined `type` (safe) — Cypher
        // doesn't allow parameterizing node labels.
        const label = a.type === 'conflict' ? 'Conflict' : 'Suggestion';
        await tx.run(
          `MERGE (n:${label} { key: $key })
           ON CREATE SET n += $props
           ON MATCH SET n += $props`,
          { key: a.id, props: annotationProps(a) },
        );
        for (const evidence of a.evidence ?? []) {
          // Evidence may reference a real canon entity (matched above, and the
          // MERGE then no-ops against the existing canon node) or a plan-derived
          // item that is NOT the canonical graph (e.g. a lowercase `item.type`).
          // Tag any node we create here `isEvidence = true` so the canonical
          // traversal (`MATCH (c:Content) WHERE c.planId IS null`) excludes it:
          // an evidence-only node must never leak into the LLM prompt/input-hash
          // or into the merged-view canon layer. A real canon entity keeps its
          // own properties (ON CREATE only marks newly-created evidence nodes).
          await tx.run(
            `MERGE (c:Content { key: $cKey })
             ON CREATE SET c.nodeType = $nt, c.nodeId = $nid, c.name = '', c.planId = null, c.isEvidence = true
             WITH c
             MATCH (n) WHERE (n:Conflict OR n:Suggestion) AND n.key = $aKey
             MERGE (n)-[:FLAGGED_IN]->(c)`,
            {
              cKey: contentKey(evidence.nodeType, evidence.nodeId),
              nt: evidence.nodeType,
              nid: evidence.nodeId,
              aKey: a.id,
            },
          );
        }
      }

      if (annotations.length === 0) {
        const markerKey = `${meta.planId}:${meta.scope}:${meta.inputHash}:${meta.model}`;
        await tx.run(
          `MERGE (m:CacheMarker { key: $key })
           ON CREATE SET m += $props
           ON MATCH SET m += $props`,
          { key: markerKey, props: markerProps(markerKey, meta) },
        );
      }
    });
    console.log(`${LOG_PREFIX} Wrote ${annotations.length} annotation node(s) for plan ${meta.planId}`);
  }

  /**
   * Graph-based cache probe for `(plan, scope, inputHash, model)`. Mirrors the
   * Postgres `findCachedAnnotations` semantics: returns the run's annotations
   * (excluding cache markers) plus `cached: true`; null on cache miss. Markers
   * store `inputHash`/`aiModel` so a re-run on an unchanged subgraph hits.
   */
  async findCached(
    planId: string,
    scope: string,
    inputHash: string,
    model: string,
  ): Promise<CritiqueAnnotationsResult | null> {
    if (!isNeo4jEnabled()) return null;
    const rows = await runNeo4jQuery<{ labels: string[]; p: Record<string, unknown>; createdAt: string | null }>(
      `MATCH (a:Conflict|Suggestion|CacheMarker)
       WHERE a.planId = $planId
         AND a.scope = $scope
         AND a.inputHash = $inputHash
         AND a.aiModel = $aiModel
         AND a.status <> 'dismissed'
       RETURN labels(a) AS labels, properties(a) AS p, a.createdAt AS createdAt
       ORDER BY a.createdAt DESC`,
      { planId, scope, inputHash, aiModel: model },
    );
    if (rows.length === 0) return null;
    const annotations = rows
      .filter((r) => r.labels.includes('Conflict') || r.labels.includes('Suggestion'))
      .map((r) => nodeToAnnotation(r.p));
    return { annotations, cached: true, model: rows[0].p.aiModel != null ? String(rows[0].p.aiModel) : model };
  }

  /** Read non-dismissed annotations for a plan from the graph (overlays). */
  async getAnnotations(planId: string): Promise<CritiqueAnnotation[]> {
    if (!isNeo4jEnabled()) return [];
    const rows = await runNeo4jQuery<{ p: Record<string, unknown> }>(
      `MATCH (a:Conflict|Suggestion)
       WHERE a.planId = $planId AND a.status <> 'dismissed'
       RETURN properties(a) AS p, a.createdAt AS createdAt
       ORDER BY a.createdAt DESC`,
      { planId },
    );
    return rows.map((r) => nodeToAnnotation(r.p));
  }

  /** Fetch a single annotation node by id. */
  async getAnnotation(annotationId: string): Promise<CritiqueAnnotation | null> {
    if (!isNeo4jEnabled()) return null;
    const rows = await runNeo4jQuery<{ p: Record<string, unknown> }>(
      `MATCH (a:Conflict|Suggestion { id: $annotationId })
       RETURN properties(a) AS p`,
      { annotationId },
    );
    return rows.length > 0 ? nodeToAnnotation(rows[0].p) : null;
  }

  /** Live override: set status ('open' | 'addressed' | 'dismissed'). */
  async setAnnotationStatus(annotationId: string, status: CritiqueStatus): Promise<void> {
    if (!isNeo4jEnabled()) return;
    const result = await runNeo4jQuery<{ id: string }>(
      `MATCH (a:Conflict|Suggestion { id: $annotationId })
       SET a.status = $status
       RETURN a.id AS id`,
      { annotationId, status },
    );
    if (result.length === 0) {
      throw new Error(`Annotation not found: ${annotationId}`);
    }
  }

  /** M29's apply-delta marks a resolved conflict addressed on the graph. */
  async markAddressed(annotationId: string): Promise<void> {
    return this.setAnnotationStatus(annotationId, 'addressed');
  }

  /** Remove all of a plan's graph annotation + marker nodes. */
  async clearAnnotations(planId: string): Promise<void> {
    if (!isNeo4jEnabled()) return;
    await runNeo4jQuery(
      `MATCH (a:Conflict|Suggestion|CacheMarker)
       WHERE a.planId = $planId
       DETACH DELETE a`,
      { planId },
    );
  }

  /** Count a plan's non-marker annotation nodes (verification helper). */
  async countAnnotations(planId: string): Promise<number> {
    if (!isNeo4jEnabled()) return 0;
    const rows = await runNeo4jQuery<{ count: unknown }>(
      `MATCH (a:Conflict|Suggestion) WHERE a.planId = $planId RETURN count(a) AS count`,
      { planId },
    );
    return rows[0]?.count != null ? Number(rows[0].count) : 0;
  }
}

/** Singleton export for route handlers / service wiring. */
export const graphCritiqueService = new GraphCritiqueService();
