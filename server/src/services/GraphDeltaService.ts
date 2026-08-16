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

import { GraphDeltaSchema, type GraphDelta } from '@las-flores/shared';
import { isNeo4jEnabled, runNeo4jQuery } from './Neo4jClient.js';

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
    const baseExists = await runNeo4jQuery<{ exists: boolean }>(
      `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId }) WHERE c.planId IS null AND (c.isEvidence IS NULL OR c.isEvidence = false) RETURN count(c) > 0 AS exists`,
      { nodeType, nodeId: nNodeId },
    );
    if (!baseExists[0]?.exists) {
      throw new Error(`${op} delta references non-existent base :Content node [${nodeType}:${nodeId}]`);
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

/** Fetch all deltas belonging to one plan, ordered by creation time. */
export async function getDeltasForPlan(planId: string): Promise<GraphDelta[]> {
  if (!isNeo4jEnabled()) return [];
  const rows = await runNeo4jQuery<{ d: unknown }>(
    `MATCH (d:ContentDelta { planId: $planId }) RETURN d ORDER BY d.createdAt ASC`,
    { planId: normalizeKeyComponent(planId) },
  );
  return rows.map((r) => toGraphDelta(r.d));
}

/** Remove every delta for a plan (e.g. on discard). No-op when disabled. */
export async function clearDeltasForPlan(planId: string): Promise<void> {
  if (!isNeo4jEnabled()) return;
  await runNeo4jQuery(
    `MATCH (d:ContentDelta { planId: $planId }) DELETE d`,
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
