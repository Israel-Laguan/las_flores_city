// ============================================================
// GraphExporter — M28 graph → ContentPlan exporter
//
// Consumes a plan's merged revision (base ∪ deltas) and emits a `ContentPlan`
// that feeds the EXISTING, UNCHANGED materialize pipeline
// (`stagePlan` → `applyLink` → `migrateContent` → `verifyPlan`).
//
// Edge-type → field mapping is data-driven (see shared `EDGE_FIELD_MAPPINGS`):
//   - delta→canonical target : write the mapped field value directly into the
//     source item's `fields` (canonical UUIDs are stable; the IN_DISTRICT edge
//     resolves the target District's name).
//   - delta→delta target     : emit a `ContentLink { fromItem, toItem, field }`
//     whose target item id is the future entity id (resolveItem writes it).
//   - unsupported edge types (HAS_CHARACTER / APPEARS_IN, join-table only) and
//     unmapped/unknown edge types raise a typed `GraphExportError`.
//
// A DELETE delta blocks the exporter (delete materialization is not supported —
// remove the tombstone before approving).
// ============================================================

import { randomUUID } from 'node:crypto';
import {
  ContentPlanSchema,
  type ContentPlan,
  type ContentPlanItem,
  type ContentLink,
  type GraphDelta,
  type GraphDeltaEdge,
  NODE_TYPE_TO_CONTENT_TYPE,
  findEdgeMapping,
  UNSUPPORTED_EDGE_TYPES,
} from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { isNeo4jEnabled } from './Neo4jClient.js';
import {
  getDeltasForPlan,
  getDeltaEdgesForPlan,
  buildPlanRevisionFromDeltasAndEdges,
} from './GraphDeltaService.js';
import { buildMergedRevision } from './GraphMerger.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { glob } from 'glob';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GraphExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphExportError';
  }
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function freshUuid(): string {
  return randomUUID();
}

// Resolve canonical on-disk slugs for UUID-backed content entities in BULK.
// Individual OLTP round-trips per MODIFY delta make export latency grow linearly
// with network/db latency; instead we group the deltas by node type and issue one
// `WHERE id IN (...)` query per table, then build a `nodeType:nodeId → slug` index
// reused by the delta loop. None of the character/scene/dialogue/overlay/mystery
// tables carry a `slug` column (they store `name`/`title` only), so the slug is
// derived as `slugify(name|title)`. District has a `slug` column in DB.
//
// A content-store failure must never abort the whole export (graph-less dev,
// transient DB blip): on any error we log a warning and return an empty map so the
// caller falls back to the existing slug-derivation logic for each delta.
const CANONICAL_NAME_BULK_QUERY: Partial<Record<string, { table: string; column: string }>> = {
  Character: { table: 'characters', column: 'name' },
  Scene: { table: 'scenes', column: 'name' },
  Dialogue: { table: 'dialogue_trees', column: 'name' },
  Overlay: { table: 'dialogue_overlays', column: 'name' },
  Mission: { table: 'mysteries', column: 'title' },
  District: { table: 'districts', column: 'slug' },
};

/**
 * Resolve Location slugs from their YAML files on disk.
 * Locations are file-only content with no DB table; their slug is derived
 * from the YAML's `name` field using slugify.
 */
async function resolveLocationSlugs(
  locationIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (locationIds.length === 0) return result;

  const contentDir = resolveContentDir();
  let files: string[];
  try {
    files = await glob(`${contentDir}/districts/*/locations/*/*.yaml`, { absolute: true });
  } catch (err) {
    console.warn(
      `[GraphExporter] location YAML glob failed: ${(err as Error).message}`,
    );
    return result;
  }

  const idSet = new Set(locationIds.map((id) => id.toLowerCase()));

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const data: any = yaml.load(raw);
      if (!data || typeof data !== 'object' || !data.id || !data.name) continue;

      const nodeId = String(data.id).toLowerCase();
      if (idSet.has(nodeId)) {
        const slug = slugify(data.name);
        if (slug.length > 0) {
          result.set(`Location:${data.id}`, slug);
        }
      }
    } catch (err) {
      console.warn(
        `[GraphExporter] failed to read location YAML ${file}: ${(err as Error).message}`,
      );
    }
  }

  return result;
}

async function resolveCanonicalSlugsBulk(
  deltas: GraphDelta[],
): Promise<Map<string, string>> {
  const uuidDeltas = deltas.filter(
    (d) => d.op === 'MODIFY' && isUuid(d.nodeId),
  );
  const byType = new Map<string, string[]>();
  for (const d of uuidDeltas) {
    const list = byType.get(d.nodeType) ?? [];
    list.push(d.nodeId);
    byType.set(d.nodeType, list);
  }

  const result = new Map<string, string>();
  for (const [nodeType, ids] of byType) {
    const meta = CANONICAL_NAME_BULK_QUERY[nodeType];
    if (!meta || ids.length === 0) continue;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const query = `SELECT id, ${meta.column} AS name FROM ${meta.table} WHERE id IN (${placeholders})`;
    try {
      const rows = await queryOLTP<{ id: string; name: string }>(query, ids);
      for (const row of rows.rows) {
        const slug = slugify(row.name);
        if (slug.length > 0) result.set(`${nodeType}:${row.id}`, slug);
      }
    } catch (err) {
      console.warn(
        `[GraphExporter] bulk content-store slug lookup failed for ${nodeType}, falling back per-delta:`,
        (err as Error).message,
      );
    }
  }

  // Resolve Location slugs from YAML files (Locations have no DB table)
  const locationIds = byType.get('Location') ?? [];
  if (locationIds.length > 0) {
    const locationSlugs = await resolveLocationSlugs(locationIds);
    for (const [key, slug] of locationSlugs) {
      result.set(key, slug);
    }
  }

  return result;
}

/** Build a plan item for one ADD/MODIFY delta (throws on unsupported node type). */
function buildItemForDelta(delta: GraphDelta, existingSlug?: string): ContentPlanItem {
  const contentType = NODE_TYPE_TO_CONTENT_TYPE[delta.nodeType];
  // 'district' (and any other graph node type) has no valid ContentTypeSchema
  // value, so it must be rejected here rather than failing schema validation
  // with an opaque error later in the approve gate.
  if (!contentType || contentType === 'district') {
    throw new GraphExportError(`Unsupported node type for export: ${delta.nodeType}`);
  }
  const fields: Record<string, unknown> = { ...(delta.fields ?? {}) };
  const name = (typeof fields.name === 'string' && fields.name.length > 0)
    ? fields.name
    : slugify(contentType);
  const slug = typeof fields.slug === 'string' && /^[a-z0-9_]+$/.test(fields.slug)
    ? fields.slug
    : (isUuid(delta.nodeId) ? existingSlug : delta.nodeId);
  const slugifiedName = slugify(name);
  const finalSlug = slug
    ?? (slugifiedName
      || `${slugify(contentType)}_${String(delta.nodeId).replace(/[^a-z0-9_]+/gi, '').toLowerCase()}`);
  const id = delta.op === 'ADD'
    ? (isUuid(delta.nodeId) ? delta.nodeId : freshUuid())
    : freshUuid();

  const item: ContentPlanItem = {
    id,
    type: contentType,
    action: delta.op === 'ADD' ? 'create' : 'update',
    name,
    slug: finalSlug,
    fields,
  } as ContentPlanItem;
  if (delta.op === 'MODIFY') {
    item.entity_id = delta.nodeId;
  }
  return item;
}

type Revision = Awaited<ReturnType<typeof buildMergedRevision>>;

// Build one plan item per ADD/MODIFY delta, and an `itemKey → itemId` index for
// downstream edge resolution. For MODIFY items, preserve the canonical entity's
// existing slug (from the merged node or the bulk-resolved content store) so an
// entity-name edit doesn't retarget a new file path and fail staging with
// "Cannot update non-existent file".
function buildItemsAndIndex(
  deltas: GraphDelta[],
  revision: Revision,
  canonicalSlugByKey: Map<string, string>,
): { items: ContentPlanItem[]; deltaItemId: Map<string, string> } {
  const items: ContentPlanItem[] = [];
  const deltaItemId = new Map<string, string>();
  const existingSlugByKey = new Map<string, string>();
  for (const node of revision.nodes) {
    if (node.fields && typeof node.fields.slug === 'string' && /^[a-z0-9_]+$/.test(node.fields.slug)) {
      existingSlugByKey.set(`${node.nodeType}:${node.nodeId}`, node.fields.slug);
    }
  }

  for (const delta of deltas) {
    if (delta.op !== 'ADD' && delta.op !== 'MODIFY') continue;
    let existingSlug: string | undefined = delta.op === 'MODIFY'
      ? existingSlugByKey.get(`${delta.nodeType}:${delta.nodeId}`)
      : undefined;
    // For UUID-backed MODIFY items the canonical graph seed never stores a `slug`
    // field (only District does), so existingSlugByKey is empty for them. Use the
    // bulk-resolved canonical slug (from the content store) so the slug points at
    // the EXISTING on-disk file and an entity-name edit does not retarget a
    // non-existent path. When NO validated canonical slug is available (content
    // store unreachable, or the entity is missing from it), block the update:
    // falling back to the merged (possibly renamed) name could write to a path the
    // author never intended and orphan the existing file. Blocking surfaces a
    // clear GraphExportError that the orchestrator converts to PlanStatusError.
    if (delta.op === 'MODIFY' && !existingSlug && isUuid(delta.nodeId)) {
      existingSlug = canonicalSlugByKey.get(`${delta.nodeType}:${delta.nodeId}`);
      if (!existingSlug) {
        throw new GraphExportError(
          `Cannot resolve the canonical on-disk slug for ${delta.nodeType} ${delta.nodeId} during export; refusing to retarget a possibly-renamed path. Run resync:graph so the content store and graph agree, then retry.`,
        );
      }
    }
    const item = buildItemForDelta(delta, existingSlug);
    items.push(item);
    deltaItemId.set(`${delta.nodeType}:${delta.nodeId}`, item.id);
  }
  return { items, deltaItemId };
}

// Resolve delta edges → either a direct field write (canonical/modify target,
// using the stable entity identity) or a `ContentLink` (delta→delta target,
// resolved on materialize). Throws `GraphExportError` on any unsupported,
// unmapped, or orphaned edge.
function resolveEdgeLinks(
  deltaEdges: GraphDeltaEdge[],
  deltaItemId: Map<string, string>,
  items: ContentPlanItem[],
  nameLookup: Map<string, string>,
): ContentLink[] {
  const links: ContentLink[] = [];
  for (const edge of deltaEdges) {
    if (UNSUPPORTED_EDGE_TYPES.has(edge.type)) {
      throw new GraphExportError(
        `Edge ${edge.sourceNodeType}>${edge.targetNodeType}:${edge.type} is unsupported for materialization (join table only)`,
      );
    }
    const mapping = findEdgeMapping(edge.type, edge.sourceNodeType, edge.targetNodeType);
    if (!mapping) {
      throw new GraphExportError(
        `Unmapped edge type ${edge.sourceNodeType}>${edge.targetNodeType}:${edge.type}`,
      );
    }

    const sourceKey = `${edge.sourceNodeType}:${edge.sourceNodeId}`;
    const sourceItemId = deltaItemId.get(sourceKey);
    if (!sourceItemId) {
      throw new GraphExportError(`Delta edge source ${sourceKey} has no matching plan item`);
    }
    const sourceItem = items.find((i) => i.id === sourceItemId)!;

    const targetKey = `${edge.targetNodeType}:${edge.targetNodeId}`;
    const targetItemId = deltaItemId.get(targetKey);

    if (targetItemId) {
      const targetItem = items.find((i) => i.id === targetItemId);
      if (targetItem && targetItem.action === 'update') {
        // MODIFY target is an existing canonical entity. Materialize the link as a
        // direct field write using its stable identity (entity_id), NOT the
        // transient plan-item id — otherwise the random item id is written as the
        // foreign key and the relationship is lost.
        const identity = targetItem.entity_id || edge.targetNodeId;
        sourceItem.fields = { ...sourceItem.fields, [mapping.field]: identity };
      } else {
        // delta→delta (both new ADD entities): emit a ContentLink; resolveItem
        // writes the field on materialize.
        links.push({ fromItem: sourceItemId, toItem: targetItemId, field: mapping.field, action: 'set' });
      }
    } else {
      // delta→canonical: write the mapped field value directly into the source item.
      const value = mapping.value === 'name'
        ? (nameLookup.get(targetKey) ?? edge.targetNodeId)
        : edge.targetNodeId;
      sourceItem.fields = { ...sourceItem.fields, [mapping.field]: value };
    }
  }
  return links;
}

/** Build the export payload for one plan. Throws `GraphExportError` on a block. */
export async function exportContentPlan(
  planId: string,
  description: string,
): Promise<ContentPlan> {
  if (!isNeo4jEnabled()) {
    throw new GraphExportError('Neo4j is disabled; graph export is unavailable');
  }

  const revision = await buildMergedRevision(planId);
  const deltas = await getDeltasForPlan(planId);

  // DELETE blocks at approve (materialize pipeline stays untouched).
  const deleteDelta = deltas.find((d) => d.op === 'DELETE');
  if (deleteDelta) {
    throw new GraphExportError(
      'delete materialization not supported; remove the tombstone before approving',
    );
  }

  // Name lookup for edge targets that resolve to a name (e.g. District).
  const nameLookup = new Map<string, string>();
  for (const node of revision.nodes) {
    if (node.name) nameLookup.set(`${node.nodeType}:${node.nodeId}`, node.name);
  }

  // Bulk-resolve canonical slugs for UUID-backed MODIFY deltas up front (one
  // query per content table) so the per-delta loop reuses an index instead of
  // issuing one sequential OLTP round-trip per modified node.
  const canonicalSlugByKey = await resolveCanonicalSlugsBulk(deltas);
  const deltaEdges = await getDeltaEdgesForPlan(planId);
  const { items, deltaItemId } = buildItemsAndIndex(deltas, revision, canonicalSlugByKey);
  const links = resolveEdgeLinks(deltaEdges, deltaItemId, items, nameLookup);

  const plan: ContentPlan = {
    id: planId,
    description,
    items,
    links,
    status: 'proposed',
    // Content-addressed graph revision: derived from the plan's delta set AND
    // delta edges (the exact set this export read), NOT a random UUID. This makes
    // plan_revision a real, detectable revision identity that includes both
    // nodes and relationships — the approve gate re-reads the plan's deltas and
    // edges immediately before persisting plan_json and aborts if they changed,
    // so a concurrent applyDelta/applyDeltaEdge can never leave plan_json pointing
    // at a graph state whose newer deltas/edges commitGraph later promotes.
    _meta: { plan_revision: buildPlanRevisionFromDeltasAndEdges(deltas, deltaEdges) },
  } as ContentPlan;

  // Validate before returning — the materialize pipeline depends on a well-formed plan.
  try {
    return ContentPlanSchema.parse(plan);
  } catch (err) {
    throw new GraphExportError(
      `Exported plan failed schema validation: ${(err as Error).message}`,
    );
  }
}
