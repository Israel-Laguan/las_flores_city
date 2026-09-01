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
  // M50: NL-reference resolution result for each reference found in `fields`.
  // Carried on the delta for review surfacing; ignored by the materialize path.
  // `z.lazy` defers evaluation so the schema can be declared later in this file.
  _resolution: z.array(z.lazy(() => ResolutionBlockSchema)).optional(),
}).superRefine((delta, ctx) => {
  // `nodeId` is a UUID or a stable lowercase slug. A slug is the stable identity
  // of a new ADD entity, or of a same-plan MODIFY/DELETE that remakes that
  // plan-local entity (keyed `nodeType:slug:planId`). A plain canonical
  // MODIFY/DELETE uses the base `:Content` node's UUID keyed against the canonical
  // node — a slug can never match the canonical (UUID-keyed) node, so a
  // canonical MODIFY must use a UUID or applyDelta will refuse it as a missing
  // base.
  const uuid = UUID_REGEX.test(delta.nodeId);
  const slug = /^[a-z0-9_]+$/.test(delta.nodeId);
  if (!uuid && !slug) {
    ctx.addIssue({
      code: 'custom',
      path: ['nodeId'],
      message: 'nodeId must be a UUID or a lowercase slug (a-z0-9_)',
    });
  }
  // A MODIFY/DELETE `nodeId` must reference a valid base. That base may be the
  // canonical `:Content` node's UUID OR a same-plan `:ContentDelta` (a lowercase
  // slug) when the delta remakes an entity authored in this plan — both are
  // accepted here, and applyDelta/partitionDeltas confirm at write time that the
  // referenced base (canonical or plan-local) actually exists before MERGEing.
});

export type GraphDelta = z.infer<typeof GraphDeltaSchema>;

// ---------------------------------------------------------------------------
// M50 — Entity resolution + consistency metadata
//
// `GraphDelta._resolution` carries the NL-reference → canonical-entity resolution
// result for each natural-language reference found in a delta's fields. The
// materialize path ignores it; admin review + the intake probe surface it so an
// ambiguous/unresolved reference is confirmed or corrected before approval.
//
// `ContentPlan._consistency` (defined in story-builder.ts, re-using the schemas
// below) carries the PlanConsistencyChecker report attached at approve time.
// ---------------------------------------------------------------------------

/** Outcome of resolving one natural-language reference against the graph. */
export const ResolutionStatusSchema = z.enum(['resolved', 'ambiguous', 'unresolved']);
export type ResolutionStatus = z.infer<typeof ResolutionStatusSchema>;

/** A single ranked candidate for a reference, with a confidence score. */
export const ResolutionCandidateSchema = z.object({
  nodeType: GraphNodeTypeSchema,
  nodeId: z.string(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
});
export type ResolutionCandidate = z.infer<typeof ResolutionCandidateSchema>;

/** The resolution result for one reference found in a delta. */
export const ResolutionBlockSchema = z.object({
  raw: z.string(), // the user's raw wording, e.g. "Industrail Zone"
  status: ResolutionStatusSchema,
  field: z.string().optional(), // which delta field carried the reference
  targetNodeType: GraphNodeTypeSchema.optional(), // the node type the ref resolves against
  candidates: z.array(ResolutionCandidateSchema).default([]),
  // A short, human-actionable next step authored by the LLM (or a templated
  // fallback) telling the reviewer how to confirm/amend this reference. Advisory
  // only — the materialize path ignores it, exactly like the rest of this block.
  suggestion: z.string().optional(),
});
export type ResolutionBlock = z.infer<typeof ResolutionBlockSchema>;

// ---------------------------------------------------------------------------
// Fail-open intake diagnostics
//
// Intake is lenient by contract: an ambiguous or unresolvable reference must
// never abort a plan. Where the pipeline previously threw (a MODIFY/DELETE
// delta whose base `:Content` node is missing, a delta edge with a dangling
// endpoint, or a MODIFY whose canonical on-disk slug cannot be resolved), it
// now DROPS the offending delta/edge from the write set and records an
// `IntakeDiagnostic` instead. The plan still persists — "full of notes" — and a
// human confirms or amends each note afterwards via `plan:amend`.
//
// Structural failures that are unsafe to wave through (an injection-unsafe
// relationship type, or a genuine infra error like Neo4j being unreachable)
// still throw. Only the ambiguity class fails open.
// ---------------------------------------------------------------------------

/** Why a delta or edge was dropped from the intake write set. */
export const IntakeDiagnosticKindSchema = z.enum([
  // A MODIFY/DELETE delta referenced a base `:Content` node that does not exist.
  'missing_base_node',
  // The base node exists only as critique evidence, never as canon.
  'evidence_only_node',
  // A delta edge's source `:ContentDelta` was not written (its delta was dropped).
  'dangling_edge_source',
  // A delta edge's target is neither a canonical `:Content` nor a same-plan delta.
  'dangling_edge_target',
  // A MODIFY delta's canonical on-disk slug could not be resolved, so synthesis
  // cannot target its existing file safely.
  'unresolvable_canonical_slug',
]);
export type IntakeDiagnosticKind = z.infer<typeof IntakeDiagnosticKindSchema>;

/**
 * One dropped delta/edge, shaped to sit alongside `ResolutionBlock` so both can
 * be surfaced through the same "notes" channel.
 *
 * For a dropped delta, `field` is the delta's own field (or absent) and `raw` is
 * the offending reference. For a dropped edge, `field` is `'links'` and `raw` is
 * `"TYPE source -> target"` — mirroring how `PlanConsistencyChecker`'s
 * `orphan_relationship` finding already reports relationship-level problems.
 */
export const IntakeDiagnosticSchema = z.object({
  nodeType: GraphNodeTypeSchema,
  nodeId: z.string().min(1),
  field: z.string().optional(),
  raw: z.string(),
  kind: IntakeDiagnosticKindSchema,
  status: ResolutionStatusSchema,
  candidates: z.array(ResolutionCandidateSchema).default([]),
  suggestion: z.string().optional(),
  reason: z.string(),
});
export type IntakeDiagnostic = z.infer<typeof IntakeDiagnosticSchema>;

// ---------------------------------------------------------------------------
// Intake note (cross-package contract)
//
// The advisory note surfaced for every reference the intake pipeline could not
// confidently resolve — whether that is an ambiguous natural-language reference
// (`ResolutionBlock`) or a dropped delta/edge (`IntakeDiagnostic`). It is exported
// from `shared` (not just `GraphIntakeService`) so M51's HTTP route and M52's
// admin UI — which live in different packages — have a single typed contract for
// `content_plans` intake notes instead of a structural `any`.
// ---------------------------------------------------------------------------
export const IntakeNoteSchema = z.object({
  nodeType: z.string(),
  nodeId: z.string(),
  field: z.string().optional(),
  status: ResolutionStatusSchema,
  raw: z.string(),
  /** Present for a dropped delta/edge; absent for an unresolved NL reference. */
  kind: z.string().optional(),
  reason: z.string(),
  suggestion: z.string().optional(),
  candidates: z.array(ResolutionCandidateSchema).default([]),
  /** Durable handle for `plan:amend --annotation <id>:"<comment>"`; absent only
   * if persisting the annotation degraded (the note is still reported). */
  annotationId: z.string().optional(),
});
export type IntakeNote = z.infer<typeof IntakeNoteSchema>;

/** Severity of a consistency finding. Lenient by design — never blocks approval. */
export const ConsistencySeveritySchema = z.enum(['warning']);
export type ConsistencySeverity = z.infer<typeof ConsistencySeveritySchema>;

/** One semantic conflict surfaced by PlanConsistencyChecker (non-blocking). */
export const ConsistencyFindingSchema = z.object({
  code: z.string().min(1),
  severity: ConsistencySeveritySchema.default('warning'),
  message: z.string().min(1),
  nodeType: GraphNodeTypeSchema.optional(),
  nodeId: z.string().optional(),
  field: z.string().optional(),
  detail: z.record(z.string(), z.any()).optional(),
});
export type ConsistencyFinding = z.infer<typeof ConsistencyFindingSchema>;

/** The plan-level consistency report attached at approve time. */
export const ConsistencyReportSchema = z.object({
  checkedAt: z.string(),
  hasConflicts: z.boolean(),
  findings: z.array(ConsistencyFindingSchema).default([]),
});
export type ConsistencyReport = z.infer<typeof ConsistencyReportSchema>;

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
  { type: 'SERVES', sourceNodeType: 'Overlay', targetNodeType: 'Mission', field: 'mission_id', mode: 'set', value: 'nodeId' },
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

/** A merged revision = merged view + the plan's delta edges (resolved). */
export interface GraphMergedRevision extends GraphMergedView {
  deltaEdges: GraphDeltaEdge[];
}

/** Result of an impact-analysis traversal ("what links to X?"). */
export const GraphImpactAnalysisSchema = z.object({
  target: GraphContentNodeSchema.optional(),
  incoming: z.array(GraphEdgeSchema).default([]),
  outgoing: z.array(GraphEdgeSchema).default([]),
  neighbors: z.array(GraphContentNodeSchema).default([]),
});

export type GraphImpactAnalysis = z.infer<typeof GraphImpactAnalysisSchema>;
