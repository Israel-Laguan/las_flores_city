// ============================================================
// GraphMerger — M28 write/merge path
//
// Promotes a plan's deltas into the canonical base `:Content` graph and commits
// the plan's edges as real relationships. The graph is a derived/authoring IR:
// production SQL/YAML/MinIO remain authoritative, so every failure here is
// logged but NEVER flips a plan's status.
//
// All writes run inside `runNeo4jTransaction` (idempotent — a re-run of a
// verified plan leaves the canonical graph unchanged). When Neo4j is disabled,
// every method no-ops (returns empty / resolves undefined).
// ============================================================

import { isNeo4jEnabled, runNeo4jTransaction } from './Neo4jClient.js';
import { withGraphWriteLock } from './graphLock.js';
import { getMergedView } from './GraphQueryService.js';
import type { GraphMergedView } from '@las-flores/shared';
import {
  getDeltasForPlan,
  getDeltaEdgesForPlan,
  clearDeltasForPlan,
  normalizeKeyComponent,
} from './GraphDeltaService.js';
import { gatherBaseGraphData } from './GraphSeedSource.js';
import {
  type GraphDelta,
  type GraphDeltaEdge,
  type GraphEdge,
  findEdgeMapping,
} from '@las-flores/shared';

/** A merged revision = merged view + the plan's delta edges (resolved). */
export interface GraphMergedRevision extends GraphMergedView {
  deltaEdges: GraphDeltaEdge[];
}

/**
 * Build the merged revision for a plan: the canonical merged view (base ∪
 * plan deltas, DELETE omissions) PLUS the plan's delta edges, which carry both
 * endpoints' identity so the exporter can resolve them to merged node identity.
 * Returns an empty revision when Neo4j is disabled.
 */
export async function buildMergedRevision(planId: string): Promise<GraphMergedRevision> {
  const [merged, deltaEdges] = await Promise.all([
    getMergedView(planId),
    getDeltaEdgesForPlan(planId),
  ]);
  return { ...merged, deltaEdges };
}

/** Shape returned by `detectGraphDrift`. */
export interface GraphDriftReport {
  /** True when the canonical graph matches the content store (no drift). */
  inSync: boolean;
  /** Keys `(nodeType:nodeId)` present in the graph but missing from the store. */
  orphanNodes: string[];
  /** Keys `(nodeType:nodeId)` present in the store but missing from the graph. */
  missingNodes: string[];
  /** Edge keys `sType:sId->tType:tId[type]` in the graph but not the store. */
  orphanEdges: string[];
  /** Edge keys in the store but not the graph. */
  missingEdges: string[];
}

function edgeKey(e: GraphEdge): string {
  return `${e.sourceNodeType}:${e.sourceNodeId}->${e.targetNodeType}:${e.targetNodeId}[${e.type}]`;
}

/**
 * Compare the canonical graph (`(nodeType,nodeId)` + edge keys) against the
 * content store source (`gatherBaseGraphData`). Used by the approve gate: if the
 * graph has drifted (e.g. a YAML was edited directly outside the graph), approve
 * is blocked and the operator must run `npm run resync:graph` first.
 */
export async function detectGraphDrift(): Promise<GraphDriftReport> {
  if (!isNeo4jEnabled()) {
    // No graph → nothing to drift. Treat the (non-existent) graph as in-sync so
    // the gate never blocks graph-less dev environments.
    return { inSync: true, orphanNodes: [], missingNodes: [], orphanEdges: [], missingEdges: [] };
  }
  const [source, graphRows] = await Promise.all([
    gatherBaseGraphData(),
    Promise.all([
      runNeo4jTransaction(async (tx) => {
        const res = await tx.run(
          `MATCH (c:Content) WHERE c.planId IS null
             AND (c.isEvidence IS NULL OR c.isEvidence = false)
           RETURN c.nodeType AS t, c.nodeId AS n`,
        );
        return res.records.map((r) => ({ t: r.get('t'), n: String(r.get('n')) }));
      }),
      runNeo4jTransaction(async (tx) => {
        const res = await tx.run(
          `MATCH (a:Content)-[r]->(b:Content)
           WHERE a.planId IS null AND b.planId IS null
             AND (a.isEvidence IS NULL OR a.isEvidence = false)
             AND (b.isEvidence IS NULL OR b.isEvidence = false)
           RETURN a.nodeType AS st, a.nodeId AS sn, type(r) AS type, b.nodeType AS tt, b.nodeId AS tn`,
        );
        return res.records.map((r) => ({
          st: r.get('st'),
          sn: String(r.get('sn')),
          type: r.get('type'),
          tt: r.get('tt'),
          tn: String(r.get('tn')),
        }));
      }),
    ]),
  ]);

  const sourceNodes = new Set(source.nodes.map((n) => `${n.nodeType}:${n.nodeId}`));
  const sourceEdges = new Set(source.edges.map(edgeKey));

  const graphNodes = new Set<string>();
  for (const row of graphRows[0] ?? []) graphNodes.add(`${row.t}:${row.n}`);

  const graphEdges = new Set<string>();
  for (const row of graphRows[1] ?? []) {
    graphEdges.add(`${row.st}:${row.sn}->${row.tt}:${row.tn}[${row.type}]`);
  }

  const orphanNodes = [...graphNodes].filter((k) => !sourceNodes.has(k));
  const missingNodes = [...sourceNodes].filter((k) => !graphNodes.has(k));
  const orphanEdges = [...graphEdges].filter((k) => !sourceEdges.has(k));
  const missingEdges = [...sourceEdges].filter((k) => !graphEdges.has(k));

  return {
    inSync: orphanNodes.length === 0 && missingNodes.length === 0
      && orphanEdges.length === 0 && missingEdges.length === 0,
    orphanNodes,
    missingNodes,
    orphanEdges,
    missingEdges,
  };
}

/**
 * Idempotently promote a plan's deltas into the canonical base graph:
 *   1. ADD/MODIFY → upsert canonical `:Content` (merged fields = base ∪ delta).
 *   2. DELETE     → DETACH DELETE the canonical node + its edges.
 *   3. delta edges → commit as canonical relationships.
 *   4. clearDeltasForPlan (DETACH DELETE delta nodes + edges).
 *
 * Failures are logged but never rethrown to callers that drive plan status — the
 * production graph is disposable/derived; SQL/YAML/MinIO are authoritative.
 * Returns true on success, false when skipped (Neo4j disabled) or aborted.
 */
export async function commitGraph(planId: string): Promise<boolean> {
  if (!isNeo4jEnabled()) return false;
  // Serialize with graph resync so a full re-derive and a plan promotion cannot
  // interleave writes to the same canonical nodes.
  return withGraphWriteLock(async () => {
    const normalizedPlanId = normalizeKeyComponent(planId);
    try {
      await runNeo4jTransaction(async (tx) => {
      const deltas = await getDeltasForPlan(normalizedPlanId, tx);

      for (const delta of deltas) {
        if (delta.op === 'DELETE') {
          await tx.run(
            `MATCH (c:Content { nodeType: $t, nodeId: $n }) WHERE c.planId IS null DETACH DELETE c`,
            { t: delta.nodeType, n: delta.nodeId },
          );
          continue;
        }
        // ADD / MODIFY → merge canonical node. For MODIFY the delta carries the
        // full post-approve field set (a shadow copy of the canon node), so it
        // is authoritative; for ADD it is the new node's initial fields.
        const fields = delta.fields ?? {};
        const name = typeof fields.name === 'string' ? fields.name : '';
        const reserved = new Set(['key', 'nodeType', 'nodeId', 'planId', 'isEvidence']);
        // Neo4j node properties cannot be nested maps/arrays, so only keep
        // scalar values (and drop anything else) when building `$props`.
        // Neo4j node properties cannot be nested maps, but primitive arrays
        // (e.g. `available_dialogues`) are valid — keep scalars and primitive
        // arrays (string/number/boolean), and reject only unsupported nested
        // (map/array-of-object) values so canonical content is never silently lost.
        const isPrimitiveArray = (v: unknown): boolean =>
          Array.isArray(v) && (v.length === 0
            || v.every((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'));
        const safeFields = Object.fromEntries(
          Object.entries(fields)
            .filter(([k]) => !reserved.has(k) && k !== 'name')
            .filter(([, v]) => v == null
              || typeof v === 'string'
              || typeof v === 'number'
              || typeof v === 'boolean'
              || isPrimitiveArray(v)),
        );
        await tx.run(
          `MERGE (c:Content { key: $key })
           SET c = $props`,
          {
            key: `${delta.nodeType}:${delta.nodeId}`,
            props: {
              ...safeFields,
              name,
              key: `${delta.nodeType}:${delta.nodeId}`,
              nodeType: delta.nodeType,
              nodeId: delta.nodeId,
              planId: null,
            },
          },
        );
      }

      // Commit plan delta edges as canonical relationships. The source/target
      // resolver resolves a delta endpoint to its canonical identity:
      //   - ADD delta    → the new canonical node (now upserted above)
      //   - MODIFY/DELTA → same (nodeType,nodeId) canonical node
      const deltaEdges = await getDeltaEdgesForPlan(normalizedPlanId, tx);
      for (const edge of deltaEdges) {
        if (!/^[A-Z][A-Z_0-9]*$/.test(edge.type)) continue;
        // Relationship-backed fields are single-valued per source (a dialogue's
        // scene_id/character_id/mission_id, an overlay's target_tree_id/
        // mission_id, a scene's district IN_DISTRICT). When such a field changes,
        // the previous canonical relationship of the same type must be removed so
        // the graph agrees with the store after commit.
        const mapping = findEdgeMapping(edge.type, edge.sourceNodeType, edge.targetNodeType);
        if (mapping) {
          await tx.run(
            `MATCH (a:Content { nodeType: $st, nodeId: $sn })-[r:${edge.type}]->(x:Content)
             WHERE NOT (x.nodeType = $tt AND x.nodeId = $tn)
             DELETE r`,
            { st: edge.sourceNodeType, sn: edge.sourceNodeId, tt: edge.targetNodeType, tn: edge.targetNodeId },
          );
        }
        await tx.run(
          `MATCH (a:Content { nodeType: $st, nodeId: $sn })
           MATCH (b:Content { nodeType: $tt, nodeId: $tn })
           MERGE (a)-[r:${edge.type}]->(b)`,
          {
            st: edge.sourceNodeType,
            sn: edge.sourceNodeId,
            tt: edge.targetNodeType,
            tn: edge.targetNodeId,
          },
        );
      }

      // Delta nodes + edges die with their plan. Delete ONLY the delta IDs we
      // read inside this transaction — a delta inserted by a concurrent
      // `applyDelta` after the read must not be dropped (it would be skipped
      // from promotion yet removed here). The next `commitGraph` for those
      // deltas handles them.
      const readDeltaIds = deltas.map((d) => d.id);
      if (readDeltaIds.length > 0) {
        await tx.run(
          `MATCH (d:ContentDelta) WHERE d.id IN $ids DETACH DELETE d`,
          { ids: readDeltaIds },
        );
      }
    });
    return true;
  } catch (err) {
  console.warn(`[GraphMerger] commitGraph for plan ${planId} failed (graph is derived; SQL/YAML authoritative):`, (err as Error).message);
  return false;
}
});
}

// Re-export the delta primitives the resync/gate tools build on, so callers
// import the write surface from one module.
export { clearDeltasForPlan, getDeltasForPlan, getDeltaEdgesForPlan };
export type { GraphDelta, GraphDeltaEdge };
