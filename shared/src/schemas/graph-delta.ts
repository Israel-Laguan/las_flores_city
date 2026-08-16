import { z } from 'zod';
import { zodUuid, UUID_REGEX } from './uuid.js';

// ---------------------------------------------------------------------------
// M27 — Graph Authoring Substrate: delta + node/edge contract
//
// Neo4j is the authoring IR (decision locked in M19). The base graph is seeded
// as `(:Content)` nodes keyed on `(nodeType, nodeId)` with `plan_id = null`.
// Plans (this milestone: READ path only; write/merge is M28) are expressed as
// deltas tagged with `plan_id` referencing `content_plans.id`.
//
// Uniqueness of the `(nodeType, nodeId)` key is enforced with a surrogate
// `key = nodeType + ':' + nodeId` property under a single-property UNIQUE
// constraint — Neo4j Community (neo4j:5-community) does not support composite
// NODE KEY constraints (Enterprise-only).
//
// Delta ops:
//   - ADD     — a brand-new `:ContentDelta` node (no base `:Content` yet)
//   - MODIFY  — a shadow `:ContentDelta` node (same `(nodeType, nodeId)` as a
//               base node) carrying the proposed changed fields
//   - DELETE  — a tombstone `:ContentDelta` node marking the base node for
//               removal once approved
//
// Merged view (preview of "lore if approved") = canon `:Content` nodes not
// shadowed by a plan's deltas ∪ that plan's ADD/MODIFY deltas; DELETE deltas
// omit their base node.
//
// M27-b reads these seams: `(:Content)` base nodes keyed `(nodeType, nodeId)`
// are what `(:Conflict)-[:FLAGGED_IN]->(:Content)` links to, and
// `Neo4jNeighborhoodProvider` traverses them to reproduce the exact
// `ExistingContentContext` shape — this schema is the portable contract.
// ---------------------------------------------------------------------------

/** The supported canon entity node types (M27-b links these from annotations). */
export const GraphNodeTypeSchema = z.enum([
  'Character',
  'Scene',
  'Dialogue',
  'Mission',
  'Overlay',
  'Location',
  'District',
]);
export type GraphNodeType = z.infer<typeof GraphNodeTypeSchema>;

/** A delta's effect on the target contents once approved. */
export const GraphDeltaOpSchema = z.enum(['ADD', 'MODIFY', 'DELETE']);
export type GraphDeltaOp = z.infer<typeof GraphDeltaOpSchema>;

/**
 * A single plan delta — an ADD/MODIFY(shadow)/DELETE(tombstone) tagged with the
 * `content_plans.id` it belongs to. `nodeId` is the UUID of a base entity, or
 * for a new ADD entity a stable candidate id (UUID or lowercase slug) the plan
 * item resolves to; the same `(nodeType, nodeId, planId)` key must be unique.
 */
export const GraphDeltaSchema = z.object({
  id: zodUuid(),
  planId: zodUuid(), // references content_plans(id)
  nodeType: GraphNodeTypeSchema,
  nodeId: z.string().min(1),
  op: GraphDeltaOpSchema,
  // The post-approve field set for the target node. ADD = the new node's initial
  // fields; MODIFY = the FULL proposed post-approve field set (a shadow copy of
  // the canon node, so the M27 merged-view is self-contained — exact field-level
  // diffing is M28's apply-delta); DELETE may carry none.
  fields: z.record(z.string(), z.any()).default({}),
  createdAt: z.iso.datetime(), // ISO timestamp
}).superRefine((delta, ctx) => {
  // `nodeId` is a UUID for any op, or a stable lowercase slug ONLY for a new
  // ADD entity. A MODIFY/DELETE `nodeId` must be the base `:Content` node's
  // UUID — a slug could never match the canonical (UUID-keyed) node, so the
  // shadow would silently fail to shadow (accepted schema, invisible breakage).
  const uuid = UUID_REGEX.test(delta.nodeId);
  const slug = /^[a-z0-9_]+$/.test(delta.nodeId);
  if (!uuid && !slug) {
    ctx.addIssue({
      code: 'custom',
      path: ['nodeId'],
      message: 'nodeId must be a UUID or a lowercase slug (a-z0-9_)',
    });
  }
  if (delta.op !== 'ADD' && !uuid) {
    ctx.addIssue({
      code: 'custom',
      path: ['nodeId'],
      message: `${delta.op} nodeId must be a UUID that references a base :Content node`,
    });
  }
});

export type GraphDelta = z.infer<typeof GraphDeltaSchema>;

/** A plan delta edge — a relationship authored as part of a plan. */
export const GraphDeltaEdgeSchema = z.object({
  planId: zodUuid(),
  // Source is always a plan delta node (ADD/MODIFY/DELETE shadow). The source
  // (nodeType, nodeId) MUST exist as a `:ContentDelta` of the same plan.
  sourceNodeType: GraphNodeTypeSchema,
  sourceNodeId: z.string().min(1),
  // Target may be a canonical `:Content` node or another `:ContentDelta` of the
  // same plan (e.g. linking two brand-new ADD entities within one plan).
  targetNodeType: GraphNodeTypeSchema,
  targetNodeId: z.string().min(1),
  type: z.string(), // whitelisted relationship type, e.g. 'OWNED_BY' | 'SET_IN'
  // The resolved relationship type once committed to the canonical graph.
  resolvedType: z.string().optional(),
});

export type GraphDeltaEdge = z.infer<typeof GraphDeltaEdgeSchema>;

/** Graph nodeType ↔ ContentPlan `contentType` mapping (lossless covered set). */
export const NODE_TYPE_TO_CONTENT_TYPE: Record<string, string> = {
  Character: 'character',
  Scene: 'scene',
  Dialogue: 'dialogue',
  Mission: 'mission',
  Overlay: 'overlay',
  Location: 'location',
  District: 'district',
};

export const CONTENT_TYPE_TO_NODE_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(NODE_TYPE_TO_CONTENT_TYPE).map(([k, v]) => [v, k]),
);

/**
 * Edge-type → field mapping table (M28 write path).
 *
 * The lossless covered set derived from the seed's FK vocabulary and the actual
 * YAML field names. `set` writes the target value directly into the source
 * item's `fields`; `value` is either the target `nodeId` (UUID/stable id) or the
 * target's resolved `name` (for the scene→district string field).
 *
 * Unsupported edges (Scene>Character:HAS_CHARACTER, Character>Scene:APPEARS_IN)
 * are stored in a join table (`scene_characters`) with no YAML field, so the
 * exporter rejects them with a typed error rather than silently dropping them.
 */
export interface EdgeFieldMapping {
  type: string;
  sourceNodeType: string;
  targetNodeType: string;
  /** YAML/DB field on the source entity that the relationship materializes. */
  field: string;
  /** How the value is derived for the source `fields` entry. */
  mode: 'set';
  /** 'nodeId' writes the target nodeId; 'name' resolves target's District name. */
  value: 'nodeId' | 'name';
}

export const EDGE_FIELD_MAPPINGS: EdgeFieldMapping[] = [
  { type: 'OWNED_BY', sourceNodeType: 'Dialogue', targetNodeType: 'Character', field: 'character_id', mode: 'set', value: 'nodeId' },
  { type: 'SET_IN', sourceNodeType: 'Dialogue', targetNodeType: 'Scene', field: 'scene_id', mode: 'set', value: 'nodeId' },
  { type: 'SERVES', sourceNodeType: 'Dialogue', targetNodeType: 'Mission', field: 'mission_id', mode: 'set', value: 'nodeId' },
  { type: 'OVERLAYS', sourceNodeType: 'Overlay', targetNodeType: 'Dialogue', field: 'target_tree_id', mode: 'set', value: 'nodeId' },
  { type: 'SERVES', sourceNodeType: 'Overlay', targetNodeType: 'Mission', field: 'mystery_id', mode: 'set', value: 'nodeId' },
  { type: 'IN_DISTRICT', sourceNodeType: 'Scene', targetNodeType: 'District', field: 'district', mode: 'set', value: 'name' },
];

/** Edge types explicitly unsupported for materialization (join table only). */
export const UNSUPPORTED_EDGE_TYPES = new Set(['HAS_CHARACTER', 'APPEARS_IN']);

/** Look up a covered edge mapping by (type, sourceNodeType, targetNodeType). */
export function findEdgeMapping(
  type: string,
  sourceNodeType: string,
  targetNodeType: string,
): EdgeFieldMapping | undefined {
  return EDGE_FIELD_MAPPINGS.find(
    (m) => m.type === type && m.sourceNodeType === sourceNodeType && m.targetNodeType === targetNodeType,
  );
}

/** A `:Content`-shaped node in base or merged form. */
export const GraphContentNodeSchema = z.object({
  nodeType: GraphNodeTypeSchema,
  nodeId: z.string(),
  name: z.string().max(255).optional(),
  // null = canon base graph; a UUID = a plan delta (shadow/tombstone).
  planId: z.string().nullable().default(null),
  fields: z.record(z.string(), z.any()).default({}),
});

export type GraphContentNode = z.infer<typeof GraphContentNodeSchema>;

/** A directed relationship between two `:Content` nodes. */
export const GraphEdgeSchema = z.object({
  sourceNodeType: GraphNodeTypeSchema,
  sourceNodeId: z.string(),
  targetNodeType: GraphNodeTypeSchema,
  targetNodeId: z.string(),
  type: z.string(), // e.g. 'OWNED_BY' | 'SET_IN' | 'SERVES' | 'IN_DISTRICT' | ...
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/** Result of a merged-view query for one plan. */
export const GraphMergedViewSchema = z.object({
  planId: z.string().nullable().default(null),
  nodes: z.array(GraphContentNodeSchema).default([]),
  edges: z.array(GraphEdgeSchema).default([]),
});

export type GraphMergedView = z.infer<typeof GraphMergedViewSchema>;

/** Result of an impact-analysis traversal ("what links to X?"). */
export const GraphImpactAnalysisSchema = z.object({
  target: GraphContentNodeSchema.optional(),
  incoming: z.array(GraphEdgeSchema).default([]),
  outgoing: z.array(GraphEdgeSchema).default([]),
  neighbors: z.array(GraphContentNodeSchema).default([]),
});

export type GraphImpactAnalysis = z.infer<typeof GraphImpactAnalysisSchema>;
