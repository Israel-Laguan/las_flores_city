import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContentPlan, ContentPlanItem, AssetNeed, GraphDelta, GraphDeltaEdge } from '@las-flores/shared';
import { generateYaml, resolveFilePath } from './ContentSkeletonGenerator.js';
import { validateContent } from '../content/validate.js';
import { migrateContent } from '../content/migrate.js';
import {
  writePlanItems,
  rollbackFiles,
  collectAssetTasks,
  topologicalSort,
  applyLink,
} from './StoryBuilderFileWriter.js';
import { buildValidationErrors } from './StoryBuilderValidation.js';
import { resolveContentDir, generateLoreStubs } from './StoryBuilderLore.js';
import { generatePromptFiles } from './PromptFileGenerator.js';
import { applyDelta, applyDeltaEdge, preflightDeltas, preflightDeltaEdges } from './GraphDeltaService.js';
import { isNeo4jEnabled, runNeo4jTransaction } from './Neo4jClient.js';
import { uuidv4, CONTENT_TYPE_TO_NODE_TYPE } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext } from './types/LLMTypes.js';
import { buildFillFieldsPrompt } from './LLMPrompts.js';

export interface ExecutionResult {
  success: boolean;
  createdFiles: string[];
  updatedFiles: string[];
  validationErrors: string[];
  warnings: string[];
  migrationResult: any;
  assetTasks: Array<{ item: ContentPlanItem; needs: AssetNeed[] }>;
  error?: string;
}

export interface PreviewResult {
  items: Array<{
    name: string;
    type: string;
    action: string;
    filePath: string;
    yamlPreview: string;
    existingYaml?: string;
    isNew: boolean;
  }>;
  links: Array<{
    fromItem: string;
    toItem: string;
    field: string;
    action: string;
  }>;
}

export interface StagingResult {
  success: boolean;
  createdFiles: string[];
  updatedFiles: string[];
  validationErrors: string[];
  warnings: string[];
  loreFiles?: string[];
  promptFiles?: string[];
  itemResults?: Array<{
    itemId: string;
    name: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
    filePath?: string;
  }>;
  error?: string;
}

export async function executePlan(plan: ContentPlan): Promise<ExecutionResult> {
  const createdFiles: string[] = [];
  const updatedFiles: string[] = [];
  const fileSnapshots = new Map<string, string | null>(); // fullPath -> original content (null for created)
  const contentDir = resolveContentDir();

  try {
    const { sorted: sortedItems, missingDeps } = topologicalSort(plan.items);

    const itemResults = await writePlanItems(sortedItems, contentDir, createdFiles, updatedFiles, fileSnapshots);

    // If any items failed, roll back and report
    const failedItems = itemResults.filter(r => r.status === 'failed');
    if (failedItems.length > 0) {
      await rollbackFiles(fileSnapshots);
      return {
        success: false,
        createdFiles,
        updatedFiles,
        validationErrors: [],
        warnings: [],
        migrationResult: null,
        assetTasks: [],
        error: failedItems.map(r => `${r.name}: ${r.error}`).join('; '),
      };
    }

    for (const link of plan.links) {
      await applyLink(link, plan.items, contentDir, fileSnapshots);
    }

    const validationResult = await validateContent(contentDir);
    const depErrors = missingDeps.map(d =>
      `Item "${d.itemName}" (${d.itemId}) references missing dependency: ${d.missingDepId}`
    );

    if (!validationResult.valid) {
      await rollbackFiles(fileSnapshots);
      return {
        success: false,
        createdFiles,
        updatedFiles,
        validationErrors: buildValidationErrors(validationResult.errors, depErrors),
        warnings: depErrors,
        migrationResult: null,
        assetTasks: [],
      };
    }

    // Include missing dep warnings in success path (non-blocking)
    if (depErrors.length > 0) {
      console.warn('[story-builder] Missing dependencies:', depErrors);
    }

    const migrationResult = await migrateContent(contentDir);
    if (!migrationResult.success) {
      return {
        success: false,
        createdFiles,
        updatedFiles,
        validationErrors: migrationResult.errors,
        warnings: depErrors,
        migrationResult,
        assetTasks: [],
        error: migrationResult.errors[0] ?? 'Migration failed',
      };
    }
    const assetTasks = collectAssetTasks(plan.items);

    return {
      success: true,
      createdFiles,
      updatedFiles,
      validationErrors: [],
      warnings: depErrors,
      migrationResult,
      assetTasks,
    };
  } catch (error: any) {
    await rollbackFiles(fileSnapshots);
    return {
      success: false,
      createdFiles,
      updatedFiles,
      validationErrors: [],
      warnings: [],
      migrationResult: null,
      assetTasks: [],
      error: error.message,
    };
  }
}

export async function previewPlan(plan: ContentPlan): Promise<PreviewResult> {
  const contentDir = resolveContentDir();
  const { sorted: items } = topologicalSort(plan.items);

  const previewItems: PreviewResult['items'] = [];

  for (const item of items) {
    const yamlStr = generateYaml(item);
    const filePath = resolveFilePath(item);
    const fullPath = path.join(contentDir, filePath);

    let existingYaml: string | undefined;
    let isNew = true;

    try {
      await fs.access(fullPath);
      existingYaml = await fs.readFile(fullPath, 'utf-8');
      isNew = false;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist — new file
      } else {
        throw new Error(`Cannot read existing file ${filePath}: ${err.message}`);
      }
    }

    previewItems.push({
      name: item.name,
      type: item.type,
      action: item.action,
      filePath,
      yamlPreview: yamlStr,
      existingYaml,
      isNew,
    });
  }

  return {
    items: previewItems,
    links: plan.links,
  };
}

/**
 * Returns a list of human-readable conflict errors for any `create` item whose
 * target file already exists on disk. `create` must never overwrite a file.
 */
export async function checkCreateConflicts(plan: ContentPlan, contentDir: string): Promise<string[]> {
  const errors: string[] = [];
  for (const item of plan.items) {
    if (item.action !== 'create') continue;
    const filePath = resolveFilePath(item);
    const fullPath = path.join(contentDir, filePath);
    try {
      await fs.access(fullPath);
      errors.push(`Item "${item.name}" (${item.type}:${item.slug}) targets existing file: ${filePath}`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        errors.push(`Cannot stat target for "${item.name}" (${item.type}:${item.slug}): ${err.message}`);
      }
    }
  }
  return errors;
}

export interface StagePlanOptions {
  provider?: LLMProvider;
  context?: ExistingContentContext;
  /** When provided, emit MODIFY deltas to Neo4j for filled fields and generated lore. */
  planId?: string;
}

/**
 * Create a MODIFY GraphDelta for an existing entity with changed fields.
 * Used by fillPlanItemsWithLLM and lore generation to emit deltas to the graph.
 *
 * The `fields` on a MODIFY delta must be the FULL post-approve field set
 * (a shadow copy of the canon node), not just the changed fields — otherwise
 * the materialize pipeline would erase unchanged fields (including name)
 * when applying the delta. We merge the changed fields onto the item's
 * existing fields to produce the complete set.
 */
function createModifyDelta(
  planId: string,
  item: ContentPlanItem,
  nodeId: string,
  changedFields: Record<string, any>,
): GraphDelta | null {
  const mergedFields: Record<string, any> = { ...(item.fields || {}) };
  for (const [key, value] of Object.entries(changedFields)) {
    if (!key.includes('.')) { mergedFields[key] = value; continue; }
    const parts = key.split('.');
    let target = mergedFields;
    for (const part of parts.slice(0, -1)) target = (target[part] && typeof target[part] === 'object') ? target[part] : (target[part] = {});
    target[parts[parts.length - 1]] = value;
  }
  // Only content types that map to a graph node type can be modified in the
  // graph. ContentTypeSchema includes types (gig, vault, story, shop_item,
  // map_tile, story_beat) with no corresponding GraphNodeType; emitting a
  // MODIFY delta for those would fail GraphDeltaSchema.parse downstream.
  // Guard here and return null so the caller can skip silently-but-explicitly.
  const nodeType = CONTENT_TYPE_TO_NODE_TYPE[item.type];
  if (!nodeType) {
    console.warn(
      `[story-builder] Skipping MODIFY delta for ${item.name}: no graph node type mapped for content type '${item.type}'`,
    );
    return null;
  }
  return {
    id: uuidv4(),
    planId,
    nodeType: nodeType as GraphDelta['nodeType'],
    nodeId,
    op: 'MODIFY',
    // Merge changed fields onto the item's complete field set so unchanged
    // fields (name, description, etc.) are preserved in the shadow node.
    fields: mergedFields,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Emit MODIFY deltas for filled fields to Neo4j.
 * Only emits when Neo4j is enabled and planId is provided.
 *
 * New (ADD) items — those without a stable entity_id — are skipped here
 * because their canonical :Content node does not exist in Neo4j yet (it is
 * created at graph commit / materialize time). Emitting a MODIFY for them
 * would be rejected by the canonical-node preflight. Instead, the filled
 * fields are merged into the item in-memory (done by the caller) so they
 * flow to the graph as part of the ADD delta when the plan is staged.
 *
 * All deltas for a single staging pass are emitted in ONE Neo4j transaction.
 * If any delta fails preflight/apply the whole batch is rolled back, and the
 * plan's existing fill deltas are cleared so a partial graph state can never
 * be left behind when staging aborts.
 */
async function emitFillDeltas(
  planId: string,
  items: Array<{ item: ContentPlanItem; filledFields: Record<string, string> }>,
): Promise<void> {
  if (!isNeo4jEnabled() || !planId || items.length === 0) return;

  // Build a MODIFY delta for each filled item. New (ADD) items have no
  // entity_id yet — skip delta emission for them (the filled fields are merged
  // into the item in-memory by the caller and flow to the graph as part of the
  // ADD delta at stage time). Resolve the stable canonical node identity from
  // entity_id, falling back to fields.id (a persisted entity UUID).
  const deltas: GraphDelta[] = [];
  for (const { item, filledFields } of items) {
    const nodeId = item.entity_id ?? (item.fields as any)?.id;
    if (!nodeId) continue;
    const delta = createModifyDelta(planId, item, nodeId, filledFields);
    if (!delta) continue;
    deltas.push(delta);
  }

  if (deltas.length === 0) return;

  try {
    await runNeo4jTransaction(async (tx) => {
      await preflightDeltas(deltas, tx);
      for (const delta of deltas) {
        await applyDelta(delta, tx);
      }
    });
  } catch (err: any) {
    // The managed Neo4j transaction already rolls back every write from this
    // batch, so there is no partial graph state to clean up. Do NOT call
    // clearDeltasForPlan here: that would delete the plan's pre-existing deltas
    // (from earlier successful staging passes), losing the original plan on a
    // retry or approval after a transient fill-delta failure.
    throw new Error(`Failed to emit MODIFY deltas for filled fields on plan ${planId}: ${err.message}`, { cause: err });
  }
}

/**
 * Emit a MODIFY delta for lore content to Neo4j.
 * Lore is stored in fields like lore_path, narrative_path, or as a lore_content field.
 */
export async function emitLoreDelta(
  planId: string,
  item: ContentPlanItem,
  loreContent: string,
  fieldName: string = 'lore_content',
): Promise<void> {
  if (!isNeo4jEnabled() || !planId) return;

  // New (ADD) items have no canonical node yet — skip delta emission.
  if (!item.entity_id) return;

  // Resolve the stable canonical node identity from entity_id, falling back
  // to fields.id (a persisted entity UUID) before the transient item.id.
  const nodeId = item.entity_id ?? (item.fields as any)?.id;
  if (!nodeId) return;

  const delta = createModifyDelta(planId, item, nodeId, { [fieldName]: loreContent });
  if (!delta) return;

  try {
    await runNeo4jTransaction(async (tx) => {
      await preflightDeltas([delta], tx);
      await applyDelta(delta, tx);
    });
  } catch (err: any) {
    throw new Error(`Failed to emit MODIFY delta for lore on ${item.name} (${item.type}:${nodeId}): ${err.message}`, { cause: err });
  }
}

export async function stagePlan(plan: ContentPlan, options?: StagePlanOptions): Promise<StagingResult> {
  const createdFiles: string[] = [];
  const updatedFiles: string[] = [];
  const fileSnapshots = new Map<string, string | null>();
  const contentDir = resolveContentDir();
  const isScaffolded = !!plan._meta?.scaffolded_at;
  // Template replays (scoped template plans) are allowed to overwrite their own
  // target files in place, so the create-conflict gate does not apply to them.
  // Conflict detection for non-template plans is unchanged.
  const isTemplateReplay = !!plan._meta?.template_replay;

  try {
    if (!isScaffolded && !isTemplateReplay) {
      const conflicts = await checkCreateConflicts(plan, contentDir);
      if (conflicts.length > 0) {
        return {
          success: false,
          createdFiles,
          updatedFiles,
          validationErrors: conflicts,
          warnings: [],
          itemResults: [],
          error: `Refusing to stage: ${conflicts.length} 'create' item(s) target an existing file`,
        };
      }
    }

    const { sorted: sortedItems } = topologicalSort(plan.items);

    await fillPlanItemsWithLLM(sortedItems, options);

    let itemResults: Array<{ itemId: string; name: string; status: 'success' | 'failed' | 'skipped'; error?: string; filePath?: string }> = [];

    if (!isScaffolded) {
      const writeResults = await writePlanItems(sortedItems, contentDir, createdFiles, updatedFiles, fileSnapshots);
      itemResults = writeResults;

      const failedItems = itemResults.filter(r => r.status === 'failed');
      if (failedItems.length > 0) {
        await rollbackFiles(fileSnapshots);
        return {
          success: false,
          createdFiles,
          updatedFiles,
          validationErrors: [],
          warnings: [],
          itemResults,
          error: `${failedItems.length} item(s) failed`,
        };
      }
    } else {
      itemResults = sortedItems.map(item => ({
        itemId: item.id,
        name: item.name,
        status: 'skipped' as const,
        filePath: undefined,
      }));
    }

    for (const link of plan.links) {
      await applyLink(link, plan.items, contentDir, fileSnapshots);
    }

    const validationResult = await validateContent(contentDir);

    if (!validationResult.valid) {
      if (!isScaffolded) {
        await rollbackFiles(fileSnapshots);
      }
      return {
        success: false,
        createdFiles,
        updatedFiles,
        validationErrors: validationResult.errors
          .filter(e => e.severity === 'error')
          .map(e => `${e.file ?? ''}: ${e.message}`),
        warnings: validationResult.warnings,
        itemResults,
      };
    }

    return {
      success: true,
      createdFiles,
      updatedFiles,
      validationErrors: [],
      warnings: validationResult.warnings,
      loreFiles: await generateLoreStubs(sortedItems, contentDir, fileSnapshots),
      promptFiles: await generatePromptFiles(sortedItems, contentDir, fileSnapshots),
      itemResults,
    };
  } catch (error: any) {
    if (!isScaffolded) {
      await rollbackFiles(fileSnapshots);
    }
    return {
      success: false,
      createdFiles,
      updatedFiles,
      validationErrors: [],
      warnings: [],
      error: error.message,
    };
  }
}

/**
 * Fill free-text fields via LLM for each plan item (non-fatal on error).
 * Shared by stagePlan for both scaffolded and non-scaffolded plans.
 * When planId is provided and Neo4j is enabled, emits MODIFY deltas for filled fields.
 */
async function fillPlanItemsWithLLM(
  sortedItems: ContentPlanItem[],
  options?: StagePlanOptions,
): Promise<void> {
  if (!options?.provider || !options?.context) return;

  const planId = options.planId;

  // Collect (item, filledFields) pairs so all MODIFY fill deltas are emitted in
  // a single Neo4j transaction after the loop. Emitting per-item would commit
  // deltas incrementally; a later item's failure would then leave partial graph
  // state while staging aborts.
  const fillDeltaPairs: Array<{ item: ContentPlanItem; filledFields: Record<string, string> }> = [];

  // Inlined fill logic (formerly in ContentFillService.fillFields)
  const FILL_TARGETS: Record<string, string[]> = {
    character: [
      'description', 'title',
      'physical_description', 'psychological_description',
      'metadata.faction', 'metadata.age', 'metadata.gender', 'metadata.ethnicity',
      'metadata.occupation', 'metadata.background', 'metadata.education',
      'metadata.residence', 'metadata.organization', 'metadata.allies',
      'metadata.mannerisms', 'metadata.motivations', 'metadata.quote',
      'metadata.methods', 'metadata.status', 'metadata.location',
      'metadata.personality',
    ],
    scene: ['description', 'mood'],
    location: ['description', 'history', 'daytime', 'nightlife', 'conclusion'],
    dialogue: ['description'],
    mission: ['description'],
    overlay: ['description'],
    vault: ['description'],
    gig: ['description', 'reward'],
    shop_item: ['description'],
    story: ['description', 'title'],
    story_beat: ['description'],
  };

  function getNestedField(obj: any, path: string): any {
    return path.split('.').reduce((o: any, k: string) => o?.[k], obj);
  }

  function setNestedField(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || current[part] === null || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
  }

  for (const item of sortedItems) {
    let emittedFields: Record<string, string> | null = null;
    try {
      const targets = FILL_TARGETS[item.type];
      if (!targets || targets.length === 0) continue;

      // Only fill fields that are still TODO or empty
      const unfilled = targets.filter(f => {
        const val = getNestedField(item.fields, f);
        return !val || val === '' || (typeof val === 'string' && val.startsWith('TODO'));
      });

      if (unfilled.length === 0) continue;

      const prompt = buildFillFieldsPrompt(item, unfilled, options.context);
      const response = await options.provider.generateFill(prompt);

      // Validate: only accept values for the target fields we asked for
      const filteredFields: Record<string, string> = {};
      if (response?.fields) {
        for (const key of unfilled) {
          if (key in response.fields && typeof response.fields[key] === 'string') {
            filteredFields[key] = response.fields[key];
          }
        }
      }

      if (Object.keys(filteredFields).length > 0) {
        // Inlined merge logic (formerly in ContentFillService.mergeFilledFields)
        const filledPaths = new Set(item.filled_fields ?? []);
        for (const [path, value] of Object.entries(filteredFields)) {
          const current = getNestedField(item.fields, path);
          // Only override if the current value is TODO or empty
          if (!current || current === '' || (typeof current === 'string' && current.startsWith('TODO'))) {
            setNestedField(item.fields, path, value);
            filledPaths.add(path);
          }
        }
        item.filled_fields = Array.from(filledPaths);
        emittedFields = filteredFields;
      }
      if (response?.lore_refs && response.lore_refs.length > 0) {
        const existing = item.lore_refs ?? [];
        item.lore_refs = Array.from(new Set([...existing, ...response.lore_refs]));
      }
    } catch (err: any) {
      console.warn(`[story-builder] LLM fill failed for ${item.name}: ${err.message}`);
    }

    // Collect the (item, filledFields) pair for batched delta emission below.
    // emitFillDeltas no-ops for new items without a canonical node.
    if (planId && emittedFields) {
      fillDeltaPairs.push({ item, filledFields: emittedFields });
    }
  }

  // Emit all fill deltas in ONE Neo4j transaction OUTSIDE the per-item LLM-error
  // catch so a graph delta emission failure propagates and aborts staging
  // instead of being downgraded to a warning (which would let staging write
  // content files without the required graph deltas). On failure the whole
  // batch is rolled back and the plan's existing fill deltas are cleared, so no
  // partial graph state is left behind.
  if (planId && fillDeltaPairs.length > 0) {
    await emitFillDeltas(planId, fillDeltaPairs);
  }
}
