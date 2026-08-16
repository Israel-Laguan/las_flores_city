// ============================================================
// GraphQueryService — merged-view + impact-analysis reads
//
// Read path only (write/merge is M28). All queries are gated on NEO4J_ENABLED
// and return empty results when the graph is off/unreachable, so existing
// `plan_json` authoring stays functional (dual-path during migration).
//
// Merged view: previews "lore if approved" for one plan = canonical `:Content`
// nodes not shadowed (modified/deleted) by the plan's deltas ∪ that plan's
// ADD/MODIFY deltas. DELETE deltas omit their canonical node. Edge topology is
// the canonical edges whose endpoints survive (not deleted).
// ============================================================

import {
  GraphContentNodeSchema,
  GraphEdgeSchema,
  GraphImpactAnalysisSchema,
  type GraphContentNode,
  type GraphEdge,
  type GraphImpactAnalysis,
  type GraphMergedView,
} from '@las-flores/shared';
import { isNeo4jEnabled, runNeo4jQuery } from './Neo4jClient.js';
import { normalizeKeyComponent } from './GraphDeltaService.js';

interface MergedNodeRow {
  nodeType: string;
  nodeId: string;
  name: string | null;
  planId: string | null;
  // Base branch: the object (properties(base)). MODIFY/ADD branch: a wrapper
  // { base, delta } where delta is the ContentDelta.fieldsJson (string or
  // object) and base is the canonical node's properties (or null).
  nodeProps: unknown;
}

interface EdgeRow {
  sourceNodeType: string;
  sourceNodeId: string;
  sourceName: string | null;
  targetNodeType: string;
  targetNodeId: string;
  targetName: string | null;
  type: string;
}

interface CountRow {
  count: unknown;
}

function toMergedNode(row: MergedNodeRow): GraphContentNode {
  // Base branch returns `properties(base)` already an object. The MODIFY/ADD
  // branch returns a wrapper { base, delta } where `delta` is the
  // ContentDelta.fieldsJson (string or object) and `base` is the canonical
  // node's properties (or null). For MODIFY, delta fields override the
  // unchanged canonical fields so the merged view is the full post-approve
  // node; for ADD there is no base, so the delta stands alone.
  let fields: Record<string, unknown> = {};
  const raw = row.nodeProps;
  if (raw && typeof raw === 'object' && 'base' in (raw as Record<string, unknown>) && 'delta' in (raw as Record<string, unknown>)) {
    const wrap = raw as { base: unknown; delta: unknown };
    const base = (wrap.base && typeof wrap.base === 'object' ? wrap.base : {}) as Record<string, unknown>;
    let delta: Record<string, unknown> = {};
    if (typeof wrap.delta === 'string') {
      try { delta = JSON.parse(wrap.delta); } catch { delta = {}; }
    } else if (wrap.delta && typeof wrap.delta === 'object') {
      delta = wrap.delta as Record<string, unknown>;
    }
    fields = { ...base, ...delta };
  } else if (typeof raw === 'string') {
    try {
      fields = JSON.parse(raw);
    } catch {
      fields = {};
    }
  } else if (raw && typeof raw === 'object') {
    fields = raw as Record<string, unknown>;
  }
  return GraphContentNodeSchema.parse({
    nodeType: row.nodeType,
    nodeId: row.nodeId,
    name: row.name ?? undefined,
    planId: row.planId,
    fields,
  });
}

function toEdge(row: EdgeRow): GraphEdge {
  return GraphEdgeSchema.parse({
    sourceNodeType: row.sourceNodeType,
    sourceNodeId: row.sourceNodeId,
    targetNodeType: row.targetNodeType,
    targetNodeId: row.targetNodeId,
    type: row.type,
  });
}

/**
 * Merged-view query for one plan: the "lore if approved" node + edge preview.
 * Returns an empty GraphMergedView when Neo4j is disabled.
 */
export async function getMergedView(planId: string): Promise<GraphMergedView> {
  if (!isNeo4jEnabled()) {
    return { planId, nodes: [], edges: [] };
  }
  // Lowercase a UUID planId so it matches the normalized key stored by applyDelta.
  const normalizedPlanId = normalizeKeyComponent(planId);
  try {
    const nodeRows = await runNeo4jQuery<MergedNodeRow>(`
    MATCH (base:Content)
    WHERE base.planId IS null
      AND (base.isEvidence IS NULL OR base.isEvidence = false)
      AND NOT EXISTS {
        MATCH (d:ContentDelta { planId: $planId, nodeType: base.nodeType, nodeId: base.nodeId })
      }
    RETURN base.nodeType AS nodeType, base.nodeId AS nodeId, base.name AS name,
           base.planId AS planId, properties(base) AS nodeProps
    UNION ALL
    MATCH (d:ContentDelta { planId: $planId })
    WHERE d.op IN ['ADD', 'MODIFY']
    OPTIONAL MATCH (base:Content { nodeType: d.nodeType, nodeId: d.nodeId })
    WHERE base.planId IS null
    RETURN d.nodeType AS nodeType, d.nodeId AS nodeId,
           coalesce(d.name, base.name, '') AS name,
           d.planId AS planId,
           { base: properties(base), delta: d.fieldsJson } AS nodeProps
  `, { planId: normalizedPlanId });

    const nodes = nodeRows.map(toMergedNode);

    // Edge topology: canonical relationships whose two endpoints both survive
    // (neither tombstoned by this plan) — ADD nodes have no edges yet, and
    // MODIFY shadows keep their canonical edges.
    const edgeRows = await runNeo4jQuery<EdgeRow>(`
    MATCH (a:Content)-[r]->(b:Content)
    WHERE a.planId IS null AND b.planId IS null
      AND (a.isEvidence IS NULL OR a.isEvidence = false)
      AND (b.isEvidence IS NULL OR b.isEvidence = false)
      AND NOT EXISTS {
        MATCH (da:ContentDelta { planId: $planId, nodeType: a.nodeType, nodeId: a.nodeId })
        WHERE da.op = 'DELETE'
      }
      AND NOT EXISTS {
        MATCH (db:ContentDelta { planId: $planId, nodeType: b.nodeType, nodeId: b.nodeId })
        WHERE db.op = 'DELETE'
      }
    RETURN a.nodeType AS sourceNodeType, a.nodeId AS sourceNodeId, a.name AS sourceName,
           r AS rel, b.nodeType AS targetNodeType, b.nodeId AS targetNodeId, b.name AS targetName,
           type(r) AS type
  `, { planId: normalizedPlanId });

    const edges = edgeRows.map(toEdge);

    return { planId, nodes, edges };
  } catch (err) {
    // Defensive: a graph that becomes unreachable after startup (or an
    // unexpected row shape) must degrade to the documented empty view rather
    // than propagate an error to plan-authoring callers.
    console.warn('[GraphQueryService] merged-view read failed, returning empty view:', (err as Error).message);
    return { planId, nodes: [], edges: [] };
  }
}

interface TargetNodeRow {
  nodeType: string;
  nodeId: string;
  name: string | null;
  planId: string | null;
  props: Record<string, unknown>;
}

/**
 * Impact analysis: "What links to node X?" — 1-hop traversal. Returns the target
 * node plus incoming/outgoing edges and their neighbors. Empty when disabled.
 */
export async function getImpactAnalysis(nodeType: string, nodeId: string): Promise<GraphImpactAnalysis> {
  if (!isNeo4jEnabled()) {
    return { incoming: [], outgoing: [], neighbors: [] };
  }
  // Normalize id-case so lookup matches canon nodes keyed by lowercase UUID.
  const normalizedId = normalizeKeyComponent(nodeId);
  const nodeParams = { nodeType, nodeId: normalizedId };

  const targetRows = await runNeo4jQuery<TargetNodeRow>(`
    MATCH (n:Content { nodeType: $nodeType, nodeId: $nodeId })
    WHERE n.planId IS null
    RETURN n.nodeType AS nodeType, n.nodeId AS nodeId, n.name AS name, n.planId AS planId, properties(n) AS props
  `, nodeParams);

  const incomingRows = await runNeo4jQuery<EdgeRow>(`
    MATCH (src:Content)-[r]->(n:Content { nodeType: $nodeType, nodeId: $nodeId })
    WHERE n.planId IS null AND src.planId IS null
    RETURN src.nodeType AS sourceNodeType, src.nodeId AS sourceNodeId, src.name AS sourceName,
           n.nodeType AS targetNodeType, n.nodeId AS targetNodeId, n.name AS targetName,
           type(r) AS type
  `, nodeParams);

  const outgoingRows = await runNeo4jQuery<EdgeRow>(`
    MATCH (n:Content { nodeType: $nodeType, nodeId: $nodeId })-[r]->(tgt:Content)
    WHERE n.planId IS null AND tgt.planId IS null
    RETURN n.nodeType AS sourceNodeType, n.nodeId AS sourceNodeId, n.name AS sourceName,
           tgt.nodeType AS targetNodeType, tgt.nodeId AS targetNodeId, tgt.name AS targetName,
           type(r) AS type
  `, nodeParams);

  const incoming = incomingRows.map(toEdge);
  const outgoing = outgoingRows.map(toEdge);

  const neighborSet = new Map<string, GraphContentNode>();
  for (const e of incoming) {
    // Skip self-loops only when BOTH type and id match the target, so a
    // neighbor that happens to share the target's nodeId under a different
    // content type is not dropped from impact analysis.
    if (e.sourceNodeType === nodeType && e.sourceNodeId === nodeId) {
      continue;
    }
    neighborSet.set(`${e.sourceNodeType}:${e.sourceNodeId}`, {
      nodeType: e.sourceNodeType,
      nodeId: e.sourceNodeId,
      name: undefined,
      planId: null,
      fields: {},
    });
  }
  for (const e of outgoing) {
    if (e.targetNodeType === nodeType && e.targetNodeId === nodeId) {
      continue;
    }
    neighborSet.set(`${e.targetNodeType}:${e.targetNodeId}`, {
      nodeType: e.targetNodeType,
      nodeId: e.targetNodeId,
      name: undefined,
      planId: null,
      fields: {},
    });
  }

  const target = targetRows[0]
    ? GraphContentNodeSchema.parse({
        nodeType: targetRows[0].nodeType,
        nodeId: targetRows[0].nodeId,
        name: targetRows[0].name ?? undefined,
        planId: targetRows[0].planId,
        fields: targetRows[0].props ?? {},
      })
    : undefined;

  return GraphImpactAnalysisSchema.parse({
    target,
    incoming,
    outgoing,
    neighbors: [...neighborSet.values()].slice(0, 200),
  });
}

/** Validate a relationship type interpolated into a variable-length pattern. */
const EDGE_TYPE_RE = /^[A-Z][A-Z_0-9]*$/;
function assertEdgeType(type: string): void {
  if (!EDGE_TYPE_RE.test(type)) {
    throw new Error(`Unsafe graph relationship type "${type}"`);
  }
}

interface CyclePathRow {
  path: Array<{ nodeType: string; nodeId: string }>;
}

/**
 * Cycle detection over a relationship type (e.g. custom `DEPENDS_ON` authoring
 * edges). Bounded variable-length traversal from each `:Content` back to itself.
 * Returns the cycles found. Empty when disabled.
 */
export async function detectCycles(
  relationshipType: string,
  maxDepth = 25,
): Promise<Array<{ nodes: Array<{ nodeType: string; nodeId: string }> }>> {
  if (!isNeo4jEnabled()) return [];
  assertEdgeType(relationshipType);
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 100) {
    throw new Error(`Invalid cycle detection depth: ${maxDepth} (expected integer 1..100)`);
  }
  const rows = await runNeo4jQuery<CyclePathRow>(
    `
    MATCH p = (start:Content)-[r:${relationshipType}*1..${maxDepth}]->(start:Content)
    WHERE start.planId IS null
    RETURN [x IN nodes(p) | { nodeType: x.nodeType, nodeId: x.nodeId }] AS path
    LIMIT 100
    `,
    {},
  );
  return rows.map((r) => ({ nodes: r.path }));
}

/**
 * Number of `:ContentDelta` nodes across all plans (telemetry helper).
 * 0 when disabled.
 */
export async function countAllDeltas(): Promise<number> {
  if (!isNeo4jEnabled()) return 0;
  const rows = await runNeo4jQuery<CountRow>(`MATCH (d:ContentDelta) RETURN count(d) AS count`);
  return rows[0]?.count != null ? Number(rows[0].count) : 0;
}
