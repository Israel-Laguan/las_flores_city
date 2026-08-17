// ============================================================
// GraphBaseService — idempotent canonical `:Content` graph writer
//
// M27 seeds the authoring canvas with a base graph of `(:Content)` nodes keyed
// on `(nodeType, nodeId)` (plan_id = null). This service is THE writer for that
// canonical base layer and is reused by:
//   - the M27 base seed (`scripts/seed-graph.ts`)
//   - M27-b content writes (canon entities the critique links `-[:FLAGGED_IN]->`)
//   - M28's write/merge path
//
// Idempotency: `MERGE` on a surrogate `key` property backed by a UNIQUE
// constraint. Note: Neo4j Community (neo4j:5-community) does NOT support
// composite NODE KEY constraints (Enterprise-only), so uniqueness of the
// `(nodeType, nodeId)` key is enforced via `key = nodeType + ':' + nodeId`.
// All methods no-op when the NEO4J_ENABLED flag is off.
// ============================================================

import type { GraphEdge } from '@las-flores/shared';
import { isNeo4jEnabled, runNeo4jQuery } from './Neo4jClient.js';

/** A canonical base `:Content` node input (plan_id stays null). */
export interface BaseContentNodeInput {
  nodeType: string; // 'Character' | 'Scene' | 'Dialogue' | 'Mission' | 'Overlay' | 'Location' | 'District'
  nodeId: string; // entity UUID (or district id / location id)
  name?: string;
  canonicalFields?: Record<string, unknown>;
}

/** Composite key for a base `:Content` node (surrogate for (nodeType,nodeId)). */
export function contentKey(nodeType: string, nodeId: string): string {
  return `${nodeType}:${nodeId}`;
}

// Relationship type is interpolated into Cypher (not parameterizable), so only
// allow safe uppercase identifier types. Extend this whitelist with the edge.
const EDGE_TYPE_RE = /^[A-Z][A-Z_0-9]*$/;

const CONTENT_NODE_KEY_CYPHER = `
  CREATE CONSTRAINT content_node_key IF NOT EXISTS
  FOR (c:Content) REQUIRE c.key IS UNIQUE
`;

const CONTENT_DELTA_KEY_CYPHER = `
  CREATE CONSTRAINT content_delta_key IF NOT EXISTS
  FOR (d:ContentDelta) REQUIRE d.key IS UNIQUE
`;

const CONFLICT_KEY_CYPHER = `
  CREATE CONSTRAINT conflict_key IF NOT EXISTS
  FOR (a:Conflict) REQUIRE a.key IS UNIQUE
`;

const Suggestion_KEY_CYPHER = `
  CREATE CONSTRAINT suggestion_key IF NOT EXISTS
  FOR (a:Suggestion) REQUIRE a.key IS UNIQUE
`;

const CACHE_MARKER_KEY_CYPHER = `
  CREATE CONSTRAINT cache_marker_key IF NOT EXISTS
  FOR (m:CacheMarker) REQUIRE m.key IS UNIQUE
`;

/**
 * Idempotently create the uniqueness constraints backing `MERGE`. Safe to
 * re-run on every seed; no-op when Neo4j is disabled.
 */
export async function ensureGraphConstraints(): Promise<void> {
  if (!isNeo4jEnabled()) return;
  await runNeo4jQuery(CONTENT_NODE_KEY_CYPHER);
  await runNeo4jQuery(CONTENT_DELTA_KEY_CYPHER);
  await runNeo4jQuery(CONFLICT_KEY_CYPHER);
  await runNeo4jQuery(Suggestion_KEY_CYPHER);
  await runNeo4jQuery(CACHE_MARKER_KEY_CYPHER);
}

/**
 * Upsert one canonical `:Content` base node, merging on the surrogate `key`
 * (`nodeType:nodeId`). Requires `key`, `nodeType`, `nodeId` on create so the
 * UNIQUE constraint holds. `name` + `canonicalFields` are overwritten on match
 * (base is authoritative). No-op when Neo4j is disabled.
 */
export async function upsertContentNode(input: BaseContentNodeInput): Promise<void> {
  if (!isNeo4jEnabled()) return;
  const { nodeType, nodeId, name, canonicalFields } = input;
  // Strip reserved identity/partition properties so a rogue `canonicalFields`
  // entry can never corrupt the base key or hide the node from canon queries
  // (e.g. planId leaking in would make `MATCH (c:Content) WHERE c.planId IS null`
  // miss it). Identity is derived from `nodeType`/`nodeId` only.
  const reserved = new Set(['key', 'nodeType', 'nodeId', 'planId', 'isEvidence']);
  const safeFields = Object.fromEntries(
    Object.entries(canonicalFields ?? {}).filter(([k]) => !reserved.has(k)),
  );
  // `SET c = $props` replaces the whole property set, so clearing a canonical
  // field in the source removes it from the node (no stale keys survive reseed).
  const props: Record<string, unknown> = {
    ...safeFields,
    ...(name !== undefined ? { name } : {}),
    key: contentKey(nodeType, nodeId),
    nodeType,
    nodeId,
    planId: null,
  };
  await runNeo4jQuery(
    `
    MERGE (c:Content { key: $key })
    SET c = $props
    `,
    { key: props.key, props },
  );
}

/**
 * Upsert a directed relationship between two `:Content` nodes. `edge.type` is
 * the relationship label, whitelisted to a safe `[A-Z_0-9]` identifier before
 * interpolation to prevent Cypher injection. No-op when Neo4j is disabled.
 * Nodes not yet present are ignored (relationship requires both endpoints).
 */
export async function upsertContentRelationship(edge: GraphEdge): Promise<void> {
  if (!isNeo4jEnabled()) return;
  if (!EDGE_TYPE_RE.test(edge.type)) {
    throw new Error(`Unsafe graph relationship type "${edge.type}"`);
  }
  await runNeo4jQuery(
    `
    MATCH (a:Content { nodeType: $st, nodeId: $sn }),
          (b:Content { nodeType: $tt, nodeId: $tn })
    MERGE (a)-[r:${edge.type}]->(b)
    ON CREATE SET r.createdAt = datetime()
    `,
    {
      st: edge.sourceNodeType,
      sn: edge.sourceNodeId,
      tt: edge.targetNodeType,
      tn: edge.targetNodeId,
    },
  );
}

/** Count of canon base `:Content` nodes (verification helper). */
export async function countContentNodes(): Promise<number> {
  if (!isNeo4jEnabled()) return 0;
  const rows = await runNeo4jQuery<{ count: unknown }>(
    `MATCH (c:Content) WHERE c.planId IS null RETURN count(c) AS count`,
  );
  // `count()` returns a neo4j Integer; coerce to a JS number.
  return rows[0]?.count != null ? Number(rows[0].count) : 0;
}

/** True when a base node for `(nodeType, nodeId)` already exists. */
export async function hasContentNode(nodeType: string, nodeId: string): Promise<boolean> {
  if (!isNeo4jEnabled()) return false;
  const rows = await runNeo4jQuery<{ count: unknown }>(
    `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId })
     WHERE c.planId IS null
     RETURN count(c) AS count`,
    { nodeType, nodeId },
  );
  return rows[0]?.count != null ? Number(rows[0].count) > 0 : false;
}

const EDGE_KEY_RE = /^[A-Z][A-Z_0-9]*$/;

/**
 * Delete canonical `:Content` nodes (planId IS null) whose `(nodeType:nodeId)`
 * key is NOT in `keepKeys`. Used by the resync path to repair orphan drift
 * (graph nodes no longer backed by the content store). DETACH DELETE also
 * removes their relationships. Returns the number of nodes removed.
 */
export async function pruneOrphanContentNodes(keepKeys: Set<string>): Promise<number> {
  if (!isNeo4jEnabled()) return 0;
  // Evidence nodes (isEvidence=true) are persisted critique excerpts, not part of
  // the canonical base graph, so they must survive an orphan prune even though
  // they match the `planId IS null` predicate.
  const baseWhere = `c.planId IS null AND (c.isEvidence IS NULL OR c.isEvidence = false)`;
  if (keepKeys.size === 0) {
    const countRows = await runNeo4jQuery<{ count: unknown }>(
      `MATCH (c:Content) WHERE ${baseWhere} RETURN count(c) AS count`,
    );
    const count = countRows[0]?.count != null ? Number(countRows[0].count) : 0;
    if (count > 0) {
      await runNeo4jQuery(`MATCH (c:Content) WHERE ${baseWhere} DETACH DELETE c`);
    }
    return count;
  }
  const keys = [...keepKeys];
  const countRows = await runNeo4jQuery<{ count: unknown }>(
    `MATCH (c:Content) WHERE ${baseWhere} AND NOT c.key IN $keys RETURN count(c) AS count`,
    { keys },
  );
  const count = countRows[0]?.count != null ? Number(countRows[0].count) : 0;
  if (count > 0) {
    await runNeo4jQuery(
      `MATCH (c:Content) WHERE ${baseWhere} AND NOT c.key IN $keys DETACH DELETE c`,
      { keys },
    );
  }
  return count;
}

/**
 * Delete canonical relationships (between `planId IS null` nodes) whose edge key
 * is NOT in `keepEdgeKeys`, so a removed FK in the store is reflected in the
 * graph. Returns the number of relationships removed.
 */
export async function pruneOrphanContentEdges(keepEdgeKeys: Set<string>): Promise<number> {
  if (!isNeo4jEnabled()) return 0;
  const rows = await runNeo4jQuery<{ st: string; sn: string; tt: string; tn: string; type: string }>(
    `MATCH (a:Content)-[r]->(b:Content)
     WHERE a.planId IS null AND b.planId IS null
       AND (a.isEvidence IS NULL OR a.isEvidence = false)
       AND (b.isEvidence IS NULL OR b.isEvidence = false)
     RETURN a.nodeType AS st, a.nodeId AS sn, type(r) AS type, b.nodeType AS tt, b.nodeId AS tn`,
  );
  // Group orphan rows by relationship type so each type is removed in a single
  // UNWIND delete, instead of one round trip per orphan edge.
  const orphanByType = new Map<string, Array<{ st: string; sn: string; tt: string; tn: string }>>();
  for (const row of rows) {
    if (!EDGE_KEY_RE.test(row.type)) continue;
    const key = `${row.st}:${row.sn}->${row.tt}:${row.tn}[${row.type}]`;
    if (keepEdgeKeys.has(key)) continue;
    const list = orphanByType.get(row.type) ?? [];
    list.push({ st: row.st, sn: row.sn, tt: row.tt, tn: row.tn });
    orphanByType.set(row.type, list);
  }
  let deleted = 0;
  for (const [type, list] of orphanByType) {
    if (list.length === 0) continue;
    await runNeo4jQuery(
      `UNWIND $rows AS row
       MATCH (a:Content { nodeType: row.st, nodeId: row.sn })-[r:${type}]->(b:Content { nodeType: row.tt, nodeId: row.tn })
       DELETE r`,
      { rows: list },
    );
    deleted += list.length;
  }
  return deleted;
}
