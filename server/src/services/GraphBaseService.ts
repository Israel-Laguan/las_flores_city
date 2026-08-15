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

/**
 * Idempotently create the uniqueness constraints backing `MERGE`. Safe to
 * re-run on every seed; no-op when Neo4j is disabled.
 */
export async function ensureGraphConstraints(): Promise<void> {
  if (!isNeo4jEnabled()) return;
  await runNeo4jQuery(CONTENT_NODE_KEY_CYPHER);
  await runNeo4jQuery(CONTENT_DELTA_KEY_CYPHER);
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
  const props: Record<string, unknown> = { ...(canonicalFields ?? {}) };
  if (name !== undefined) props.name = name;
  await runNeo4jQuery(
    `
    MERGE (c:Content { key: $key })
    ON CREATE SET c.nodeType = $nodeType, c.nodeId = $nodeId, c.planId = null, c += $props
    ON MATCH SET c.nodeType = $nodeType, c.nodeId = $nodeId, c += $props
    `,
    { key: contentKey(nodeType, nodeId), nodeType, nodeId, props },
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
