/* eslint-disable max-lines */
// ============================================================
// GraphIntakeService — M32 graph-based authoring intake
//
// Creates content_plans and writes their proposed changes as GraphDelta
// nodes/edges in Neo4j (the authoring canvas). This is the replacement
// for the legacy ContentPlanService.parseDescription → plan_json path.
//
// Flow:
//   1. createPlanFromDescription(description) → calls chatPropose
//   2. chatPropose returns GraphDelta[] + GraphDeltaEdge[]
//   3. Persist plan row to OLTP (content_plans) with status='proposed'
//   4. Write all deltas/edges to Neo4j via GraphDeltaService
//   5. Return the planId + delta/edge counts
//
// The returned ContentPlan is synthesized from the deltas so the
// legacy materialize pipeline (stagePlan → migrateContent → verifyPlan)
// can still consume it via the exporter (GraphExporter).
// ============================================================

import {
  ContentPlanSchema,
  type ContentPlan,
  type ContentPlanItem,
  type ContentLink,
  type ChatMessage,
  GraphDeltaSchema,
  GraphDeltaEdgeSchema,
  type GraphDelta,
  type GraphDeltaEdge,
  type GraphDeltaOp,
  type IntakeDiagnostic,
  type IntakeNote,
  type ResolutionBlock,
  type CritiqueAnnotationDraft,
  findEdgeMapping,
} from '@las-flores/shared';
import { queryOLTP, queryContent, withOLTPTransaction } from '@las-flores/infra';
import { uuidv4 } from '@las-flores/shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import { chatService } from './ChatService.js';
import { emitAdminEvent } from './AdminEventEmitter.js';
import { contentPlanService } from './ContentPlanService.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { applyDelta, applyDeltaEdge, getDeltasForPlan, getDeltaEdgesForPlan, clearDeltasForPlan, countDeltasForPlan, partitionDeltas, partitionDeltaEdges, deltaKey, normalizeKeyComponent, resolveEdgeTargetNameValue } from './GraphDeltaService.js';
import { isNeo4jEnabled, runNeo4jTransaction, runNeo4jQuery } from './Neo4jClient.js';
import { reviewUrl } from '../planIntakeCore.js';
import { EntityResolutionService } from './EntityResolutionService.js';
import { Neo4jCandidateSource } from './Neo4jCandidateSource.js';
import { PlanAwareCandidateSource } from './PlanAwareCandidateSource.js';
import { aiCritiqueService } from './AICritiqueService.js';
import { createLLMProvider } from './LLMService.js';
import { templatedSuggestion } from './llmPromptsIntakeDiagnostics.js';
import type { ExistingContentContext, LLMUsage, LLMProvider, IntakeDiagnosticItem } from './types/LLMTypes.js';

/** M50: graph-assisted entity resolution for natural-language references in deltas. */
const entityResolutionService = new EntityResolutionService(new Neo4jCandidateSource());

/** GraphIntakeService error when Neo4j is disabled. */
export class GraphIntakeDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphIntakeDisabledError';
  }
}

/** GraphIntakeService error for invalid input. */
export class GraphIntakeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphIntakeValidationError';
  }
}

/**
 * One reviewable "the graph could not confidently resolve this" note.
 *
 * The unified surface a CLI/UI renders, whether the underlying signal was an
 * ambiguous natural-language reference (`ResolutionBlock`) or a delta/edge dropped
 * from the write set (`IntakeDiagnostic`). `annotationId` is the durable handle for
 * `plan:amend --annotation <id>:"<comment>"`; it is absent only if persisting the
 * annotation degraded (the note is still reported). The `IntakeNote` contract lives
 * in `@las-flores/shared` so M51's route and M52's admin UI (separate packages)
 * share the same typed shape.
 */

export interface CreatePlanFromDescriptionResult {
  planId: string;
  description: string;
  deltaCount: number;
  edgeCount: number;
  /** Advisory notes for everything the graph could not confidently resolve. */
  notes: IntakeNote[];
  usage: LLMUsage | null;
  timestamp: string;
}

export interface AmendInstructionResult {
  planId: string;
  status: string;
  actor?: { id: string; email: string; role: string };
  instruction: string;
  appliedCount: number;
  droppedCount: number;
  reply: string;
  deltaCount: number;
  edgeCount: number;
  /** Full delta list (fields + prose) for the refreshed plan. */
  deltas: GraphDelta[];
  /** Full edge list for the refreshed plan. */
  edges: GraphDeltaEdge[];
  notes: IntakeNote[];
  reviewUrl?: string;
  next: string;
}

/** One field's canonical-before vs proposed-after comparison within a delta diff. */
export interface PlanFieldDiff {
  field: string;
  before: unknown;
  after: unknown;
  change: 'added' | 'removed' | 'modified' | 'unchanged';
}

/** A single delta rendered as a canonical-before vs proposed-after comparison. */
export interface PlanDeltaDiff {
  nodeType: string;
  nodeId: string;
  op: GraphDeltaOp;
  name: string;
  /** Canonical field set (`null` for ADD deltas / when the graph is unavailable). */
  before: Record<string, unknown> | null;
  /** Proposed field set (`null` for DELETE deltas). */
  after: Record<string, unknown> | null;
  /** Field-by-field comparison, keyed over the union of before/after field names. */
  fields: PlanFieldDiff[];
  /** Resolution blocks carried on the delta (intake ambiguity surfacing). */
  resolution?: ResolutionBlock[];
}

/** Full structured diff for a plan: per-delta before/after + the raw deltas/edges. */
export interface PlanDiffResult {
  planId: string;
  deltas: PlanDeltaDiff[];
  edges: GraphDeltaEdge[];
}

/**
 * Full resumable state of a plan (M50 Part 2 `plan:get`). Read-only: it never
 * mutates the plan or its deltas — it is the "what was I doing?" surface for a
 * plan created in a prior process/terminal.
 */
export interface PlanState {
  planId: string;
  status: string;
  created_by: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  deltaCount: number;
  edgeCount: number;
  deltas: GraphDelta[];
  edges: GraphDeltaEdge[];
  /** Full canonical-before vs proposed-after diff (prose + fields). */
  diff: PlanDeltaDiff[];
  /** Open intake notes + `IntakeDiagnostic` annotations the author can reply to. */
  openAnnotations: OpenAnnotationInfo[];
  reviewUrl: string;
}

/**
 * A critique annotation scoped to intake, surfaced in `plan:get`/`plan:diff`.
 * This is the advisory surface — the approve gate does not block on `open` notes
 * (the graph advises), the admin decides.
 */
export interface OpenAnnotationInfo {
  id: string;
  type: string;
  relatedField?: string;
  relatedNodeId?: string;
  status: 'open' | 'addressed' | 'dismissed';
  suggestion?: string | null;
  createdAt: string;
}

/** Lightweight listing entry for `plan:list`. */
export interface PlanListing {
  id: string;
  status: string;
  created_by: string | null;
  creatorEmail?: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  deltaCount: number;
}

/** Result of a plan lifecycle op (reject/delete) for CLI rendering. */
export interface PlanLifecycleResult {
  planId: string;
  status: string;
  deltaPruned: boolean;
  annotationCount: number;
}

/** Reject DELETE deltas before synthesis — the legacy ContentPlanItem contract
 * has no tombstone representation. Callers must surface DELETEs as an error
 * rather than silently dropping them so references cannot be bypassed. */
function deltaToPlanItem(
  delta: GraphDelta,
  baseContext: ExistingContentContext,
  canonicalSlugByKey?: Map<string, string>,
): ContentPlanItem {
  const { nodeType, nodeId, op, fields } = delta;

  if (op === 'DELETE') {
    throw new GraphIntakeValidationError(
      `Cannot synthesize a plan item from a DELETE delta for [${nodeType}:${nodeId}] — ` +
      `delete materialization is not supported by the legacy plan contract. Remove the tombstone before approving.`,
    );
  }

  // Map graph nodeType to ContentPlan item type
  const contentTypeMap: Record<string, string> = {
    Character: 'character',
    Scene: 'scene',
    Dialogue: 'dialogue',
    Mission: 'mission',
    Overlay: 'overlay',
    Location: 'location',
    District: 'district',
  };
  const type = (contentTypeMap[nodeType] ?? nodeType.toLowerCase()) as ContentPlanItem['type'];

  // For MODIFY ops referencing an existing entity, look up its existing fields
  // from the base context to preserve unchanged values.
  const baseEntity = op === 'MODIFY' ? findBaseEntity(baseContext, nodeType, nodeId) : null;

  // Merge delta fields onto base entity fields (MODIFY) or use delta fields directly (ADD).
  // Object-valued fields are deep-merged so a partial MODIFY delta (e.g. only
  // metadata.personality) preserves the remaining nested fields of the existing
  // entity. Arrays and scalars always replace the existing value.
  const mergedFields = baseEntity
    ? deepMergeObjects(baseEntity, fields)
    : { ...fields };

  // The slug MUST be schema-compliant (`^[a-z0-9_]+$`). A delta that omits
  // `fields.slug` and whose nodeId is a UUID (hyphens + possible uppercase) is
  // schema-INVALID; falling back to the UUID here would persist a plan_json that
  // fails ContentPlanSchema.parse at preview/stage/approve. Generate a compliant
  // slug from the name when available, otherwise from the nodeId.
  // For MODIFY items the canonical on-disk slug MUST win: a renamed `name` (or a
  // deliberately different `fields.slug`) would otherwise retarget a new file
  // path and orphan the existing file at stage time. The canonical slug is
  // resolved from the content store (synthesizePlanFromDeltas →
  // resolveCanonicalSlugsForDeltas) and keyed by `nodeType:nodeId`.
  const SLUG_RE = /^[a-z0-9_]+$/;
  let slug: string | null = null;
  if (op === 'MODIFY') {
    const canonicalSlug = canonicalSlugByKey?.get(`${nodeType}:${normalizeKeyComponent(nodeId)}`);
    if (typeof canonicalSlug === 'string' && SLUG_RE.test(canonicalSlug)) {
      slug = canonicalSlug;
    }
  }
  if (!slug) {
    slug = typeof mergedFields.slug === 'string' && SLUG_RE.test(mergedFields.slug)
      ? mergedFields.slug
      : null;
  }
  if (!slug) {
    const base = typeof mergedFields.name === 'string' && mergedFields.name.length > 0
      ? mergedFields.name
      : nodeId;
    slug = slugify(base);
  }

  // The plan-item `id` is a transient in-plan handle (used only for edge
  // links); the graph identity is preserved via `nodeId`/`entity_id`, so it
  // must be a valid UUID per ContentPlanItemSchema. Use a fresh UUID rather
  // than the raw delta id (which may be a non-UUID string like `delta-char-1`).
  return {
    id: uuidv4(),
    name: mergedFields.name ?? nodeId,
    type,
    slug,
    action: op === 'ADD' ? 'create' : 'update',
    fields: mergedFields,
    dependsOn: [],
    assetNeeds: [],
    // MODIFY deltas reference an existing canonical entity; record its stable
    // nodeId as entity_id so edge resolution can write the canonical identity
    // (not the transient plan-item id) when this item is a MODIFY edge target.
    ...(op === 'MODIFY' ? { entity_id: nodeId } : {}),
  };
}

/** Slugify following the ContentPlan slug contract (`^[a-z0-9_]+$`). */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Deep-merge object-valued fields; arrays and scalars replace the existing value. */
function deepMergeObjects(
  base: Record<string, any>,
  override: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      existing && typeof existing === 'object' && !Array.isArray(existing)
    ) {
      result[key] = deepMergeObjects(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Find a base entity in the context by nodeType and nodeId. */
function findBaseEntity(context: ExistingContentContext, nodeType: string, nodeId: string): Record<string, any> | null {
  const typeToContextKey: Record<string, string> = {
    Character: 'characters',
    Scene: 'scenes',
    Dialogue: 'dialogues',
    Mission: 'missions',
    Overlay: 'overlays',
    Location: 'locations',
    District: 'districts',
  };
  const contextKey = typeToContextKey[nodeType];
  if (!contextKey) return null;
  
  // Districts are not in the current context, so we can't look them up
  // This is OK - MODIFY deltas for Districts will still work, they just won't
  // merge with base fields from context
  const entities = (context as any)[contextKey] as Array<{ id: string; [key: string]: any }> | undefined;
  if (!entities) return null;
  
  return entities.find(e => e.id === nodeId) ?? null;
}

/** Resolve graph delta edges into the legacy plan shape.
 *
 * Mirrors `GraphExporter.resolveEdgeLinks`: when BOTH endpoints are
 * synthesized plan items, emit a `ContentLink` (resolved on materialize); when
 * the target is a canonical/existing node (no synthesized item ID), write the
 * mapped field directly into the source item's `fields` using the target's
 * stable node ID, so the relationship is preserved rather than lost to a
 * transient synthesized item id.
 *
 * Edges that are unsupported for materialization (e.g. join-table-only types
 * like `APPEARS_IN`) or whose source item is missing are skipped here rather
 * than throwing — the plan_json snapshot stays valid and the authoritative
 * `GraphExporter` still rejects them at materialize time. This keeps plan
 * creation tolerant of edges that only the exporter can fully validate. */
function synthesizeEdges(
  edges: GraphDeltaEdge[],
  items: ContentPlanItem[],
  itemIndex: Map<string, string>,
  nameLookup: Map<string, string>,
): ContentLink[] {
  const links: ContentLink[] = [];
  for (const edge of edges) {
    const { sourceNodeType, sourceNodeId, targetNodeType, targetNodeId, type } = edge;

    const mapping = findEdgeMapping(type, sourceNodeType, targetNodeType);
    if (!mapping) continue;

    const sourceKey = `${sourceNodeType}:${normalizeKeyComponent(sourceNodeId)}`;
    const sourceItemId = itemIndex.get(sourceKey);
    if (!sourceItemId) continue;
    const sourceItem = items.find((i) => i.id === sourceItemId);
    if (!sourceItem) continue;

    const targetKey = `${targetNodeType}:${normalizeKeyComponent(targetNodeId)}`;
    const targetItemId = itemIndex.get(targetKey);
    if (targetItemId) {
      const targetItem = items.find((i) => i.id === targetItemId);
      if (targetItem && targetItem.action === 'update') {
        // MODIFY target is an existing canonical entity (delta→canonical via a
        // synthesized item). Materialize the link as a direct field write using
        // its stable identity (entity_id), NOT the transient delta item id —
        // otherwise the random item id is written as the foreign key and the
        // relationship points at the delta instead of the canonical entity.
        const identity = targetItem.entity_id || edge.targetNodeId;
        sourceItem.fields = {
          ...sourceItem.fields,
          [mapping.field]: identity,
        };
      } else {
        // delta→delta (both newly-authored ADD entities): emit a ContentLink;
        // resolveItem writes the field on materialize.
        links.push({
          fromItem: sourceItemId,
          toItem: targetItemId,
          field: mapping.field,
          action: 'set',
        });
      }
    } else {
      // delta→canonical: write the mapped field directly. For name-valued
      // mappings (e.g. IN_DISTRICT → District) resolve the target's canonical
      // name so scene migration matches the District by name; otherwise write
      // the stable target node ID. ALWAYS resolve the value here — never the
      // transient delta item id.
      const value = mapping.value === 'name'
        ? resolveEdgeTargetNameValue(edge, nameLookup)
        : edge.targetNodeId;
      sourceItem.fields = {
        ...sourceItem.fields,
        [mapping.field]: value,
      };
    }
  }
  return links;
}

/** Resolve canonical on-disk slugs for Location MODIFY deltas from their YAML
 * files on disk. Locations are file-only content with no DB table, so their
 * slug is the location directory name (NOT a slugified name, which would
 * diverge for accented/manually-named locations). Mirrors
 * GraphExporter.resolveLocationSlugs.
 *
 * Fail-open per id: an individual Location MODIFY that cannot be matched to an
 * on-disk YAML is reported in `unresolved` (the caller turns it into an
 * `unresolvable_canonical_slug` note and drops just that delta) instead of
 * aborting the whole plan. A genuine glob/infra ERROR still throws, because then
 * NO id can be trusted and silently dropping every Location would be worse than
 * surfacing the failure. */
async function resolveLocationSlugsForDeltas(
  locationIds: string[],
): Promise<{ slugByKey: Map<string, string>; unresolved: Set<string> }> {
  const slugByKey = new Map<string, string>();
  const unresolved = new Set<string>();
  if (locationIds.length === 0) return { slugByKey, unresolved };

  const contentDir = resolveContentDir();
  let files: string[];
  try {
    files = await glob(`${contentDir}/districts/*/locations/*/*.yaml`, { absolute: true });
  } catch (err) {
    // Infra failure — not an ambiguity. Surface it rather than reporting every
    // Location as individually unresolvable.
    throw new GraphIntakeValidationError(
      `Canonical location slug lookup failed during plan synthesis: ${(err as Error)?.message}`,
    );
  }

  const idSet = new Set(locationIds.map((id) => id.toLowerCase()));
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const data: any = yaml.load(raw);
      if (!data || typeof data !== 'object' || !data.id || !data.name) continue;
      if (!idSet.has(String(data.id).toLowerCase())) continue;
      const slug = path.basename(path.dirname(file));
      if (slug.length > 0) {
        slugByKey.set(`Location:${normalizeKeyComponent(String(data.id))}`, slug);
      }
    } catch (err) {
      console.warn(`[graph-intake] failed to read location YAML ${file}:`, (err as Error)?.message);
    }
  }

  // Report — never guess. A name-derived slug would target the wrong path for an
  // accented/manually-named location, so an unmatched id is flagged instead.
  for (const id of locationIds) {
    const key = `Location:${normalizeKeyComponent(id)}`;
    if (!slugByKey.has(key)) unresolved.add(key);
  }
  return { slugByKey, unresolved };
}

/** Resolve canonical on-disk slugs for MODIFY deltas, keyed `nodeType:nodeId`.
 *
 * A UUID-backed MODIFY references an existing canonical entity whose on-disk
 * slug (file directory) is derived from its canonical `name`/`title` (or the
 * `slug` column for Districts, or the directory name for Locations) — NOT from
 * the possibly-renamed delta `name`. Querying the content store in bulk (one
 * `WHERE id IN (...)` per table) keeps this cheap and mirrors
 * GraphExporter.resolveCanonicalSlugsBulk. Locations have no DB table, so their
 * slugs are resolved separately from YAML.
 *
 * Fail-open per id, fail-closed per failure: `unresolved` reports the MODIFY ids
 * whose on-disk path could not be trusted, so the caller drops just those deltas
 * and attaches a note (the lenient-intake contract). Today that is Locations only —
 * their slug is a directory name that can legitimately diverge from the entity
 * name, so deriving one would target the wrong file. DB-backed types keep their
 * pre-existing name-derived fallback and are never flagged. A content-store ERROR
 * for a whole type still throws — that is infra, not ambiguity. */
async function resolveCanonicalSlugsForDeltas(
  deltas: GraphDelta[],
): Promise<{ slugByKey: Map<string, string>; unresolved: Set<string> }> {
  const CANONICAL_SLUG_QUERY: Partial<Record<string, { table: string; column: string }>> = {
    Character: { table: 'characters', column: 'name' },
    Scene: { table: 'scenes', column: 'name' },
    Dialogue: { table: 'dialogue_trees', column: 'name' },
    Overlay: { table: 'dialogue_overlays', column: 'name' },
    Mission: { table: 'mysteries', column: 'title' },
    District: { table: 'districts', column: 'slug' },
  };

  const byType = new Map<string, string[]>();
  for (const d of deltas) {
    if (d.op !== 'MODIFY') continue;
    const list = byType.get(d.nodeType) ?? [];
    list.push(d.nodeId);
    byType.set(d.nodeType, list);
  }

  const slugByKey = new Map<string, string>();
  const unresolved = new Set<string>();
  for (const [nodeType, ids] of byType) {
    if (nodeType === 'Location' || ids.length === 0) continue;
    const meta = CANONICAL_SLUG_QUERY[nodeType];
    // A type with no slug query (and no Location handling) cannot be resolved or
    // meaningfully flagged here; deltaToPlanItem falls back to a name-derived slug.
    if (!meta) continue;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    try {
      const rows = await queryContent<{ id: string; name: string }>(
        `SELECT id, ${meta.column} AS name FROM ${meta.table} WHERE id IN (${placeholders})`,
        ids,
      );
      for (const row of rows.rows) {
        const slug = slugify(row.name);
        if (slug.length > 0) {
          slugByKey.set(`${nodeType}:${normalizeKeyComponent(row.id)}`, slug);
        }
      }
    } catch (err) {
      // Infra failure for the whole type — surface it rather than reporting every
      // id of this type as individually unresolvable.
      throw new GraphIntakeValidationError(
        `Canonical slug lookup failed for ${nodeType} during plan synthesis: ${(err as Error)?.message}`,
      );
    }
    // NOT flagged as unresolvable. For these DB-backed types `deltaToPlanItem`
    // legitimately derives the slug from `fields.slug` / `fields.name` / the nodeId,
    // which is the pre-existing behaviour for a non-renamed MODIFY and is correct
    // whenever the entity's on-disk directory follows its name. A missing row only
    // means "the canonical slug could not be confirmed", not "the path is wrong".
    // (Locations are different — see resolveLocationSlugsForDeltas — because their
    // slug is a directory name that can legitimately diverge from the entity name.)
  }

  // Locations: resolve from YAML (no DB table).
  const locationIds = byType.get('Location') ?? [];
  if (locationIds.length > 0) {
    const locations = await resolveLocationSlugsForDeltas(locationIds);
    for (const [key, slug] of locations.slugByKey) {
      slugByKey.set(key, slug);
    }
    for (const key of locations.unresolved) unresolved.add(key);
  }

  return { slugByKey, unresolved };
}

/** Synthesize a ContentPlan from deltas+edges for compatibility with the legacy pipeline. */
async function synthesizePlanFromDeltas(
  planId: string,
  description: string,
  deltas: GraphDelta[],
  edges: GraphDeltaEdge[],
  context: ExistingContentContext,
): Promise<{ plan: ContentPlan; diagnostics: IntakeDiagnostic[] }> {
  // Resolve canonical on-disk slugs for MODIFY deltas so a renamed entity keeps
  // its existing file path (see deltaToPlanItem). An individual MODIFY whose
  // canonical slug cannot be resolved is EXCLUDED from `items` and reported as a
  // note — guessing a name-derived slug would retarget a different file and orphan
  // the real one. Aborting the whole plan over one such id is exactly the
  // hard-stop this fail-open path exists to remove.
  const { slugByKey: canonicalSlugByKey, unresolved } = await resolveCanonicalSlugsForDeltas(deltas);

  const diagnostics: IntakeDiagnostic[] = [];
  const includedDeltas: GraphDelta[] = [];
  for (const d of deltas) {
    const key = `${d.nodeType}:${normalizeKeyComponent(d.nodeId)}`;
    if (d.op === 'MODIFY' && unresolved.has(key)) {
      const name = typeof d.fields?.name === 'string' ? d.fields.name : '';
      diagnostics.push({
        nodeType: d.nodeType,
        nodeId: d.nodeId,
        raw: name.length > 0 ? name : d.nodeId,
        kind: 'unresolvable_canonical_slug',
        status: 'unresolved',
        candidates: [],
        reason: `Could not locate the existing content file for [${d.nodeType}:${d.nodeId}], so this change was left out of the plan snapshot to avoid writing to the wrong file.`,
      });
      continue;
    }
    includedDeltas.push(d);
  }

  const items = includedDeltas.map(d => deltaToPlanItem(d, context, canonicalSlugByKey));

  // Build an index mapping (nodeType:graphNodeId) → plan-item id so edge links
  // resolve to generated item IDs, not raw graph node IDs. Edges reference the
  // delta's `nodeId` (the graph identity), so we key on that — NOT the
  // transient plan-item id.
  const itemIndex = new Map<string, string>();
  for (let i = 0; i < includedDeltas.length; i++) {
    const delta = includedDeltas[i];
    const item = items[i];
    itemIndex.set(
      `${delta.nodeType}:${normalizeKeyComponent(delta.nodeId)}`,
      item.id,
    );
  }

  // Name lookup for name-valued edges (today only IN_DISTRICT → District).
  // Mirrors GraphExporter: resolve the canonical name a name-valued edge writes
  // into the source item's fields. Seed it from the deltas themselves (a
  // District ADD/MODIFY delta carries its own name in fields.name, exactly as
  // the merged revision the exporter reads would), so a newly-authored District
  // resolves to its name. Then seed canonical District names from the content
  // store so an IN_DISTRICT edge to an EXISTING District (absent from this
  // plan's deltas) resolves to the District NAME, not its UUID — otherwise
  // materialization could not match the District by name. Delta names win over
  // canonical names (a District MODIFY in this plan keeps its new name).
  const nameLookup = new Map<string, string>();
  for (const delta of includedDeltas) {
    const name = (delta.fields as Record<string, any> | undefined)?.name;
    if (typeof name === 'string' && name.length > 0) {
      nameLookup.set(`${delta.nodeType}:${normalizeKeyComponent(delta.nodeId)}`, name);
    }
  }
  try {
    const districtRows = await queryContent<{ id: string; name: string }>(
      `SELECT id, name FROM districts`,
    );
    for (const row of districtRows.rows) {
      const key = `District:${normalizeKeyComponent(row.id)}`;
      if (!nameLookup.has(key)) nameLookup.set(key, row.name);
    }
  } catch (err) {
    console.warn('[graph-intake] District name lookup failed; IN_DISTRICT edges may resolve to a UUID:', (err as Error)?.message);
  }

  const links = synthesizeEdges(edges, items, itemIndex, nameLookup);

  return {
    plan: {
      id: planId,
      description,
      status: 'proposed',
      items,
      links,
      _meta: {
        scaffolded_at: new Date().toISOString(),
      },
    },
    diagnostics,
  };
}

export class GraphIntakeService {
  /** LLM provider for diagnostic suggestions, created lazily so importing this
   *  module never constructs an LLM client (and tests can run without one). */
  private providerInstance?: LLMProvider;

  private get provider(): LLMProvider {
    this.providerInstance ??= createLLMProvider();
    return this.providerInstance;
  }

  /**
   * Create a new content plan from a natural language description using the
   * graph-based authoring path. This:
   *   1. Calls chatPropose to generate structured GraphDelta[] + GraphDeltaEdge[]
   *   2. Creates a content_plans row with status='proposed' and optional actor attribution
   *   3. Writes all deltas and edges to Neo4j (the authoring canvas)
   *   4. Returns the planId + counts
   *
   * This is the M32 replacement for ContentPlanService.parseDescription → plan_json.
   * A synthesized plan_json review snapshot is stored alongside the authoritative
   * Neo4j deltas so existing review consumers can read the proposed plan.
   */
  async createPlanFromDescription(
    description: string,
    initialMessages: ChatMessage[] = [],
    createdBy?: string,
  ): Promise<CreatePlanFromDescriptionResult> {
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new GraphIntakeValidationError('Description is required and must be a non-empty string');
    }

    if (!isNeo4jEnabled()) {
      throw new GraphIntakeDisabledError('Neo4j authoring graph is disabled — cannot create graph-based plan. Enable NEO4J_ENABLED first.');
    }

    // Step 1: Generate planId FIRST so it can be passed to chatPropose.
    // The provider requires a valid UUID planId to associate deltas; passing ''
    // causes every delta to be silently discarded.
    const planId = uuidv4();
    // Step 2: Gather existing content context
    const context = await this.gatherContext();

    // Step 3: Call chatPropose to generate structured deltas + edges
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: description,
      },
      ...initialMessages,
    ];

    const { deltas, deltaEdges, usage } = await chatService.propose(
      planId,
      messages,
      context,
    );

    return this.persistPlanWithDeltas(planId, description, deltas, deltaEdges, usage, createdBy);
  }

  /**
   * M47 stress-test injection path: persist a plan from caller-supplied
   * deltas/edges, bypassing chatPropose entirely. Only reachable from the
   * test-only route guard (NODE_ENV !== 'production'); the route never exposes
   * this in production. Deltas are re-tagged with a fresh planId and schema-
   * validated before the normal persistence flow runs.
   */
  async createPlanFromInjectedDeltas(
    description: string,
    rawDeltas: unknown[],
    rawEdges: unknown[],
    createdBy?: string,
  ): Promise<CreatePlanFromDescriptionResult> {
    if (!description || description.trim().length === 0) {
      throw new GraphIntakeValidationError(
        'Description is required and must be a non-empty string',
      );
    }

    if (!isNeo4jEnabled()) {
      throw new GraphIntakeDisabledError('Neo4j authoring graph is disabled — cannot create graph-based plan. Enable NEO4J_ENABLED first.');
    }

    const planId = uuidv4();
    const now = new Date().toISOString();

    const deltas = rawDeltas.map((d) => {
      const parsed = GraphDeltaSchema.safeParse({
        ...(typeof d === 'object' && d !== null ? d : {}),
        planId,
        createdAt: now,
      });
      if (!parsed.success) {
        throw new GraphIntakeValidationError(
          `Injected delta failed schema validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }
      return parsed.data;
    });
    const deltaEdges = rawEdges.map((e) => {
      const parsed = GraphDeltaEdgeSchema.safeParse({
        ...(typeof e === 'object' && e !== null ? e : {}),
        planId,
      });
      if (!parsed.success) {
        throw new GraphIntakeValidationError(
          `Injected edge failed schema validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }
      return parsed.data;
    });

    return this.persistPlanWithDeltas(planId, description, deltas, deltaEdges, null, createdBy);
  }

  /**
   * Partition a plan's deltas/edges into the set that is safe to write, plus a
   * diagnostic per dropped item.
   *
   * Runs in a read-only session BEFORE the write transaction so the plan_json
   * snapshot and the graph write can share one safe set. Intake is single-writer
   * (CLI-driven), so the small TOCTOU window before the write is acceptable.
   */
  private async partitionForWrite(
    planDeltas: GraphDelta[],
    planEdges: GraphDeltaEdge[],
  ): Promise<{ safeDeltas: GraphDelta[]; safeEdges: GraphDeltaEdge[]; diagnostics: IntakeDiagnostic[] }> {
    if (!isNeo4jEnabled()) {
      return { safeDeltas: planDeltas, safeEdges: planEdges, diagnostics: [] };
    }
    const diagnostics: IntakeDiagnostic[] = [];
    const deltaPartition = await partitionDeltas(planDeltas);
    diagnostics.push(...deltaPartition.diagnostics);

    // Only deltas that survived can anchor an edge, so an edge whose source was
    // dropped is correctly reported as dangling rather than silently attaching to a
    // stale node from an earlier run.
    const safeKeys = new Set(deltaPartition.safe.map((d) => deltaKey(d.nodeType, d.nodeId)));
    const droppedKeys = new Set(
      planDeltas.filter((d) => !safeKeys.has(deltaKey(d.nodeType, d.nodeId))).map((d) => deltaKey(d.nodeType, d.nodeId)),
    );
    const edgePartition = await partitionDeltaEdges(planEdges, safeKeys, undefined, droppedKeys);
    diagnostics.push(...edgePartition.diagnostics);

    return { safeDeltas: deltaPartition.safe, safeEdges: edgePartition.safe, diagnostics };
  }

  /** Shared post-proposal persistence flow (OLTP row + Neo4j transaction).
   *
   * Fail-open by contract: submitting a plan always yields a plan. A delta or edge
   * that cannot be resolved against the canonical graph is DROPPED from the write
   * set and recorded as a note, never thrown. Only a genuine infra failure (Neo4j
   * unreachable) still aborts and rolls the OLTP row back.
   */
  private async persistPlanWithDeltas(
    planId: string,
    description: string,
    deltas: GraphDelta[],
    deltaEdges: GraphDeltaEdge[],
    usage: LLMUsage | null,
    createdBy?: string,
  ): Promise<CreatePlanFromDescriptionResult> {
    const timestamp = new Date().toISOString();
    // Step 4: Validate we got deltas back
    if (!deltas || deltas.length === 0) {
      throw new GraphIntakeValidationError('chatPropose returned no deltas for the description');
    }
    const deleteDelta = deltas.find((delta) => delta.op === 'DELETE');
    if (deleteDelta) {
      throw new GraphIntakeValidationError(`Cannot synthesize a plan item from a DELETE delta for [${deleteDelta.nodeType}:${deleteDelta.nodeId}] — delete materialization is not supported by the legacy plan contract. Remove the tombstone before approving.`);
    }

    // Assign the new planId to all deltas/edges before anything inspects them.
    let planDeltas = deltas.map(d => ({ ...d, planId }));
    const planEdges = deltaEdges.map(e => ({ ...e, planId }));

    // M50: attach `_resolution` to each delta for any natural-language reference
    // it carries (e.g. a Scene's `district` field). Best-effort: if the graph is
    // unavailable or resolution throws, proceed without it so intake never aborts
    // on the advisory resolution layer.
    if (isNeo4jEnabled()) {
      try {
        planDeltas = await entityResolutionService.resolvePlanDeltas(planDeltas);
      } catch (resErr) {
        console.warn('[graph-intake] entity resolution failed; skipping _resolution attachment:', (resErr as Error).message);
      }
    }

    // Partition BEFORE synthesis so the plan_json snapshot and the graph write
    // share ONE safe set. Doing this after synthesis would let a delta be present
    // in plan_json but absent from the graph (or the reverse), which is exactly the
    // kind of silent divergence that makes a "successful" plan unusable later.
    const partition = await this.partitionForWrite(planDeltas, planEdges);
    const partitionDiagnostics: IntakeDiagnostic[] = [...partition.diagnostics];
    let safeDeltas = partition.safeDeltas;
    let safeEdges = partition.safeEdges;

    // Create the plan row in OLTP. plan_json is synthesized from the
    // deltas/edges so every legacy/preview consumer (which parses plan_json
    // directly, e.g. StoryBuilderOrchestrator.stagePlan, StoryBuilderSolidify,
    // StoryBuilderMigration, AssetPublishService) receives a valid ContentPlan
    // instead of an empty object that fails ContentPlanSchema.parse.
    const context = await this.gatherContext();
    const synthesized = await synthesizePlanFromDeltas(planId, description, safeDeltas, safeEdges, context);
    partitionDiagnostics.push(...synthesized.diagnostics);

    // A MODIFY excluded by synthesis (unresolvable canonical slug) must not be
    // written to the graph either — otherwise the snapshot and the graph disagree.
    const excludedKeys = new Set(
      synthesized.diagnostics
        .filter((d) => d.kind === 'unresolvable_canonical_slug')
        .map((d) => deltaKey(d.nodeType, d.nodeId)),
    );
    if (excludedKeys.size > 0) {
      safeDeltas = safeDeltas.filter((d) => !excludedKeys.has(deltaKey(d.nodeType, d.nodeId)));
      const remaining = new Set(safeDeltas.map((d) => deltaKey(d.nodeType, d.nodeId)));
      safeEdges = safeEdges.filter((e) => remaining.has(deltaKey(e.sourceNodeType, e.sourceNodeId)));
    }

    // Reject a schema-invalid plan before it is persisted. The synthesized
    // snapshot is what every legacy/preview consumer parses; persisting an
    // invalid one would make preview/stage/approve fail opaquely later.
    const parsedPlan = ContentPlanSchema.safeParse(synthesized.plan);
    if (!parsedPlan.success) {
      throw new GraphIntakeValidationError(
        `Synthesized plan for [${planId}] failed schema validation: ${parsedPlan.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
    }
    await queryOLTP(
      `INSERT INTO content_plans
         (id, description, status, plan_json, created_by, created_at, updated_at)
       VALUES ($1, $2, 'proposed', $3::jsonb, $4, $5, $5)`,
      [planId, description, parsedPlan.data, createdBy ?? null, timestamp],
    );

    // Step 6: Write the safe deltas and edges to Neo4j in a single transaction.
    // Nothing in this block throws for the ambiguity class anymore, so the
    // delete-the-OLTP-row rollback below is reachable only for real infra
    // failures (Neo4j down, unsafe relationship type), which must still abort.
    try {
      await runNeo4jTransaction(async (tx) => {
        for (const delta of safeDeltas) {
          await applyDelta(delta, tx);
        }
        for (const edge of safeEdges) {
          await applyDeltaEdge(edge, tx);
        }
      });
    } catch (graphErr) {
      // Clean up the orphaned OLTP plan row so we never leave a 'proposed' plan
      // with no corresponding graph deltas.
      try {
        await queryOLTP('DELETE FROM content_plans WHERE id = $1', [planId]);
      } catch (cleanupErr: any) {
        console.error(`[graph-intake] Failed to clean up orphaned plan ${planId} after graph failure:`, cleanupErr.message);
      }
      throw graphErr;
    }

    // Turn every unresolved reference + dropped delta/edge into reviewable notes
    // (suggestions + `CritiqueAnnotation`s) the author can reply to via plan:amend.
    const notes = await this.triageAndAnnotate(planId, safeDeltas, partitionDiagnostics);

    emitAdminEvent(
      'plan_created',
      {
        descriptionLength: description.trim().length,
        deltaCount: safeDeltas.length,
        edgeCount: safeEdges.length,
        droppedCount: partitionDiagnostics.length,
        noteCount: notes.length,
        source: 'graph-intake',
      },
      planId,
      createdBy,
    );

    return {
      planId,
      description,
      deltaCount: safeDeltas.length,
      edgeCount: safeEdges.length,
      notes,
      usage,
      timestamp,
    };
  }

  /**
   * Collect every "the graph could not confidently resolve this" signal for a plan,
   * attach an LLM-authored suggestion to each, and persist them as reviewable
   * `CritiqueAnnotation`s under scope `'intake'`.
   *
   * Shared by intake and amend so the notes an author sees after amending are
   * produced by exactly the same code path as the notes they saw after intake —
   * including a fresh note when an amendment only partially resolved an ambiguity.
   *
   * Sources:
   *   - `_resolution` blocks with `status !== 'resolved'` (ambiguous / unresolved
   *     natural-language references, from EntityResolutionService)
   *   - `IntakeDiagnostic`s (deltas/edges dropped from the write set)
   *
   * Entirely best-effort. A suggestion is cosmetic and an annotation is a review
   * aid; neither may abort a plan that has already been persisted.
   */
  async triageAndAnnotate(
    planId: string,
    deltas: GraphDelta[],
    diagnostics: IntakeDiagnostic[],
  ): Promise<IntakeNote[]> {
    // Keep resolution blocks paired with their owning delta so a note can name the
    // entity it belongs to (a ResolutionBlock alone has no nodeType/nodeId).
    const resolutionNotes: Array<{ delta: GraphDelta; block: ResolutionBlock }> = [];
    for (const delta of deltas) {
      for (const block of delta._resolution ?? []) {
        if (block.status !== 'resolved') resolutionNotes.push({ delta, block });
      }
    }

    const items: IntakeDiagnosticItem[] = [
      ...resolutionNotes.map((r) => r.block),
      ...diagnostics,
    ];
    if (items.length === 0) return [];

    // One batched LLM call for the whole plan. Mirrors the best-effort treatment of
    // `resolvePlanDeltas`: on any failure fall back to the templated string.
    let suggestions: string[];
    try {
      const result = await this.provider.suggestDiagnostics(items);
      suggestions = items.map((item, i) => result.suggestions[i] || templatedSuggestion(item));
    } catch (err) {
      console.warn('[graph-intake] suggestion generation failed; using templated fallbacks:', (err as Error).message);
      suggestions = items.map(templatedSuggestion);
    }

    const notes: IntakeNote[] = [
      ...resolutionNotes.map(({ delta, block }, i) => ({
        nodeType: delta.nodeType,
        nodeId: delta.nodeId,
        field: block.field,
        status: block.status,
        raw: block.raw,
        kind: undefined,
        reason: `"${block.raw}" could not be confidently matched${block.field ? ` for ${delta.nodeType}.${block.field}` : ''} (${block.status}).`,
        suggestion: suggestions[i],
        candidates: block.candidates,
        annotationId: undefined as string | undefined,
      })),
      ...diagnostics.map((d, i) => ({
        nodeType: d.nodeType,
        nodeId: d.nodeId,
        field: d.field,
        status: d.status,
        raw: d.raw,
        kind: d.kind as string | undefined,
        reason: d.reason,
        suggestion: suggestions[resolutionNotes.length + i],
        candidates: d.candidates,
        annotationId: undefined as string | undefined,
      })),
    ];

    // Persist as annotations so `plan:amend --annotation <id>:"<comment>"` has a
    // durable handle to reply to. Best-effort: losing the annotation only costs the
    // amend handle, and the note itself is still printed by the CLI.
    try {
      const drafts: CritiqueAnnotationDraft[] = notes.map((note) => ({
        type: 'suggestion' as const,
        severity: 'warning' as const,
        description: `${note.reason} ${note.suggestion ?? ''}`.trim(),
        // `suggestion` annotations carry no evidence requirement, so nothing has to
        // be fabricated to satisfy the anti-hallucination refinement.
        evidence: [],
        relatedEntities: [{ entityType: note.nodeType, slug: note.nodeId }],
        scope: 'intake' as const,
        aiModel: this.provider.critiqueModel('intake'),
        status: 'open' as const,
        planId,
        itemIds: [note.nodeId],
        inputHash: '',
      }));
      const attached = await aiCritiqueService.attachDiagnosticAnnotations(planId, drafts);
      attached.forEach((annotation, i) => {
        if (notes[i]) notes[i].annotationId = annotation.id;
      });
    } catch (err) {
      console.warn('[graph-intake] failed to attach diagnostic annotations:', (err as Error).message);
    }

    return notes;
  }

  /**
   * M50 Part 2 (numeral 1) — apply a free-form, unscoped instruction against an
   * existing plan. Re-enters the propose→apply loop targeting the existing planId
   * (no annotation anchor): the LLM sees the plan's current deltas so a remake can
   * reuse a plan-local nodeId and MERGE in place, while a genuinely new entity is
   * added with a fresh nodeId. New deltas get the standard `_resolution` treatment
   * via a plan-aware candidate source. Stops at `proposed` — never stages, migrates,
   * or solidifies.
   */
  async amendPlanWithInstruction(
    planId: string,
    instruction: string,
    createdBy?: string,
    adminUrl?: string,
  ): Promise<AmendInstructionResult> {
    if (!instruction || typeof instruction !== 'string' || instruction.trim().length === 0) {
      throw new GraphIntakeValidationError('Instruction is required and must be a non-empty string');
    }
    if (!isNeo4jEnabled()) {
      throw new GraphIntakeDisabledError('Neo4j authoring graph is disabled — cannot amend graph-based plan. Enable NEO4J_ENABLED first.');
    }

    const planRow = await queryOLTP<{ status: string; description: string }>(
      `SELECT status, description FROM content_plans WHERE id = $1`,
      [planId],
    );
    if (planRow.rows.length === 0) {
      throw new GraphIntakeValidationError(`Plan ${planId} not found`);
    }
    const status = planRow.rows[0].status;
    if (status !== 'proposed') {
      throw new GraphIntakeValidationError(
        `Plan ${planId} has status '${status}' — only a 'proposed' plan can be amended.`,
      );
    }

    const existing = await this.getPlanDeltas(planId);

    const proposal = await chatService.propose(
      planId,
      [{ role: 'user', content: instruction }],
      undefined,
      undefined,
      existing.deltas,
    );

    // Plan-aware resolution: let references in the new deltas resolve against
    // both canonical nodes and the plan's own pending deltas, so a remake that
    // references a plan-local entity is not flagged ambiguous/unresolved.
    let resolvedDeltas = proposal.deltas;
    try {
      const resolver = new EntityResolutionService(new PlanAwareCandidateSource(planId));
      resolvedDeltas = await resolver.resolvePlanDeltas(proposal.deltas);
    } catch (resErr) {
      console.warn('[graph-intake] entity resolution failed during instruction amend; skipping _resolution attachment:', (resErr as Error).message);
    }

    // Reject DELETE deltas before any graph write, mirroring persistPlanWithDeltas:
    // a DELETE against the canonical graph has no materialization in the legacy
    // plan_json contract, so it must be rejected early rather than written and
    // then surfacing a synthesis failure after the fact.
    const deleteDelta = resolvedDeltas.find((delta) => delta.op === 'DELETE');
    if (deleteDelta) {
      throw new GraphIntakeValidationError(
        `Cannot synthesize a plan item from a DELETE delta for [${deleteDelta.nodeType}:${deleteDelta.nodeId}] — delete materialization is not supported by the legacy plan contract. Remove the tombstone before approving.`,
      );
    }


    // Preflight synthesis: identify which new deltas would be excluded by
    // synthesizePlanFromDeltas (e.g. unresolvable canonical slugs) so we can
    // drop them from the write set. This keeps the applied graph set exactly
    // equal to the synthesized snapshot, matching persistPlanWithDeltas.
    const existingGraph = await this.getPlanDeltas(planId);
    const preflightDeltas = [...existingGraph.deltas, ...resolvedDeltas];
    const preflightEdges = [...existingGraph.edges, ...proposal.deltaEdges];
    const preflight = await synthesizePlanFromDeltas(planId, planRow.rows[0].description, preflightDeltas, preflightEdges, await this.gatherContext());
    const excludedKeys = new Set(
      preflight.diagnostics
        .filter((d) => d.kind === 'unresolvable_canonical_slug')
        .map((d) => deltaKey(d.nodeType, d.nodeId)),
    );
    const filteredDeltas = resolvedDeltas.filter((d) => !excludedKeys.has(deltaKey(d.nodeType, d.nodeId)));
    // Retain edges whose source is EITHER a newly-applied delta (filteredDeltas)
    // OR a surviving existing delta (existingGraph.deltas). An amendment edge
    // referencing an existing plan delta as its source must not be dropped just
    // because that source isn't part of this amendment's new deltas.
    const remainingKeys = new Set<string>([
      ...filteredDeltas.map((d) => deltaKey(d.nodeType, d.nodeId)),
      ...existingGraph.deltas.map((d) => deltaKey(d.nodeType, d.nodeId)),
    ]);
    const filteredEdges = proposal.deltaEdges.filter((e) => remainingKeys.has(deltaKey(e.sourceNodeType, e.sourceNodeId)));

    // applyDeltas writes to Neo4j (not OLTP), so it runs before the OLTP
    // transaction. A MODIFY/DELETE against a same-plan :ContentDelta now MERGEs
    // in place (partitionDeltas accepts it); a genuinely missing base is dropped
    // and reported as a diagnostic.
    const result = await chatService.applyDeltas(planId, filteredDeltas, filteredEdges);

    // Refresh the snapshot from the post-apply graph and synthesize plan_json.
    const graph = await this.getPlanDeltas(planId);
    const synthesized = await synthesizePlanFromDeltas(planId, planRow.rows[0].description, graph.deltas, graph.edges, await this.gatherContext());
    const parsedPlan = ContentPlanSchema.safeParse(synthesized.plan);
    const planJson: ContentPlan | null = parsedPlan.success ? parsedPlan.data : null;
    if (!planJson) {
      console.warn(
        `[graph-intake] amended plan ${planId} snapshot failed schema validation: ` +
        (parsedPlan.success ? '' : parsedPlan.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')),
      );
    }

    // Persist plan_json inside a transaction-scoped advisory lock so a concurrent
    // reject/delete (which takes the same lock key) can never interleave between
    // applyDeltas and this write. pg_advisory_xact_lock is automatically released
    // at transaction end — no session pinning, no unlock-on-different-connection
    // leaks. COALESCE keeps a schema-invalid snapshot from wiping the previous
    // valid one.
    await withOLTPTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`plan-lifecycle:${planId}`]);

      const confirm = await client.query<{ status: string }>(
        'SELECT status FROM content_plans WHERE id = $1 FOR UPDATE',
        [planId],
      );
      if (confirm.rows.length === 0) {
        throw new GraphIntakeValidationError(`Plan ${planId} not found — it was deleted by another operation.`);
      }
      if (confirm.rows[0].status !== 'proposed') {
        throw new GraphIntakeValidationError(
          `Plan ${planId} has status '${confirm.rows[0].status}' — only a 'proposed' plan can be amended.`,
        );
      }
      await client.query(
        `UPDATE content_plans SET updated_at = now(), plan_json = COALESCE($2::jsonb, plan_json) WHERE id = $1`,
        [planId, planJson],
      );
    });

    const notes = await this.triageAndAnnotate(planId, graph.deltas, [...result.diagnostics, ...synthesized.diagnostics]);

    emitAdminEvent(
      'plan_refined',
      {
        instruction: instruction.trim().length > 0 ? instruction : '(empty)',
        deltaCount: graph.deltas.length,
        edgeCount: graph.edges.length,
        appliedCount: result.appliedCount,
        droppedCount: (resolvedDeltas.length - filteredDeltas.length) + result.diagnostics.length,
        noteCount: notes.length,
        source: 'graph-intake',
      },
      planId,
      createdBy,
    );

    return {
      planId,
      status,
      actor: createdBy
        ? { id: createdBy, email: createdBy, role: 'admin' }
        : undefined,
      instruction,
      appliedCount: result.appliedCount,
      droppedCount: (resolvedDeltas.length - filteredDeltas.length) + result.diagnostics.length,
      reply: proposal.reply,
      deltaCount: graph.deltas.length,
      edgeCount: graph.edges.length,
      deltas: graph.deltas,
      edges: graph.edges,
      notes,
      reviewUrl: adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
      next: notes.length > 0
        ? 'Some references are still unresolved — reply to the remaining notes below.'
        : 'Instruction applied. Review the plan before invoking approval/solidify; no content files or canonical rows were changed.',
    };
  }

  /**
   * Resolve the canonical field set for a base `:Content` node (planId IS null).
   * Returns `null` when the graph is off, the node does not exist, or the read
   * fails — the diff callers treat a `null` "before" as "no canonical counterpart"
   * (true for ADD deltas, or for an unexpected read error on a MODIFY/DELETE).
   */
  private async getCanonicalFields(
    nodeType: string,
    nodeId: string,
  ): Promise<{ name: string; fields: Record<string, unknown> } | null> {
    if (!isNeo4jEnabled()) return null;
    try {
      const rows = await runNeo4jQuery<{ name: unknown; props: Record<string, unknown> }>(
        `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId })
         WHERE c.planId IS null
         RETURN c.name AS name, properties(c) AS props`,
         { nodeType, nodeId: normalizeKeyComponent(nodeId) },
      );
      if (rows.length === 0) return null;
      // Canonical fields are stored as node properties (GraphBaseService.upsertContentNode
      // does `SET c = $props`), not as a fieldsJson blob. Read properties(c) and strip
      // the graph identity/partition properties so diffing compares author fields only.
      const reserved = new Set(['key', 'nodeType', 'nodeId', 'planId', 'isEvidence']);
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rows[0].props ?? {})) {
        if (!reserved.has(k)) fields[k] = v;
      }
      return {
        name: typeof rows[0].name === 'string' ? rows[0].name : nodeId,
        fields,
      };
    } catch (err) {
      console.warn('[graph-intake] canonical field lookup failed:', (err as Error)?.message);
      return null;
    }
  }

/**
 * M50 Part 2 (numeral 2) — structured canonical-before vs proposed-after diff for
 * every delta currently in a plan, field-by-field including prose. New entities
   * (ADD deltas) have no canonical counterpart, so their "before" is `null` and
   * every field shows as `added`. DELETE deltas invert this: the "after" is `null`
   * and every field is `removed`. MODIFY deltas compare the full proposed shadow
   * against the canonical field set.
   *
   * This is the CLI-testable precursor to M52's diff rendering: it proves the
   * data/shape (before/after per field), and the admin UI only needs to render it.
   */
  async buildPlanDiff(planId: string): Promise<PlanDiffResult> {
    const { deltas, edges } = await this.getPlanDeltas(planId);
    const result: PlanDeltaDiff[] = [];

    for (const delta of deltas) {
      const canonical = delta.op !== 'ADD'
        ? await this.getCanonicalFields(delta.nodeType, delta.nodeId)
        : null;
      const before = delta.op === 'ADD' ? null : (canonical?.fields ?? null);
      const proposed = delta.op === 'DELETE'
        ? null
        : delta.op === 'MODIFY' && canonical
          ? deepMergeObjects(canonical.fields, delta.fields)
          : delta.fields;
      const name = (typeof delta.fields?.name === 'string' && delta.fields.name.length > 0)
        ? delta.fields.name
        : (canonical?.name ?? delta.nodeId);

      // Flatten nested objects (e.g. `metadata.personality`) into dotted keys so the
      // diff surfaces the exact changed sub-field, not just "metadata changed". Arrays
      // stay atomic (compared as a whole) so a reordered list reads as `modified`.
      const flatBefore = flattenFields(before);
      const flatAfter = flattenFields(proposed);
      const keySet = new Set<string>([...Object.keys(flatBefore), ...Object.keys(flatAfter)]);
      const fields: PlanFieldDiff[] = [];
      for (const field of keySet) {
        const beforeHas = Object.prototype.hasOwnProperty.call(flatBefore, field);
        const afterHas = Object.prototype.hasOwnProperty.call(flatAfter, field);
        const b = beforeHas ? flatBefore[field] : undefined;
        const a = afterHas ? flatAfter[field] : undefined;
        let change: PlanFieldDiff['change'];
        if (!beforeHas && afterHas) change = 'added';
        else if (beforeHas && !afterHas) change = 'removed';
        else if (JSON.stringify(b) !== JSON.stringify(a)) change = 'modified';
        else change = 'unchanged';
        fields.push({ field, before: b, after: a, change });
      }

      result.push({
        nodeType: delta.nodeType,
        nodeId: delta.nodeId,
        op: delta.op,
        name,
        before,
        after: proposed,
        fields,
        ...(delta._resolution ? { resolution: delta._resolution } : {}),
      });
    }

    return { planId, deltas: result, edges };
  }

  /**
   * Get the deltas and edges for an existing graph-based plan.
   * Returns empty arrays when Neo4j is disabled.
   */
  async getPlanDeltas(planId: string): Promise<{ deltas: GraphDelta[]; edges: GraphDeltaEdge[] }> {
    if (!isNeo4jEnabled()) {
      return { deltas: [], edges: [] };
    }
    const [deltas, edges] = await Promise.all([
      getDeltasForPlan(planId, undefined),
      getDeltaEdgesForPlan(planId, undefined),
    ]);
    return { deltas, edges };
  }

    /**
   * Delete a graph-based plan and its associated deltas.
   */
  async discardPlan(planId: string): Promise<void> {
    if (!isNeo4jEnabled()) {
      return;
    }

    // Delete deltas from Neo4j
    await clearDeltasForPlan(planId);

    // Delete the plan row from OLTP
    await queryOLTP('DELETE FROM content_plans WHERE id = $1', [planId]);
  }

  /**
   * Status allowlists for lifecycle operations. Rejection is only valid for a
   * `proposed` plan (the initial state); deletion is valid for `proposed` or
   * `rejected` plans (both are pre-materialization). Any other status is
   * refused — this is an explicit allowlist, not a blacklist, so newly added
   * statuses (pending, staging, migrating, verifying, etc.) are refused by
   * default rather than accidentally permitted.
   */
  private static readonly REJECTABLE_STATUSES = new Set(['proposed']);
  private static readonly DELETABLE_STATUSES = new Set(['proposed', 'rejected']);

  /**
   * Soft-reject a plan (`plan:reject`): keep the row (status = 'rejected', still
   * visible in `plan:get`/`plan:list` for audit), prune its authoring-graph
   * deltas/edges, and close open intake annotations. Never touches canonical
   * content. Graph pruning is a no-op (but the status/annotation flip still
   * applies) when Neo4j is disabled.
   */
  async rejectPlan(planId: string): Promise<PlanLifecycleResult> {
    // Prune this plan's graph deltas first (Neo4j, not OLTP). Best-effort when
    // Neo4j is disabled.
    let deltaPruned = false;
    if (isNeo4jEnabled()) {
      await clearDeltasForPlan(planId);
      deltaPruned = true;
    }

    // All OLTP mutations happen inside a transaction-scoped advisory lock so
    // concurrent amendments/rejects/delete serialize on the same `plan-lifecycle:
    // <planId>` key. pg_advisory_xact_lock is automatically released at
    // transaction end — no session pinning, no unlock leaks.
    const { annotationCount } = await withOLTPTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`plan-lifecycle:${planId}`]);

      const row = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM content_plans WHERE id = $1 FOR UPDATE',
        [planId],
      );
      if (row.rows.length === 0) {
        throw new GraphIntakeValidationError(`Plan not found: ${planId}`);
      }
      const status = row.rows[0].status;
      if (status === 'rejected') {
        throw new GraphIntakeValidationError(`Plan ${planId} is already rejected`);
      }
      if (!GraphIntakeService.REJECTABLE_STATUSES.has(status)) {
        throw new GraphIntakeValidationError(
          `Plan ${planId} cannot be rejected — status '${status}' is not rejectable. `
            + `Only 'proposed' plans may be rejected.`,
        );
      }

      // Count open intake annotations, then close them. Rejection closes them:
      // the rationale lives in critique annotations, not the graph.
      const countRow = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM critique_annotations
         WHERE plan_id = $1 AND scope = 'intake' AND status = 'open'`,
        [planId],
      );
      const annotationCount = countRow.rows.length > 0 ? Number(countRow.rows[0].count) : 0;
      if (annotationCount > 0) {
        await client.query(
          `UPDATE critique_annotations SET status = 'addressed'
           WHERE plan_id = $1 AND scope = 'intake' AND status = 'open'`,
          [planId],
        );
      }

      await client.query(
        `UPDATE content_plans
         SET status = 'rejected',
             updated_at = NOW(),
             plan_json = jsonb_set(plan_json, '{status}', '"rejected"', true)
         WHERE id = $1`,
        [planId],
      );

      return { annotationCount };
    });

    emitAdminEvent('plan_rejected', { planId }, planId);

    return { planId, status: 'rejected', deltaPruned, annotationCount };
  }

  /**
   * Hard-delete a plan (`plan:delete`): remove the content_plans row, its graph
   * deltas/edges, and its scope='intake' critique annotations. Irreversible —
   * the CLI refuses to run without `--yes` and refuses plans already in the
   * materialize pipeline. Canonical content is never touched (a plan's deltas
   * are plan-scoped, never canonical).
   */
  async deletePlan(planId: string): Promise<PlanLifecycleResult> {
    // Prune graph deltas first (Neo4j, not OLTP). The row is the join key.
    if (isNeo4jEnabled()) {
      await clearDeltasForPlan(planId);
    }

    // All OLTP mutations happen inside a transaction-scoped advisory lock so
    // concurrent amendments/rejects serialize on the same `plan-lifecycle:
    // <planId>` key. pg_advisory_xact_lock is automatically released at
    // transaction end — no session pinning, no unlock leaks.
    const { status, annotationCount } = await withOLTPTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`plan-lifecycle:${planId}`]);

      const row = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM content_plans WHERE id = $1 FOR UPDATE',
        [planId],
      );
      if (row.rows.length === 0) {
        throw new GraphIntakeValidationError(`Plan not found: ${planId}`);
      }
      const status = row.rows[0].status;
      if (!GraphIntakeService.DELETABLE_STATUSES.has(status)) {
        throw new GraphIntakeValidationError(
          `Plan ${planId} cannot be deleted — status '${status}' is not deletable. `
            + `Only 'proposed' or 'rejected' plans are deletable.`,
        );
      }

      const ann = await client.query<{ id: string }>(
        `DELETE FROM critique_annotations WHERE plan_id = $1 AND scope = 'intake' RETURNING id`,
        [planId],
      );
      const annotationCount = ann.rows.length;

      await client.query('DELETE FROM content_plans WHERE id = $1', [planId]);

      return { status, annotationCount };
    });

    emitAdminEvent('plan_deleted', { planId, status }, planId);

    return { planId, status, deltaPruned: isNeo4jEnabled(), annotationCount };
  }

  /**
   * Full resumable state of a plan (`plan:get`). Read-only — never mutates the
   * plan or its deltas. Surfaces the canonical-before/proposed-after diff plus
   * the open intake annotations an author can reply to.
   */
  async getPlanState(planId: string): Promise<PlanState | null> {
    const row = await queryOLTP<{
      id: string; status: string; created_by: string | null;
      description: string | null; created_at: string; updated_at: string;
    }>(
      `SELECT id, status, created_by, description, created_at, updated_at
       FROM content_plans WHERE id = $1`,
      [planId],
    );
    if (row.rows.length === 0) {
      return null;
    }
    const plan = row.rows[0];
    const { deltas, edges } = await this.getPlanDeltas(planId);
    const planDiff = await this.buildPlanDiff(planId);
    const openAnnotations = await this.getPlanOpenAnnotations(planId);

    return {
      planId: plan.id,
      status: plan.status,
      created_by: plan.created_by,
      description: plan.description,
      created_at: plan.created_at,
      updated_at: plan.updated_at,
      deltaCount: deltas.length,
      edgeCount: edges.length,
      deltas,
      edges,
      diff: planDiff.deltas,
      openAnnotations,
      reviewUrl: reviewUrl(process.env.ADMIN_URL ?? 'http://localhost:3002', planId),
    };
  }

  /**
   * List plans with optional filters (`plan:list`). Defaults to non-materialized
   * plans (proposed + rejected) so a routine "what's open" check isn't buried
   * under history. `deltaCount` is computed from Neo4j per plan; 0 when disabled.
   */
  async listPlans(opts: { status?: string; createdBy?: string; since?: string } = {}): Promise<PlanListing[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (opts.status) {
      where.push(`status = $${i}`);
      params.push(opts.status);
      i += 1;
    } else {
      where.push(`status IN ('proposed', 'rejected')`);
    }
    if (opts.createdBy) {
      where.push(`created_by = $${i}`);
      params.push(opts.createdBy);
      i += 1;
    }
    if (opts.since) {
      where.push(`created_at >= $${i}::timestamptz`);
      params.push(opts.since);
      i += 1;
    }
    const rows = await queryOLTP<{
      id: string; status: string; created_by: string | null;
      description: string | null; created_at: string; updated_at: string;
    }>(
      `SELECT id, status, created_by, description, created_at, updated_at
       FROM content_plans${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC`,
      params,
    );

    return Promise.all(rows.rows.map(async (r) => ({
      id: r.id,
      status: r.status,
      created_by: r.created_by,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deltaCount: await countDeltasForPlan(r.id),
    })));
  }

  /**
   * Open intake annotations for a plan, used by `plan:get`/`plan:diff` so an
   * author can see what still needs replying to.
   */
  private async getPlanOpenAnnotations(planId: string): Promise<OpenAnnotationInfo[]> {
    const rows = await queryOLTP<{
      id: string; type: string; status: string; created_at: string;
    }>(
      `SELECT id, type, status, created_at
       FROM critique_annotations
       WHERE plan_id = $1 AND scope = 'intake' AND status = 'open'
       ORDER BY created_at ASC`,
      [planId],
    );
    return rows.rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status as 'open' | 'addressed' | 'dismissed',
      createdAt: r.created_at,
    }));
  }

  /** Synthesize a legacy ContentPlan from a plan's deltas+edges.
   * This allows the legacy materialize pipeline (stagePlan → migrateContent)
   * to consume graph-based plans.
   */
  async synthesizeLegacyPlan(planId: string): Promise<ContentPlan | null> {
    const result = await queryOLTP<{ description: string }>(
      'SELECT description FROM content_plans WHERE id = $1',
      [planId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const description = result.rows[0].description;
    const { deltas, edges } = await this.getPlanDeltas(planId);
    const context = await this.gatherContext();

    const synthesized = await synthesizePlanFromDeltas(planId, description, deltas, edges, context);
    // Validate so consumers (e.g. staging) never receive a schema-invalid plan
    // that would later fail ContentPlanSchema.parse opaquely. Diagnostics are
    // discarded here: this is a read-only re-synthesis of an already-persisted
    // plan, and the notes were recorded as annotations at intake/amend time.
    const parsed = ContentPlanSchema.safeParse(synthesized.plan);
    return parsed.success ? parsed.data : null;
  }

  /**
   * Load a ContentPlan for any legacy (plan_json-based) consumer (e.g. preview,
   * stage). Graph-authored plans persist a synthesized `plan_json` snapshot. If
   * an older graph plan has an empty snapshot, synthesize it from graph deltas.
   */
  async loadPlanForLegacyActions(
    planId: string,
  ): Promise<{ notFound?: boolean; error?: string; plan?: ContentPlan }> {
    const result = await queryOLTP<{ plan_json: any }>(
      'SELECT plan_json FROM content_plans WHERE id = $1',
      [planId],
    );
    if (result.rows.length === 0) {
      return { notFound: true };
    }

    const planJson = result.rows[0].plan_json;
    const isEmpty =
      !planJson ||
      (typeof planJson === 'object' && !Array.isArray(planJson) && Object.keys(planJson).length === 0);

    if (isEmpty && isNeo4jEnabled()) {
      try {
        const synthesized = await this.synthesizeLegacyPlan(planId);
        if (synthesized) return { plan: synthesized };
      } catch (err) {
        console.warn(`[graph-intake] failed to synthesize plan ${planId}:`, (err as Error)?.message);
      }
    }

    try {
      return { plan: ContentPlanSchema.parse(planJson) };
    } catch {
      return { error: 'Stored plan failed schema validation' };
    }
  }

  /** Gather existing content context (shared with ContentPlanService). */
  private async gatherContext(): Promise<ExistingContentContext> {
    return contentPlanService.gatherContext();
  }
}

/** Flatten nested objects into dotted keys (e.g. `metadata.personality`), keeping
 *  arrays atomic, so a field-by-field diff can pinpoint the exact changed sub-field. */
function flattenFields(
  obj: Record<string, unknown> | null | undefined,
  prefix = '',
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenFields(value as Record<string, unknown>, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/** Singleton export for route handlers. */
export const graphIntakeService = new GraphIntakeService();
