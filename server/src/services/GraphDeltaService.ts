// ============================================================
// GraphDeltaService — plan delta model (ADD / MODIFY / DELETE)
//
// Plans (READ path this milestone; write/merge is M28) are expressed as deltas
// tagged with `plan_id` referencing `content_plans(id)`:
//   - ADD     : a new `:ContentDelta` node (no canonical `:Content` yet)
//   - MODIFY  : a shadow `:ContentDelta` node (same `(nodeType, nodeId)` as the
//               canonical node) carrying the proposed changed fields
//   - DELETE  : a tombstone `:ContentDelta` node marking canonical for removal
//
// Deltas live under the `:ContentDelta` label keyed `(nodeType, nodeId, planId)`
// so plan shadows never collide with canonical `:Content` nodes. All methods
// no-op (return empty) when NEO4J_ENABLED is off.
// ============================================================

import {
  GraphDeltaSchema,
  GraphDeltaEdgeSchema,
  type GraphDelta,
  type GraphDeltaEdge,
} from '@las-flores/shared';
import { isNeo4jEnabled, runNeo4jQuery } from './Neo4jClient.js';
import type { ManagedTransaction } from 'neo4j-driver';

/** UUID shape (case-insensitive), used to normalize identity-key components. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize an identity component used in delta keys/properties so an uppercase
 * UUID and its lowercase form map to the same `:ContentDelta`, and therefore
 * the same merged-view shadow. Non-UUID values (e.g. an ADD slug) are returned
 * unchanged.
 */
export function normalizeKeyComponent(value: string): string {
  return UUID_RE.test(value) ? value.toLowerCase() : value;
}

/** A raw Neo4j node object exposes `properties`. */
interface Neo4jNodeLike {
  properties: Record<string, unknown>;
}

/** Coerce a raw `:ContentDelta` [d] value into a validated shared delta. */
function toGraphDelta(nodeLike: unknown): GraphDelta {
  const props = (nodeLike as Neo4jNodeLike)?.properties ?? {};
  let fields: Record<string, unknown> = {};
  const raw = props.fieldsJson;
  if (typeof raw === 'string') {
    try {
      fields = JSON.parse(raw);
    } catch {
      fields = {};
    }
  } else if (raw && typeof raw === 'object') {
    fields = raw as Record<string, unknown>;
  }
  return GraphDeltaSchema.parse({
    id: props.id as string,
    planId: props.planId as string,
    nodeType: props.nodeType as string,
    nodeId: props.nodeId as string,
    op: props.op as string,
    fields,
    createdAt: props.createdAt as string,
  });
}

/**
 * Persist one plan delta (upsert by `(nodeType, nodeId, planId)`; the latest
 * write for the same key wins). No-op when Neo4j is disabled.
 */
export async function applyDelta(delta: GraphDelta): Promise<void> {
  if (!isNeo4jEnabled()) return;
  const { id, planId, nodeType, nodeId, op, fields, createdAt } = delta;
  const name = typeof fields.name === 'string' ? fields.name : null;
  // Normalize UUID-case so an uppercase id never forks the (nodeType,nodeId,
  // planId) key away from the canonical lowercase UUID the base graph stores.
  const nNodeId = normalizeKeyComponent(nodeId);
  const nPlanId = normalizeKeyComponent(planId);
  // MODIFY/DELETE must reference an existing canonical :Content node (planId IS null).
  // Without this guard, a random UUID passes the schema guard and getDeltasForPlan / merged-view
  // would treat the orphan MODIFY as a visible node, breaking the canonical view.
  if (op !== 'ADD') {
    // Distinguish three cases for the canonical (planId IS null) base node:
    //   - absent entirely            → "non-existent" error
    //   - present only as evidence   → clearer "exists only as evidence" error
    //     (evidence nodes are tagged isEvidence=true by GraphCritiqueService,
    //      and are excluded from the canonical traversal — a MODIFY/DELETE must
    //      target a real canon node, not an evidence excerpt)
    //   - present as a canonical node → allowed
    const base = await runNeo4jQuery<{ anyExists: boolean; canonical: boolean }>(
      `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId })
       WHERE c.planId IS null
       RETURN
         count(c) > 0 AS anyExists,
         count(CASE WHEN c.isEvidence IS NULL OR c.isEvidence = false THEN 1 END) > 0 AS canonical`,
      { nodeType, nodeId: nNodeId },
    );
    const anyExists = base[0]?.anyExists ?? false;
    const canonical = base[0]?.canonical ?? false;
    if (!anyExists) {
      throw new Error(`${op} delta references non-existent base :Content node [${nodeType}:${nodeId}]`);
    }
    if (!canonical) {
      throw new Error(`${op} delta targets a base :Content node that exists only as evidence (no canonical node) [${nodeType}:${nodeId}]`);
    }
  }
  await runNeo4jQuery(
    `
    MERGE (d:ContentDelta { key: $key })
    ON CREATE SET d.nodeType = $nodeType, d.nodeId = $nodeId, d.planId = $planId,
                  d.op = $op, d.name = $name, d.fieldsJson = $fieldsJson,
                  d.createdAt = $createdAt, d.id = $id
    ON MATCH SET  d.nodeType = $nodeType, d.nodeId = $nodeId,
                  d.op = $op, d.name = $name, d.fieldsJson = $fieldsJson, d.id = $id,
                  d.createdAt = $createdAt
    `,
    // Surrogate unique key (Community Edition can't NODE KEY on 3 props).
    // Neo4j properties can't be maps, so fields are stored as a JSON string.
    // `createdAt` is refreshed on MATCH too so a re-applied edit moves the delta
    // to its true position (getDeltasForPlan orders by createdAt ASC).
    { key: `${nodeType}:${nNodeId}:${nPlanId}`, nodeType, nodeId: nNodeId, planId: nPlanId, op, name, fieldsJson: JSON.stringify(fields), createdAt, id },
  );
}

/**
 * Run a Cypher read inside an existing transaction when one is supplied, else a
 * standalone session query. Keeps reads and writes on the same transaction
 * snapshot (used by `commitGraph`, where the final delta delete must not drop
 * deltas written after the read).
 */
async function queryRows<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown>,
  tx?: ManagedTransaction,
): Promise<T[]> {
  if (tx) {
    const result = await tx.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  }
  return runNeo4jQuery<T>(cypher, params);
}

/** Fetch all deltas belonging to one plan, ordered by creation time. */
export async function getDeltasForPlan(planId: string, tx?: ManagedTransaction): Promise<GraphDelta[]> {
  if (!isNeo4jEnabled()) return [];
  const rows = await queryRows<{ d: unknown }>(
    `MATCH (d:ContentDelta { planId: $planId }) RETURN d ORDER BY d.createdAt ASC`,
    { planId: normalizeKeyComponent(planId) },
    tx,
  );
  return rows.map((r) => toGraphDelta(r.d));
}

/**
 * Persist a plan delta edge: MERGE a relationship with the whitelisted edge type
 * and a `planId` property, from the plan's `:ContentDelta` node to either a
 * canonical `:Content` node or another `:ContentDelta` of the same plan. Both
 * endpoints MUST exist (reuses the canonical-node guard pattern from
 * `applyDelta`). No-op when Neo4j is disabled.
 */
export async function applyDeltaEdge(edge: GraphDeltaEdge): Promise<void> {
  if (!isNeo4jEnabled()) return;
  const { planId, sourceNodeType, sourceNodeId, targetNodeType, targetNodeId, type } = edge;
  if (!/^[A-Z][A-Z_0-9]*$/.test(type)) {
    throw new Error(`Unsafe graph relationship type "${type}"`);
  }
  const nPlanId = normalizeKeyComponent(planId);
  const nSourceId = normalizeKeyComponent(sourceNodeId);
  const nTargetId = normalizeKeyComponent(targetNodeId);

  // Validate the source delta node exists for this plan.
  const sourceExists = await runNeo4jQuery<{ count: unknown }>(
    `MATCH (d:ContentDelta { planId: $planId, nodeType: $sourceNodeType, nodeId: $sourceNodeId })
     RETURN count(d) AS count`,
    { planId: nPlanId, sourceNodeType, sourceNodeId: nSourceId },
  );
  if (Number(sourceExists[0]?.count ?? 0) === 0) {
    throw new Error(`Delta edge source references non-existent :ContentDelta [${sourceNodeType}:${sourceNodeId}] for plan ${planId}`);
  }

  // Target may be a canonical :Content node (planId IS null) OR a same-plan
  // :ContentDelta (so two ADD entities in one plan can link). The canonical
  // :Content match must also exclude critique evidence nodes (isEvidence=true),
  // matching applyDelta's guard, so an edge can never point at an invisible
  // evidence excerpt.
  const targetExists = await runNeo4jQuery<{ count: unknown }>(
    `MATCH (c:Content { nodeType: $targetNodeType, nodeId: $targetNodeId })
       WHERE c.planId IS null AND (c.isEvidence IS NULL OR c.isEvidence = false)
     RETURN count(c) AS count
     UNION ALL
     MATCH (d:ContentDelta { planId: $planId, nodeType: $targetNodeType, nodeId: $targetNodeId })
     RETURN count(d) AS count`,
    { planId: nPlanId, targetNodeType, targetNodeId: nTargetId },
  );
  const targetCount = (targetExists[0]?.count != null ? Number(targetExists[0].count) : 0)
    + (targetExists[1]?.count != null ? Number(targetExists[1].count) : 0);
  if (targetCount === 0) {
    throw new Error(`Delta edge target references non-existent :Content/:ContentDelta [${targetNodeType}:${targetNodeId}] for plan ${planId}`);
  }

  // Select a single target before MERGE: prefer the same-plan :ContentDelta
  // (so two ADD entities in one plan can link), else the canonical :Content
  // node (planId IS null). OPTIONAL MATCH keeps the source row alive even when
  // only one target kind exists, and CASE prefers the delta — this avoids the
  // returning-CALL row-elimination that dropped delta-only targets and the
  // duplicate link that both CALL blocks created when both targets existed.
  await runNeo4jQuery(
    `
    MATCH (s:ContentDelta { planId: $planId, nodeType: $sourceNodeType, nodeId: $sourceNodeId })
    OPTIONAL MATCH (td:ContentDelta { planId: $planId, nodeType: $targetNodeType, nodeId: $targetNodeId })
    OPTIONAL MATCH (tc:Content { nodeType: $targetNodeType, nodeId: $targetNodeId })
      WHERE tc.planId IS null
    WITH s, CASE WHEN td IS NOT NULL THEN td ELSE tc END AS t
    WHERE t IS NOT NULL
    MERGE (s)-[r:${type} { planId: $planId }]->(t)
    RETURN r
    `,
    { planId: nPlanId, sourceNodeType, sourceNodeId: nSourceId, targetNodeType, targetNodeId: nTargetId },
  );
}

/** Coerce a raw delta-edge row into a validated GraphDeltaEdge. */
function toGraphDeltaEdge(row: Record<string, unknown>): GraphDeltaEdge {
  return GraphDeltaEdgeSchema.parse({
    planId: row.planId,
    sourceNodeType: row.sourceNodeType,
    sourceNodeId: row.sourceNodeId,
    targetNodeType: row.targetNodeType,
    targetNodeId: row.targetNodeId,
    type: row.type,
    resolvedType: row.resolvedType ?? undefined,
  });
}

/**
 * Fetch all delta edges belonging to one plan (relationships from the plan's
 * `:ContentDelta` nodes carrying the planId). Empty when disabled.
 */
export async function getDeltaEdgesForPlan(planId: string, tx?: ManagedTransaction): Promise<GraphDeltaEdge[]> {
  if (!isNeo4jEnabled()) return [];
  const nPlanId = normalizeKeyComponent(planId);
  const rows = await queryRows<Record<string, unknown>>(
    `
    MATCH (s:ContentDelta { planId: $planId })-[r]->(t)
    WHERE r.planId = $planId
    RETURN s.nodeType AS sourceNodeType, s.nodeId AS sourceNodeId,
           t.nodeType AS targetNodeType, t.nodeId AS targetNodeId,
           type(r) AS type, $planId AS planId
    `,
    { planId: nPlanId },
    tx,
  );
  return rows.map(toGraphDeltaEdge);
}

/** Remove every delta (and its edges) for a plan (e.g. on discard/commit). No-op when disabled. */
export async function clearDeltasForPlan(planId: string): Promise<void> {
  if (!isNeo4jEnabled()) return;
  await runNeo4jQuery(
    `MATCH (d:ContentDelta { planId: $planId }) DETACH DELETE d`,
    { planId: normalizeKeyComponent(planId) },
  );
}

/** Count of deltas on a plan (verification/telemetry helper). */
export async function countDeltasForPlan(planId: string): Promise<number> {
  if (!isNeo4jEnabled()) return 0;
  const rows = await runNeo4jQuery<{ count: unknown }>(
    `MATCH (d:ContentDelta { planId: $planId }) RETURN count(d) AS count`,
    { planId: normalizeKeyComponent(planId) },
  );
  return rows[0]?.count != null ? Number(rows[0].count) : 0;
}

/** Aggregate summary of the deltas on a plan (op → per nodeType counts). */
export async function summarizeDeltasForPlan(planId: string): Promise<{ total: number; byOp: Record<string, number> }> {
  const deltas = await getDeltasForPlan(planId);
  const byOp: Record<string, number> = {};
  for (const d of deltas) {
    byOp[d.op] = (byOp[d.op] ?? 0) + 1;
  }
  return { total: deltas.length, byOp };
}
