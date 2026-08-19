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

import type { ContentPlan, ContentPlanItem, ContentLink, ChatMessage, GraphDelta, GraphDeltaEdge } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { uuidv4 } from '@las-flores/shared';
import { createLLMProvider } from './LLMService.js';
import { chatService } from './ChatService.js';
import { applyDelta, applyDeltaEdge, getDeltasForPlan, getDeltaEdgesForPlan, clearDeltasForPlan, preflightDeltas, preflightDeltaEdges } from './GraphDeltaService.js';
import { isNeo4jEnabled, runNeo4jTransaction } from './Neo4jClient.js';
import type { LLMProvider, ExistingContentContext, LLMUsage } from './types/LLMTypes.js';

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

/** Transforms GraphDelta nodes into ContentPlanItem shape for the legacy pipeline. */
function deltaToPlanItem(delta: GraphDelta, baseContext: ExistingContentContext): ContentPlanItem {
  const { nodeType, nodeId, op, fields } = delta;
  
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

/** Transforms GraphDeltaEdge edges into ContentLink shape for the legacy pipeline. */
function deltaEdgeToPlanLink(edge: GraphDeltaEdge): ContentLink {
  const { sourceNodeType, sourceNodeId, targetNodeType, targetNodeId, type } = edge;
  
  // Map graph nodeTypes to content types
  const contentTypeMap: Record<string, string> = {
    Character: 'character',
    Scene: 'scene',
    Dialogue: 'dialogue',
    Mission: 'mission',
    Overlay: 'overlay',
    Location: 'location',
    District: 'district',
  };
  
  // Find the source item by looking through plan items
  // This is a placeholder - actual resolution happens in stagePlan
  return {
    fromItem: sourceNodeId,
    toItem: targetNodeId,
    field: '', // Will be resolved by applyLink
    action: 'add',
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
  const links = edges.map(e => deltaEdgeToPlanLink(e));
  
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
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider || createLLMProvider();
  }

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

    // Step 1: Gather existing content context
    const context = await this.gatherContext();

    // Step 2: Call chatPropose to generate structured deltas + edges
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: description,
      },
      ...initialMessages,
    ];

    const { deltas, deltaEdges, usage } = await chatService.propose(
      '', // planId is empty for new plans (will be created)
      messages,
      context,
    );

    // Step 3: Validate we got deltas back
    if (!deltas || deltas.length === 0) {
      throw new GraphIntakeValidationError('chatPropose returned no deltas for the description');
    }

    // Step 4: Generate a new planId
    const planId = uuidv4();
    const timestamp = new Date().toISOString();

    // Step 5: Create the plan row in OLTP (minimal metadata; no plan_json)
    await queryOLTP(
      `INSERT INTO content_plans (id, description, status, created_at, updated_at)
       VALUES ($1, $2, 'draft', $3, $3)`,
      [planId, description, timestamp],
    );

    // Step 6: Write all deltas and edges to Neo4j in a single transaction
    // Assign the new planId to all deltas/edges
    const planDeltas = deltas.map(d => ({ ...d, planId }));
    const planEdges = deltaEdges.map(e => ({ ...e, planId }));

    await runNeo4jTransaction(async (tx) => {
      // Preflight validation before any writes
      await preflightDeltas(planDeltas, tx);
      await preflightDeltaEdges(planEdges, tx);

      // Write all deltas
      for (const delta of planDeltas) {
        await applyDelta(delta, tx);
      }

      // Write all edges
      for (const edge of planEdges) {
        await applyDeltaEdge(edge, tx);
      }
    });

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
    return this.provider.gatherContext();
  }
}

/** Singleton export for route handlers. */
export const graphIntakeService = new GraphIntakeService();
