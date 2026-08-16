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

/** Build a plan item for one ADD/MODIFY delta (throws on unsupported node type). */
function buildItemForDelta(delta: GraphDelta): ContentPlanItem {
  const contentType = NODE_TYPE_TO_CONTENT_TYPE[delta.nodeType];
  if (!contentType) {
    throw new GraphExportError(`Unsupported node type for export: ${delta.nodeType}`);
  }
  const fields: Record<string, unknown> = { ...(delta.fields ?? {}) };
  const name = (typeof fields.name === 'string' && fields.name.length > 0)
    ? fields.name
    : slugify(contentType);
  const slug = typeof fields.slug === 'string' && /^[a-z0-9_]+$/.test(fields.slug)
    ? fields.slug
    : (isUuid(delta.nodeId) ? undefined : delta.nodeId);
  const finalSlug = slug ?? slugify(name);
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
  const items: ContentPlanItem[] = [];
  const deltaItemId = new Map<string, string>();

  for (const delta of deltas) {
    if (delta.op === 'ADD' || delta.op === 'MODIFY') {
      const item = buildItemForDelta(delta);
      items.push(item);
      deltaItemId.set(`${delta.nodeType}:${delta.nodeId}`, item.id);
    }
  }

  // Resolve delta edges → field writes (canonical target) or ContentLinks (delta target).
  const deltaEdges = await getDeltaEdgesForPlan(planId);
  const links: ContentLink[] = [];

  for (const edge of deltaEdges) {
    const mapping = findEdgeMapping(edge.type, edge.sourceNodeType, edge.targetNodeType);
    if (UNSUPPORTED_EDGE_TYPES.has(edge.type)) {
      throw new GraphExportError(
        `Edge ${edge.sourceNodeType}>${edge.targetNodeType}:${edge.type} is unsupported for materialization (join table only)`,
      );
    }
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
      // delta→delta: emit a ContentLink; resolveItem writes the field on materialize.
      links.push({
        fromItem: sourceItemId,
        toItem: targetItemId,
        field: mapping.field,
        action: 'set',
      });
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
  return ContentPlanSchema.parse(plan);
}
