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
  NODE_TYPE_TO_CONTENT_TYPE,
  findEdgeMapping,
  UNSUPPORTED_EDGE_TYPES,
} from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { isNeo4jEnabled } from './Neo4jClient.js';
import {
  getDeltasForPlan,
  getDeltaEdgesForPlan,
} from './GraphDeltaService.js';
import { buildMergedRevision } from './GraphMerger.js';

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

// Resolve the canonical on-disk slug for a UUID-backed content entity by reading
// its canonical name from the migrated OLTP content store. None of the
// character/scene/dialogue/overlay/mystery tables carry a `slug` column (they
// store `name`/`title` only — confirmed via server/src/database/migrations); the
// on-disk directory slug is exactly `slugify(name|title)`, so we derive it from
// the canonical name. Locations have no DB table (they live only in content YAML
// under districts/*/locations/*), so callers must pass a fallback slug.
//
// A content-store failure must never abort the whole export (graph-less dev,
// transient DB blip): on any error we log a warning and return undefined so the
// caller falls back to the existing slug-derivation logic.
const CANONICAL_NAME_QUERY: Partial<Record<string, string>> = {
  Character: 'SELECT name FROM characters WHERE id = $1',
  Scene: 'SELECT name FROM scenes WHERE id = $1',
  Dialogue: 'SELECT name FROM dialogue_trees WHERE id = $1',
  Overlay: 'SELECT name FROM dialogue_overlays WHERE id = $1',
  Mission: 'SELECT title AS name FROM mysteries WHERE id = $1',
};

async function resolveCanonicalSlugFromStore(
  nodeType: string,
  nodeId: string,
): Promise<string | undefined> {
  const query = CANONICAL_NAME_QUERY[nodeType];
  if (!query) return undefined; // Location, District — no DB table slug source
  try {
    const result = await queryOLTP<{ name: string }>(query, [nodeId]);
    const name = result.rows[0]?.name;
    if (!name) return undefined;
    const slug = slugify(name);
    return slug.length > 0 ? slug : undefined;
  } catch (err) {
    console.warn(
      `[GraphExporter] content-store slug lookup failed for ${nodeType}:${nodeId}, falling back to merged name:`,
      (err as Error).message,
    );
    return undefined;
  }
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

  // Build an item per ADD/MODIFY delta. Map key → item id for edge resolution.
  // For MODIFY items, preserve the canonical entity's existing slug (when the
  // merged node stores one) so an entity-name edit doesn't retarget a new file
  // path and fail staging with "Cannot update non-existent file".
  const items: ContentPlanItem[] = [];
  const deltaItemId = new Map<string, string>();
  const existingSlugByKey = new Map<string, string>();
  for (const node of revision.nodes) {
    if (node.fields && typeof node.fields.slug === 'string' && /^[a-z0-9_]+$/.test(node.fields.slug)) {
      existingSlugByKey.set(`${node.nodeType}:${node.nodeId}`, node.fields.slug);
    }
  }

  for (const delta of deltas) {
    if (delta.op === 'ADD' || delta.op === 'MODIFY') {
      let existingSlug: string | undefined = delta.op === 'MODIFY'
        ? existingSlugByKey.get(`${delta.nodeType}:${delta.nodeId}`)
        : undefined;
      // For UUID-backed MODIFY items the canonical graph seed never stores a
      // `slug` field (only District does), so existingSlugByKey is empty and the
      // item would otherwise fall through to the (possibly renamed) merged name
      // and retarget a non-existent file path. Resolve the canonical slug from
      // the content store so the slug points at the EXISTING on-disk file.
      if (delta.op === 'MODIFY' && !existingSlug && isUuid(delta.nodeId)) {
        existingSlug = await resolveCanonicalSlugFromStore(delta.nodeType, delta.nodeId);
        // Fallback (Location has no DB table; or a transient store error): use
        // the merged node's existing name from the revision as the canonical slug
        // hint. This keeps behavior no worse than before for those edge cases.
        if (!existingSlug) {
          const merged = revision.nodes.find(
            (n) => n.nodeType === delta.nodeType && n.nodeId === delta.nodeId && n.name,
          );
          if (merged) existingSlug = slugify(merged.name!);
        }
      }
      const item = buildItemForDelta(delta, existingSlug);
      items.push(item);
      deltaItemId.set(`${delta.nodeType}:${delta.nodeId}`, item.id);
    }
  }

  // Resolve delta edges → field writes (canonical target) or ContentLinks (delta target).
  const deltaEdges = await getDeltaEdgesForPlan(planId);
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
      throw new GraphExportError(
        `Delta edge source ${sourceKey} has no matching plan item`,
      );
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
        links.push({
          fromItem: sourceItemId,
          toItem: targetItemId,
          field: mapping.field,
          action: 'set',
        });
      }
    } else {
      // delta→canonical: write the mapped field value directly into the source item.
      const value = mapping.value === 'name'
        ? (nameLookup.get(targetKey) ?? edge.targetNodeId)
        : edge.targetNodeId;
      sourceItem.fields = { ...sourceItem.fields, [mapping.field]: value };
    }
  }

  const plan: ContentPlan = {
    id: planId,
    description,
    items,
    links,
    status: 'proposed',
    _meta: { plan_revision: freshUuid() },
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
