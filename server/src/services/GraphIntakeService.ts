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
//   3. Persist plan row to OLTP (content_plans) with status='draft'
//   4. Write all deltas/edges to Neo4j via GraphDeltaService
//   5. Return the planId + delta/edge counts
//
// The returned ContentPlan is synthesized from the deltas so the
// legacy materialize pipeline (stagePlan → migrateContent → verifyPlan)
// can still consume it via the exporter (GraphExporter).
// ============================================================

import {
  type ContentPlan,
  type ContentPlanItem,
  type ContentLink,
  type ChatMessage,
  type GraphDelta,
  type GraphDeltaEdge,
  findEdgeMapping,
} from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { uuidv4 } from '@las-flores/shared';
import { chatService } from './ChatService.js';
import { contentPlanService } from './ContentPlanService.js';
import { applyDelta, applyDeltaEdge, getDeltasForPlan, getDeltaEdgesForPlan, clearDeltasForPlan, preflightDeltas, preflightDeltaEdges, normalizeKeyComponent } from './GraphDeltaService.js';
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
function deltaToPlanItem(delta: GraphDelta, baseContext: ExistingContentContext): ContentPlanItem {
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

  // Merge delta fields onto base entity fields (MODIFY) or use delta fields directly (ADD)
  const mergedFields = baseEntity
    ? { ...baseEntity, ...fields }
    : { ...fields };

  return {
    id: delta.id,
    name: mergedFields.name ?? nodeId,
    type,
    slug: mergedFields.slug ?? nodeId,
    action: op === 'ADD' ? 'create' : 'update',
    fields: mergedFields,
    dependsOn: [],
    assetNeeds: [],
  };
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

/** Transforms GraphDeltaEdge edges into ContentLink shape for the legacy pipeline.
 *
 * Resolves both `fromItem` and `toItem` through the plan-item index (mapping
 * `(nodeType, nodeId)` → `item.id`), because graph node IDs are NOT the
 * generated plan-item IDs. The `field` is resolved via `findEdgeMapping` from
 * the shared schema. Unsupported edges are rejected rather than materialized
 * with a fabricated legacy field. */
function deltaEdgeToPlanLink(
  edge: GraphDeltaEdge,
  itemIndex: Map<string, string>,
): ContentLink {
  const { sourceNodeType, sourceNodeId, targetNodeType, targetNodeId, type } = edge;

  const sourceKey = `${sourceNodeType}:${normalizeKeyComponent(sourceNodeId)}`;
  const targetKey = `${targetNodeType}:${normalizeKeyComponent(targetNodeId)}`;

  const mapping = findEdgeMapping(type, sourceNodeType, targetNodeType);
  const fromItem = itemIndex.get(sourceKey);
  const toItem = itemIndex.get(targetKey);
  if (!mapping || !fromItem || !toItem) {
    throw new GraphIntakeValidationError(
      `Unsupported graph edge ${type}: both endpoints must be present in the synthesized plan`,
    );
  }

  return {
    fromItem,
    toItem,
    field: mapping?.field ?? type.toLowerCase(),
    action: 'set',
  };
}

/** Synthesize a ContentPlan from deltas+edges for compatibility with the legacy pipeline. */
function synthesizePlanFromDeltas(
  planId: string,
  description: string,
  deltas: GraphDelta[],
  edges: GraphDeltaEdge[],
  context: ExistingContentContext,
): ContentPlan {
  const items = deltas.map(d => deltaToPlanItem(d, context));

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

  const links = edges.map(e => deltaEdgeToPlanLink(e, itemIndex));

  return {
    id: planId,
    description,
    status: 'draft',
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
   *   2. Creates a content_plans row with status='draft'
   *   3. Writes all deltas and edges to Neo4j (the authoring canvas)
   *   4. Returns the planId + counts
   *
   * This is the M32 replacement for ContentPlanService.parseDescription → plan_json.
   * The legacy plan_json is NOT populated; the deltas live in Neo4j and the plan
   * row is minimal (id, description, status, metadata).
   */
  async createPlanFromDescription(
    description: string,
    initialMessages: ChatMessage[] = [],
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
    const timestamp = new Date().toISOString();

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

    // Step 4: Validate we got deltas back
    if (!deltas || deltas.length === 0) {
      throw new GraphIntakeValidationError('chatPropose returned no deltas for the description');
    }
    const deleteDelta = deltas.find((delta) => delta.op === 'DELETE');
    if (deleteDelta) {
      throw new GraphIntakeValidationError(`Cannot synthesize a plan item from a DELETE delta for [${deleteDelta.nodeType}:${deleteDelta.nodeId}] — delete materialization is not supported by the legacy plan contract. Remove the tombstone before approving.`);
    }

    // Step 5: Create the plan row in OLTP (minimal metadata). plan_json is the
    // exporter transport and is synthesized on demand by synthesizeLegacyPlan,
    // so it starts as an empty object until a preview/approval populates it.
    await queryOLTP(
      `INSERT INTO content_plans (id, description, status, plan_json, created_at, updated_at)
       VALUES ($1, $2, 'draft', '{}'::jsonb, $3, $3)`,
      [planId, description, timestamp],
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
      // Clean up the orphaned OLTP plan row so we never leave a 'draft' plan
      // with no corresponding graph deltas.
      try {
        await queryOLTP('DELETE FROM content_plans WHERE id = $1', [planId]);
      } catch (cleanupErr: any) {
        console.error(`[graph-intake] Failed to clean up orphaned plan ${planId} after graph failure:`, cleanupErr.message);
      }
      throw graphErr;
    }

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

    return synthesizePlanFromDeltas(planId, description, deltas, edges, context);
  }

  /** Gather existing content context (shared with ContentPlanService). */
  private async gatherContext(): Promise<ExistingContentContext> {
    return contentPlanService.gatherContext();
  }
}

/** Singleton export for route handlers. */
export const graphIntakeService = new GraphIntakeService();
