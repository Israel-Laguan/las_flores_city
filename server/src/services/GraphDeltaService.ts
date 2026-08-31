/* eslint-disable max-lines */
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
  findEdgeMapping,
  type GraphDelta,
  type GraphDeltaEdge,
  type IntakeDiagnostic,
} from '@las-flores/shared';
import { createHash } from 'node:crypto';
import { isNeo4jEnabled, runNeo4jQuery, runNeo4jTransaction } from './Neo4jClient.js';
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
  let resolution: unknown;
  const resRaw = props.resolutionJson;
  if (typeof resRaw === 'string') {
    try {
      resolution = JSON.parse(resRaw);
    } catch {
      resolution = undefined;
    }
  } else if (resRaw && typeof resRaw === 'object') {
    resolution = resRaw;
  }
  return GraphDeltaSchema.parse({
    id: props.id as string,
    planId: props.planId as string,
    nodeType: props.nodeType as string,
    nodeId: props.nodeId as string,
    op: props.op as string,
    fields,
    createdAt: props.createdAt as string,
    ...(resolution != null ? { _resolution: resolution } : {}),
  });
}

/**
 * Persist one plan delta (upsert by `(nodeType, nodeId, planId)`; the latest
 * write for the same key wins). No-op when Neo4j is disabled.
 */
export async function applyDelta(delta: GraphDelta, tx?: ManagedTransaction): Promise<void> {
  if (!isNeo4jEnabled()) return;
  const { id, planId, nodeType, nodeId, op, fields, createdAt, _resolution } = delta;
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
    const base = await queryRows<{ anyExists: boolean; canonical: boolean }>(
      `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId })
       WHERE c.planId IS null
       RETURN
         count(c) > 0 AS anyExists,
         count(CASE WHEN c.isEvidence IS NULL OR c.isEvidence = false THEN 1 END) > 0 AS canonical`,
      { nodeType, nodeId: nNodeId },
      tx,
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
  await queryRows(
    `
    MERGE (d:ContentDelta { key: $key })
    ON CREATE SET d.nodeType = $nodeType, d.nodeId = $nodeId, d.planId = $planId,
                  d.op = $op, d.name = $name, d.fieldsJson = $fieldsJson,
                  d.resolutionJson = $resolutionJson,
                  d.createdAt = $createdAt, d.id = $id
    ON MATCH SET  d.nodeType = $nodeType, d.nodeId = $nodeId,
                  d.op = $op, d.name = $name, d.fieldsJson = $fieldsJson,
                  d.resolutionJson = $resolutionJson, d.id = $id,
                  d.createdAt = $createdAt
    `,
    // Surrogate unique key (Community Edition can't NODE KEY on 3 props).
    // Neo4j properties can't be maps, so fields are stored as a JSON string.
    // `createdAt` is refreshed on MATCH too so a re-applied edit moves the delta
    // to its true position (getDeltasForPlan orders by createdAt ASC).
    { key: `${nodeType}:${nNodeId}:${nPlanId}`, nodeType, nodeId: nNodeId, planId: nPlanId, op, name, fieldsJson: JSON.stringify(fields), resolutionJson: JSON.stringify(_resolution ?? null), createdAt, id },
    tx,
  );
}
/**
 * Preflight-guard a whole delta batch before any write: every MODIFY/DELETE
 * delta must reference an existing canonical `:Content` node (planId IS null).
 * Throws before any delta/edge is written so `applyDeltas` can never leave a
 * partially-applied proposal in Neo4j when a later guard would fail.
 */
export async function preflightDeltas(deltas: GraphDelta[], tx?: ManagedTransaction): Promise<void> {
  if (!isNeo4jEnabled()) return;
  for (const delta of deltas) {
    const { nodeType, nodeId, op } = delta;
    if (op === 'ADD') continue;
    const nNodeId = normalizeKeyComponent(nodeId);
    const base = await queryRows<{ anyExists: boolean; canonical: boolean; planLocal: boolean }>(
      `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId })
       WHERE c.planId IS null
       RETURN
         count(c) > 0 AS anyExists,
         count(CASE WHEN c.isEvidence IS NULL OR c.isEvidence = false THEN 1 END) > 0 AS canonical,
         false AS planLocal
       UNION ALL
       MATCH (d:ContentDelta { nodeType: $nodeType, nodeId: $nodeId, planId: $planId })
       RETURN false AS anyExists, false AS canonical, count(d) > 0 AS planLocal`,
       { nodeType, nodeId: nNodeId, planId: normalizeKeyComponent(delta.planId) },
       tx,
     );
     const anyExists = base.some((r) => r.anyExists);
     const canonical = base.some((r) => r.canonical);
     const planLocal = base.some((r) => r.planLocal);
     // A same-plan :ContentDelta is a valid MODIFY/DELETE base: amending a plan
     // delta that remakes an entity authored in this plan should MERGE in place
     // rather than being dropped as a missing canonical node.
     if (planLocal) continue;
    if (!anyExists) {
      throw new Error(`${op} delta references non-existent base :Content node [${nodeType}:${nodeId}]`);
    }
    if (!canonical) {
      throw new Error(`${op} delta targets a base :Content node that exists only as evidence (no canonical node) [${nodeType}:${nodeId}]`);
    }
  }
}

/**
 * Preflight-guard a whole delta-edge batch before any write: every edge's
 * source `:ContentDelta` and target (canonical `:Content` or same-plan
 * `:ContentDelta`) must exist, and the relationship type must be safe. Throws
 * before any delta/edge is written so `applyDeltas` can never leave a
 * partially-applied proposal in Neo4j when a later edge guard would fail.
 */
export async function preflightDeltaEdges(edges: GraphDeltaEdge[], tx?: ManagedTransaction): Promise<void> {
  if (!isNeo4jEnabled()) return;
  for (const edge of edges) {
    const { planId, sourceNodeType, sourceNodeId, targetNodeType, targetNodeId, type } = edge;
    if (!/^[A-Z][A-Z_0-9]*$/.test(type)) {
      throw new Error(`Unsafe graph relationship type "${type}"`);
    }
    const nPlanId = normalizeKeyComponent(planId);
    const nSourceId = normalizeKeyComponent(sourceNodeId);
    const nTargetId = normalizeKeyComponent(targetNodeId);

    const sourceExists = await queryRows<{ count: unknown }>(
      `MATCH (d:ContentDelta { planId: $planId, nodeType: $sourceNodeType, nodeId: $sourceNodeId })
       RETURN count(d) AS count`,
      { planId: nPlanId, sourceNodeType, sourceNodeId: nSourceId },
      tx,
    );
    if (Number(sourceExists[0]?.count ?? 0) === 0) {
      throw new Error(`Delta edge source references non-existent :ContentDelta [${sourceNodeType}:${sourceNodeId}] for plan ${planId}`);
    }

    const targetExists = await queryRows<{ count: unknown }>(
      `MATCH (c:Content { nodeType: $targetNodeType, nodeId: $targetNodeId })
          WHERE c.planId IS null AND (c.isEvidence IS NULL OR c.isEvidence = false)
        RETURN count(c) AS count
        UNION ALL
        MATCH (d:ContentDelta { planId: $planId, nodeType: $targetNodeType, nodeId: $targetNodeId })
        RETURN count(d) AS count`,
      { planId: nPlanId, targetNodeType, targetNodeId: nTargetId },
      tx,
    );
    const targetCount = (targetExists[0]?.count != null ? Number(targetExists[0].count) : 0)
      + (targetExists[1]?.count != null ? Number(targetExists[1].count) : 0);
    if (targetCount === 0) {
      throw new Error(`Delta edge target references non-existent :Content/:ContentDelta [${targetNodeType}:${targetNodeId}] for plan ${planId}`);
    }
  }
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

/** Stable identity key for a delta/edge endpoint, `nodeType:normalizedNodeId`. */
export function deltaKey(nodeType: string, nodeId: string): string {
  return `${nodeType}:${normalizeKeyComponent(nodeId)}`;
}

/**
 * Fail-open sibling of `preflightDeltas`: instead of throwing on the first
 * MODIFY/DELETE delta whose canonical base `:Content` node is missing, drop that
 * delta from `safe` and record an `IntakeDiagnostic`.
 *
 * `preflightDeltas` is intentionally left intact for callers that want strict
 * all-or-nothing validation. This variant exists so plan intake can stay lenient:
 * one bad reference (typically the LLM guessing an id for an ambiguous name)
 * must not destroy the whole plan. ADD deltas always pass — they define their own
 * node, so there is nothing to look up.
 */
export async function partitionDeltas(
  deltas: GraphDelta[],
  tx?: ManagedTransaction,
): Promise<{ safe: GraphDelta[]; diagnostics: IntakeDiagnostic[] }> {
  // With the graph disabled there is nothing to validate against, so every delta
  // is nominally "safe" — matching `preflightDeltas`, which no-ops in that case.
  if (!isNeo4jEnabled()) return { safe: [...deltas], diagnostics: [] };

  const safe: GraphDelta[] = [];
  const diagnostics: IntakeDiagnostic[] = [];

  for (const delta of deltas) {
    const { nodeType, nodeId, op } = delta;
    if (op === 'ADD') {
      safe.push(delta);
      continue;
    }
    const nNodeId = normalizeKeyComponent(nodeId);
    const base = await queryRows<{ anyExists: boolean; canonical: boolean; planLocal: boolean }>(
      `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId })
       WHERE c.planId IS null
       RETURN
         count(c) > 0 AS anyExists,
         count(CASE WHEN c.isEvidence IS NULL OR c.isEvidence = false THEN 1 END) > 0 AS canonical,
         false AS planLocal
       UNION ALL
       MATCH (d:ContentDelta { nodeType: $nodeType, nodeId: $nodeId, planId: $planId })
       RETURN false AS anyExists, false AS canonical, count(d) > 0 AS planLocal`,
       { nodeType, nodeId: nNodeId, planId: normalizeKeyComponent(delta.planId) },
       tx,
     );
     const anyExists = base.some((r) => r.anyExists);
     const canonical = base.some((r) => r.canonical);
     const planLocal = base.some((r) => r.planLocal);

     // A same-plan :ContentDelta is a valid MODIFY/DELETE base: amending a plan
    // delta that remakes an entity authored in this plan should MERGE in place
    // (applyDelta keys on nodeType:nodeId:planId) rather than being dropped.
    if (planLocal || (anyExists && canonical)) {
      safe.push(delta);
      continue;
    }

    // Prefer the delta's own `name` as the human-facing `raw` wording — that is
    // what the author actually wrote — and fall back to the id when absent.
    const name = typeof delta.fields?.name === 'string' ? delta.fields.name : '';
    diagnostics.push({
      nodeType,
      nodeId,
      raw: name.length > 0 ? name : nodeId,
      kind: anyExists ? 'evidence_only_node' : 'missing_base_node',
      status: 'unresolved',
      candidates: [],
      reason: anyExists
        ? `${op} delta targets a base :Content node that exists only as evidence (no canonical node) [${nodeType}:${nodeId}] — dropped from this plan.`
        : `${op} delta references a non-existent base :Content node [${nodeType}:${nodeId}] — dropped from this plan.`,
    });
  }

  return { safe, diagnostics };
}

/**
 * Fail-open sibling of `preflightDeltaEdges`.
 *
 * The relationship-type check stays a HARD THROW: `type` is interpolated
 * straight into Cypher by `applyDeltaEdge`, so waving an unsafe type through
 * would be an injection hole. This also matches the milestone's own carve-out
 * that structural failures still block, while semantic ambiguity does not.
 *
 * Endpoint existence becomes advisory. A dangling source or target drops the
 * edge and records a diagnostic. `safeDeltaKeys` (from `partitionDeltas`, via
 * `deltaKey`) lets a source be recognised as valid even before its delta is
 * written, and — critically — lets an edge whose source delta was DROPPED be
 * reported as dangling rather than silently attaching to a stale node from a
 * previous run.
 */
export async function partitionDeltaEdges(
  edges: GraphDeltaEdge[],
  safeDeltaKeys: ReadonlySet<string>,
  tx?: ManagedTransaction,
  droppedDeltaKeys: ReadonlySet<string> = new Set(),
): Promise<{ safe: GraphDeltaEdge[]; diagnostics: IntakeDiagnostic[] }> {
  const safe: GraphDeltaEdge[] = [];
  const diagnostics: IntakeDiagnostic[] = [];

  for (const edge of edges) {
    const { planId, sourceNodeType, sourceNodeId, targetNodeType, targetNodeId, type } = edge;

    // Structural / injection safety — never fails open.
    if (!/^[A-Z][A-Z_0-9]*$/.test(type)) {
      throw new Error(`Unsafe graph relationship type "${type}"`);
    }

    // `raw` mirrors PlanConsistencyChecker's relationship reporting shape so the
    // note reads as the edge the author asked for.
    const raw = `${type} ${sourceNodeType}:${sourceNodeId} -> ${targetNodeType}:${targetNodeId}`;

    if (!isNeo4jEnabled()) {
      safe.push(edge);
      continue;
    }

    const nPlanId = normalizeKeyComponent(planId);
    const nSourceId = normalizeKeyComponent(sourceNodeId);
    const nTargetId = normalizeKeyComponent(targetNodeId);

    // The source must be a delta of THIS plan. Trust `safeDeltaKeys` first: it
    // reflects the write set this run is about to commit, so an edge is not
    // rejected merely because its source has not been written yet.
    let sourceOk = safeDeltaKeys.has(deltaKey(sourceNodeType, sourceNodeId));
    // A source this run explicitly DROPPED must not be revived by a stale
    // :ContentDelta node left over from an earlier run — skip the graph lookup
    // so the edge is reported as dangling instead of silently attaching.
    if (!sourceOk && !droppedDeltaKeys.has(deltaKey(sourceNodeType, sourceNodeId))) {
      const sourceRows = await queryRows<{ count: unknown }>(
        `MATCH (d:ContentDelta { planId: $planId, nodeType: $sourceNodeType, nodeId: $sourceNodeId })
         RETURN count(d) AS count`,
        { planId: nPlanId, sourceNodeType, sourceNodeId: nSourceId },
        tx,
      );
      sourceOk = Number(sourceRows[0]?.count ?? 0) > 0;
    }
    if (!sourceOk) {
      diagnostics.push({
        nodeType: sourceNodeType,
        nodeId: sourceNodeId,
        field: 'links',
        raw,
        kind: 'dangling_edge_source',
        status: 'unresolved',
        candidates: [],
        reason: `Delta edge source references a non-existent :ContentDelta [${sourceNodeType}:${sourceNodeId}] for plan ${planId} — relationship dropped from this plan.`,
      });
      continue;
    }

    // The target may be a canonical `:Content` node or another delta of this plan.
    let targetOk = safeDeltaKeys.has(deltaKey(targetNodeType, targetNodeId));
    if (!targetOk) {
      const targetRows = await queryRows<{ count: unknown }>(
        `MATCH (c:Content { nodeType: $targetNodeType, nodeId: $targetNodeId })
            WHERE c.planId IS null AND (c.isEvidence IS NULL OR c.isEvidence = false)
          RETURN count(c) AS count
          UNION ALL
          MATCH (d:ContentDelta { planId: $planId, nodeType: $targetNodeType, nodeId: $targetNodeId })
          RETURN count(d) AS count`,
        { planId: nPlanId, targetNodeType, targetNodeId: nTargetId },
        tx,
      );
      const targetCount = (targetRows[0]?.count != null ? Number(targetRows[0].count) : 0)
        + (targetRows[1]?.count != null ? Number(targetRows[1].count) : 0);
      targetOk = targetCount > 0;
    }
    if (!targetOk) {
      diagnostics.push({
        nodeType: targetNodeType,
        nodeId: targetNodeId,
        field: 'links',
        raw,
        kind: 'dangling_edge_target',
        status: 'unresolved',
        candidates: [],
        reason: `Delta edge target references a non-existent :Content/:ContentDelta [${targetNodeType}:${targetNodeId}] for plan ${planId} — relationship dropped from this plan.`,
      });
      continue;
    }

    safe.push(edge);
  }

  return { safe, diagnostics };
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

// Derive a deterministic RFC-4122 v5-style UUID from an arbitrary seed string.
// Used to turn a plan's delta set into a stable, content-addressed revision
// token that is still schema-valid (`plan_revision` requires a UUID shape).
function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest();
  const b = Buffer.alloc(16);
  hash.copy(b, 0, 0, 16);
  b[6] = (b.readUInt8(6) & 0x0f) | 0x50; // version 5
  b[8] = (b.readUInt8(8) & 0x3f) | 0x80; // variant 10xx
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Content-addressed revision token for a plan's delta set. Stable for an
 * unchanged set of deltas; changes whenever any delta is added, removed, or
 * edited. Bound to the exported plan via `_meta.plan_revision` so the approve
 * gate can re-validate that the graph has not changed since export (and detect
 * when `commitGraph` later promotes a different, newer delta set).
 * 
 * NOTE: This function ONLY hashes deltas (nodes), not edges. For a complete
 * revision that includes edges, use `buildPlanRevisionFromDeltasAndEdges`.
 * This legacy function is kept for backward compatibility.
 */
export function buildPlanRevisionFromDeltas(deltas: GraphDelta[]): string {
  const parts = deltas
    .map((d) => `${d.op}|${d.nodeType}|${d.nodeId}|${d.id}|${JSON.stringify(d.fields ?? {})}`)
    .sort();
  return deterministicUuid(parts.join('\u0000'));
}

/**
 * True when a delta edge's mapping resolves the target's canonical NAME into the
 * source item's fields (today only IN_DISTRICT → District). For these edges the
 * resolved name is a canonical VALUE the exporter writes into `sourceItem.fields`
 * that is NOT captured by the delta/edge identity hashes — so it must be folded
 * into the revision seed or a base-node rename would go undetected at approve.
 */
export function isNameValuedEdge(e: GraphDeltaEdge): boolean {
  return findEdgeMapping(e.type, e.sourceNodeType, e.targetNodeType)?.value === 'name';
}

/**
 * Resolve the canonical value a name-valued edge writes into the source item's
 * fields: the target base node's `name`, falling back to the stable target
 * `nodeId` when the name is absent. Mirrors `GraphExporter.resolveEdgeLinks` so
 * the exporter and the approve revalidation seed the revision identically.
 */
export function resolveEdgeTargetNameValue(
  e: GraphDeltaEdge,
  nameByKey: Map<string, string>,
): string {
  return nameByKey.get(`${e.targetNodeType}:${e.targetNodeId}`) ?? e.targetNodeId;
}

/**
 * Revision seed part for one name-valued edge: pairs the edge identity with the
 * canonical VALUE it writes into the source item's fields. Each resolved value
 * is folded in TOGETHER WITH its edge identity (not as a bare, sorted list of
 * names) so that swapping two name-valued edges that point at two differently
 * named Districts yields a different revision — otherwise the sorted name list
 * would be identical and the approve gate could accept an export whose
 * `district` fields are stale.
 */
export function nameValuedEdgeRevisionPart(e: GraphDeltaEdge, resolvedName: string): string {
  return JSON.stringify([
    e.sourceNodeType,
    e.sourceNodeId,
    e.targetNodeType,
    e.targetNodeId,
    e.type,
    resolvedName,
  ]);
}

/**
 * Content-addressed revision token for a plan's delta set INCLUDING edges.
 * This ensures that changes to relationships (edges) between deltas are also
 * detected, preventing a situation where edge changes after export remain
 * undetected while `commitGraph` promotes them.
 *
 * The optional `resolvedTargetNames` folds in the canonical VALUES the exporter
 * writes for name-valued (IN_DISTRICT) edges, so a base-node rename (with
 * unchanged deltas/edges) is also detected. Default `[]` keeps the legacy
 * deltas+edges-only output for other callers.
 */
export function buildPlanRevisionFromDeltasAndEdges(
  deltas: GraphDelta[],
  edges: GraphDeltaEdge[],
  resolvedTargetNames: readonly string[] = [],
): string {
  const deltaParts = deltas
    .map((d) => `${d.op}|${d.nodeType}|${d.nodeId}|${d.id}|${JSON.stringify(d.fields ?? {})}`)
    .sort();
  const edgeParts = edges
    .map((e) => `${e.sourceNodeType}|${e.sourceNodeId}|${e.targetNodeType}|${e.targetNodeId}|${e.type}|${e.planId}`)
    .sort();
  const nameParts = [...resolvedTargetNames].sort();
  return deterministicUuid([...deltaParts, ...edgeParts, ...nameParts].join('\u0000'));
}

/** Current content-addressed revision of a plan's delta set (Neo4j read). */
export async function getPlanDeltaRevision(planId: string): Promise<string> {
  return buildPlanRevisionFromDeltas(await getDeltasForPlan(planId));
}

/**
 * Current content-addressed revision of a plan's delta set INCLUDING edges and
 * the canonical NAME values resolved for name-valued (IN_DISTRICT) edges.
 * Reads deltas, edges, and the resolved base-node names inside a single
 * transaction so a graph write occurring between two independent reads cannot
 * leave the revision covering an inconsistent snapshot (which would let the
 * approve gate accept a stale export). Folding the names in also means a base
 * District rename — with unchanged deltas/edges — is detected and aborts approve.
 */
export async function getPlanDeltaRevisionWithEdges(planId: string): Promise<string> {
  if (!isNeo4jEnabled()) {
    return buildPlanRevisionFromDeltasAndEdges([], []);
  }
  const revision = await runNeo4jTransaction(async (tx) => {
    const [deltas, edges] = await Promise.all([
      getDeltasForPlan(planId, tx),
      getDeltaEdgesForPlan(planId, tx),
    ]);
    const nameEdges = edges.filter(isNameValuedEdge);
    const nameByKey = await loadBaseNodeNames(nameEdges, tx);
    const resolvedTargetNames = nameEdges
      .map((e) => nameValuedEdgeRevisionPart(e, resolveEdgeTargetNameValue(e, nameByKey)))
      .sort();
    return buildPlanRevisionFromDeltasAndEdges(deltas, edges, resolvedTargetNames);
  });
  return revision ?? buildPlanRevisionFromDeltasAndEdges([], []);
}

/**
 * Load the canonical base `:Content` node `name`s for the targets of name-valued
 * delta edges, within the supplied transaction so the revision seed observes the
 * same snapshot as the deltas/edges read. Grouped by `nodeType` (one query per
 * type) so it stays valid if more name-valued mappings are added. A canonical
 * District can never be a plan delta (the exporter rejects the District node
 * type), so its resolved name is always the base node's `name`.
 */
async function loadBaseNodeNames(
  edges: GraphDeltaEdge[],
  tx: ManagedTransaction,
): Promise<Map<string, string>> {
  const byType = new Map<string, string[]>();
  for (const e of edges) {
    const list = byType.get(e.targetNodeType) ?? [];
    list.push(e.targetNodeId);
    byType.set(e.targetNodeType, list);
  }
  const map = new Map<string, string>();
  for (const [nodeType, ids] of byType) {
    const rows = await queryRows<{ nodeId: string; name: unknown }>(
      `MATCH (c:Content { nodeType: $nodeType })
       WHERE c.planId IS null AND c.nodeId IN $ids
       RETURN c.nodeId AS nodeId, c.name AS name`,
      { nodeType, ids },
      tx,
    );
    for (const row of rows) {
      if (row.name != null) map.set(`${nodeType}:${row.nodeId}`, String(row.name));
    }
  }
  return map;
}

/**
 * Persist a plan delta edge: MERGE a relationship with the whitelisted edge type
 * and a `planId` property, from the plan's `:ContentDelta` node to either a
 * canonical `:Content` node or another `:ContentDelta` of the same plan. Both
 * endpoints MUST exist (reuses the canonical-node guard pattern from
 * `applyDelta`). No-op when Neo4j is disabled.
 */
export async function applyDeltaEdge(edge: GraphDeltaEdge, tx?: ManagedTransaction): Promise<void> {
  if (!isNeo4jEnabled()) return;
  const { planId, sourceNodeType, sourceNodeId, targetNodeType, targetNodeId, type } = edge;
  if (!/^[A-Z][A-Z_0-9]*$/.test(type)) {
    throw new Error(`Unsafe graph relationship type "${type}"`);
  }
  const nPlanId = normalizeKeyComponent(planId);
  const nSourceId = normalizeKeyComponent(sourceNodeId);
  const nTargetId = normalizeKeyComponent(targetNodeId);

  // Validate the source delta node exists for this plan.
  const sourceExists = await queryRows<{ count: unknown }>(
    `MATCH (d:ContentDelta { planId: $planId, nodeType: $sourceNodeType, nodeId: $sourceNodeId })
     RETURN count(d) AS count`,
    { planId: nPlanId, sourceNodeType, sourceNodeId: nSourceId },
    tx,
  );
  if (Number(sourceExists[0]?.count ?? 0) === 0) {
    throw new Error(`Delta edge source references non-existent :ContentDelta [${sourceNodeType}:${sourceNodeId}] for plan ${planId}`);
  }

  // Target may be a canonical :Content node (planId IS null) OR a same-plan
  // :ContentDelta (so two ADD entities in one plan can link). The canonical
  // :Content match must also exclude critique evidence nodes (isEvidence=true),
  // matching applyDelta's guard, so an edge can never point at an invisible
  // evidence excerpt.
  const targetExists = await queryRows<{ count: unknown }>(
    `MATCH (c:Content { nodeType: $targetNodeType, nodeId: $targetNodeId })
       WHERE c.planId IS null AND (c.isEvidence IS NULL OR c.isEvidence = false)
     RETURN count(c) AS count
     UNION ALL
     MATCH (d:ContentDelta { planId: $planId, nodeType: $targetNodeType, nodeId: $targetNodeId })
     RETURN count(d) AS count`,
    { planId: nPlanId, targetNodeType, targetNodeId: nTargetId },
    tx,
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
  await queryRows(
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
    tx,
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

/**
 * Fetch all delta edges belonging to MANY plans in a single query (the global
 * `needs_review` queue source). Relationships from each plan's `:ContentDelta`
 * nodes carrying a matching `planId`. Empty when disabled.
 */
export async function getDeltaEdgesForPlans(planIds: string[], tx?: ManagedTransaction): Promise<GraphDeltaEdge[]> {
  if (!isNeo4jEnabled()) return [];
  const nPlanIds = planIds.map(normalizeKeyComponent);
  if (nPlanIds.length === 0) return [];
  const rows = await queryRows<Record<string, unknown>>(
    `
    MATCH (s:ContentDelta)-[r]->(t)
    WHERE s.planId IN $planIds AND r.planId IN $planIds
    RETURN s.nodeType AS sourceNodeType, s.nodeId AS sourceNodeId,
           t.nodeType AS targetNodeType, t.nodeId AS targetNodeId,
           type(r) AS type, s.planId AS planId
    `,
    { planIds: nPlanIds },
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

// ── M29: single-delta removal + all-deltas reads (needs_review queue sources) ──

/**
 * DETACH DELETE one plan delta by its surrogate `(nodeType, nodeId, planId)` key.
 * Used by "[Keep existing]" on the review queue — the author declines a proposed
 * delta, leaving the canonical base graph untouched. No-op when Neo4j is disabled.
 */
export async function removeDelta(planId: string, nodeType: string, nodeId: string): Promise<void> {
  if (!isNeo4jEnabled()) return;
  await runNeo4jQuery(
    `MATCH (d:ContentDelta { key: $key }) DETACH DELETE d`,
    { key: `${nodeType}:${normalizeKeyComponent(nodeId)}:${normalizeKeyComponent(planId)}` },
  );
}

/** Defensively coerce one raw `:ContentDelta` node; skip anything unreadable. */
function safeToGraphDelta(nodeLike: unknown): GraphDelta | null {
  try {
    return toGraphDelta(nodeLike);
  } catch {
    return null;
  }
}


/**
 * Every proposed delta across ALL plans (the global `needs_review` queue source).
 * A single unreadable node is skipped, never allowed to sink the whole queue.
 * Empty when Neo4j is disabled.
 */
export async function getAllDeltas(): Promise<GraphDelta[]> {
  if (!isNeo4jEnabled()) return [];
  const rows = await runNeo4jQuery<{ d: unknown }>(
    `MATCH (d:ContentDelta) RETURN d ORDER BY d.createdAt ASC`,
  );
  return rows
    .map((r) => safeToGraphDelta(r.d))
    .filter((d): d is GraphDelta => d !== null);
}

