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
  findEdgeMapping,
} from '@las-flores/shared';
import { queryOLTP, queryContent } from '@las-flores/infra';
import { uuidv4 } from '@las-flores/shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import { chatService } from './ChatService.js';
import { emitAdminEvent } from './AdminEventEmitter.js';
import { contentPlanService } from './ContentPlanService.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { applyDelta, applyDeltaEdge, getDeltasForPlan, getDeltaEdgesForPlan, clearDeltasForPlan, preflightDeltas, preflightDeltaEdges, normalizeKeyComponent, resolveEdgeTargetNameValue } from './GraphDeltaService.js';
import { isNeo4jEnabled, runNeo4jTransaction } from './Neo4jClient.js';
import type { ExistingContentContext, LLMUsage } from './types/LLMTypes.js';

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

/** Result of creating a plan from a description via graph deltas. */
export interface CreatePlanFromDescriptionResult {
  planId: string;
  description: string;
  deltaCount: number;
  edgeCount: number;
  usage: LLMUsage | null;
  timestamp: string;
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
 * GraphExporter.resolveLocationSlugs. */
async function resolveLocationSlugsForDeltas(locationIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (locationIds.length === 0) return result;

  const contentDir = resolveContentDir();
  let files: string[];
  try {
    files = await glob(`${contentDir}/districts/*/locations/*/*.yaml`, { absolute: true });
  } catch (err) {
    // Fail closed: a glob failure means we cannot trust a name-derived slug for
    // any Location MODIFY, so surface it rather than letting synthesis stage a
    // wrong (name-derived) path.
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
        result.set(`Location:${normalizeKeyComponent(String(data.id))}`, slug);
      }
    } catch (err) {
      console.warn(`[graph-intake] failed to read location YAML ${file}:`, (err as Error)?.message);
    }
  }

  // Fail closed: if any Location MODIFY id is not resolvable to an on-disk YAML,
  // reject instead of returning a partial map — otherwise synthesis derives a
  // slugified name (wrong path for accented/manually-named locations).
  const expectedKeys = new Set(
    locationIds.map((id) => `Location:${normalizeKeyComponent(id)}`),
  );
  for (const key of expectedKeys) {
    if (!result.has(key)) {
      throw new GraphIntakeValidationError(
        `Canonical location slug lookup failed: ${key} was not found on disk`,
      );
    }
  }
  return result;
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
 * Fail-closed: if the content-store lookup for a given type throws, we cannot
 * trust a name-derived slug for any unresolved MODIFY of that type — rethrow so
 * the synthesized plan fails validation instead of later targeting a
 * non-existent path. (A transient blip still aborts the plan, which is safer
 * than silently writing to the wrong file.) An empty result for a type that
 * simply has no MODIFY deltas is fine and not an error. */
async function resolveCanonicalSlugsForDeltas(deltas: GraphDelta[]): Promise<Map<string, string>> {
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

  const result = new Map<string, string>();
  for (const [nodeType, ids] of byType) {
    if (nodeType === 'Location' || ids.length === 0) continue;
    const meta = CANONICAL_SLUG_QUERY[nodeType];
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
          result.set(`${nodeType}:${normalizeKeyComponent(row.id)}`, slug);
        }
      }
    } catch (err) {
      // Fail closed: a content-store failure means we cannot guarantee the
      // canonical slug for these MODIFY deltas, so surface it rather than
      // letting a name-derived slug target a possibly non-existent path.
      throw new GraphIntakeValidationError(
        `Canonical slug lookup failed for ${nodeType} during plan synthesis: ${(err as Error)?.message}`,
      );
    }
  }

  // Locations: resolve from YAML (no DB table).
  const locationIds = byType.get('Location') ?? [];
  if (locationIds.length > 0) {
    const locationSlugs = await resolveLocationSlugsForDeltas(locationIds);
    for (const [key, slug] of locationSlugs) {
      result.set(key, slug);
    }
  }

  return result;
}

/** Synthesize a ContentPlan from deltas+edges for compatibility with the legacy pipeline. */
async function synthesizePlanFromDeltas(
  planId: string,
  description: string,
  deltas: GraphDelta[],
  edges: GraphDeltaEdge[],
  context: ExistingContentContext,
): Promise<ContentPlan> {
  // Resolve canonical on-disk slugs for MODIFY deltas so a renamed entity keeps
  // its existing file path (see deltaToPlanItem). Best-effort: a content-store
  // failure logs a warning and leaves the map empty, in which case we fall back
  // to the name-derived slug (acceptable for ADD / non-renamed MODIFY).
  const canonicalSlugByKey = await resolveCanonicalSlugsForDeltas(deltas);

  const items = deltas.map(d => deltaToPlanItem(d, context, canonicalSlugByKey));

  // Build an index mapping (nodeType:graphNodeId) → plan-item id so edge links
  // resolve to generated item IDs, not raw graph node IDs. Edges reference the
  // delta's `nodeId` (the graph identity), so we key on that — NOT the
  // transient plan-item id.
  const itemIndex = new Map<string, string>();
  for (let i = 0; i < deltas.length; i++) {
    const delta = deltas[i];
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
  for (const delta of deltas) {
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
    id: planId,
    description,
    status: 'proposed',
    items,
    links,
    _meta: {
      scaffolded_at: new Date().toISOString(),
    },
  };
}

export class GraphIntakeService {
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

  /** Shared post-proposal persistence flow (OLTP row + Neo4j transaction). */
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

    // Create the plan row in OLTP. plan_json is synthesized from the
    // deltas/edges so every legacy/preview consumer (which parses plan_json
    // directly, e.g. StoryBuilderOrchestrator.stagePlan, StoryBuilderSolidify,
    // StoryBuilderMigration, AssetPublishService) receives a valid ContentPlan
    // instead of an empty object that fails ContentPlanSchema.parse.
    const context = await this.gatherContext();
    const synthesizedPlan = await synthesizePlanFromDeltas(planId, description, deltas, deltaEdges, context);
    // Reject a schema-invalid plan before it is persisted. The synthesized
    // snapshot is what every legacy/preview consumer parses; persisting an
    // invalid one would make preview/stage/approve fail opaquely later.
    const parsedPlan = ContentPlanSchema.safeParse(synthesizedPlan);
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

    // Step 6: Write all deltas and edges to Neo4j in a single transaction
    // Assign the new planId to all deltas/edges
    const planDeltas = deltas.map(d => ({ ...d, planId }));
    const planEdges = deltaEdges.map(e => ({ ...e, planId }));

    // If the graph write fails, roll back the OLTP plan row so it is not orphaned.
    try {
      await runNeo4jTransaction(async (tx) => {
        // Write all deltas first, THEN preflight edges — edge preflight checks
        // that edge endpoints exist in the graph, so deltas must already be
        // applied for those endpoints to resolve.
        await preflightDeltas(planDeltas, tx);

        for (const delta of planDeltas) {
          await applyDelta(delta, tx);
        }

        // Edge preflight runs AFTER deltas are written so endpoint lookups succeed.
        await preflightDeltaEdges(planEdges, tx);

        for (const edge of planEdges) {
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

    emitAdminEvent(
      'plan_created',
      {
        descriptionLength: description.trim().length,
        deltaCount: planDeltas.length,
        edgeCount: planEdges.length,
        source: 'graph-intake',
      },
      planId,
      createdBy,
    );

    return {
      planId,
      description,
      deltaCount: planDeltas.length,
      edgeCount: planEdges.length,
      usage,
      timestamp,
    };
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
   * Synthesize a legacy ContentPlan from a plan's deltas+edges.
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
    // that would later fail ContentPlanSchema.parse opaquely.
    const parsed = ContentPlanSchema.safeParse(synthesized);
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

/** Singleton export for route handlers. */
export const graphIntakeService = new GraphIntakeService();
