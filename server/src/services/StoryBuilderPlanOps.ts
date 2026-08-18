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
import { fillFields, mergeFilledFields } from './ContentFillService.js';
import { applyDelta, applyDeltaEdge, preflightDeltas, preflightDeltaEdges } from './GraphDeltaService.js';
import { isNeo4jEnabled, runNeo4jTransaction } from './Neo4jClient.js';
import { uuidv4 } from './ContentPlanValidation.js';
import { CONTENT_TYPE_TO_NODE_TYPE } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext } from './types/LLMTypes.js';

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
 */
function createModifyDelta(
  planId: string,
  item: ContentPlanItem,
  nodeId: string,
  changedFields: Record<string, any>,
): GraphDelta {
  return {
    id: uuidv4(),
    planId,
    nodeType: CONTENT_TYPE_TO_NODE_TYPE[item.type] ?? item.type,
    nodeId,
    op: 'MODIFY',
    fields: changedFields,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Emit MODIFY deltas for filled fields to Neo4j.
 * Only emits when Neo4j is enabled and planId is provided.
 */
async function emitFillDeltas(
  planId: string,
  item: ContentPlanItem,
  filledFields: Record<string, string>,
): Promise<void> {
  if (!isNeo4jEnabled() || !planId) return;

  // Look up the entity's nodeId from its fields (id field) or use the item id
  const nodeId = (item.fields as any).id ?? item.id;
  if (!nodeId) return;

  const delta = createModifyDelta(planId, item, nodeId, filledFields);

  try {
    await runNeo4jTransaction(async (tx) => {
      await preflightDeltas([delta], tx);
      await applyDelta(delta, tx);
    });
  } catch (err: any) {
    console.warn(`[story-builder] Failed to emit MODIFY delta for filled fields on ${item.name} (${item.type}:${nodeId}): ${err.message}`);
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

  const nodeId = (item.fields as any).id ?? item.id;
  if (!nodeId) return;

  const delta = createModifyDelta(planId, item, nodeId, { [fieldName]: loreContent });

  try {
    await runNeo4jTransaction(async (tx) => {
      await preflightDeltas([delta], tx);
      await applyDelta(delta, tx);
    });
  } catch (err: any) {
    console.warn(`[story-builder] Failed to emit MODIFY delta for lore on ${item.name} (${item.type}:${nodeId}): ${err.message}`);
  }
}

export async function stagePlan(plan: ContentPlan, options?: StagePlanOptions): Promise<StagingResult> {
  const createdFiles: string[] = [];
  const updatedFiles: string[] = [];
  const fileSnapshots = new Map<string, string | null>();
  const contentDir = resolveContentDir();
  const isScaffolded = !!plan._meta?.scaffolded_at;

  try {
    if (!isScaffolded) {
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

  for (const item of sortedItems) {
    try {
      const fillResult = await fillFields(item, options.context, options.provider);
      if (Object.keys(fillResult.fields).length > 0) {
        mergeFilledFields(item, fillResult.fields);
        // Emit MODIFY delta for filled fields
        if (planId) {
          await emitFillDeltas(planId, item, fillResult.fields);
        }
      }
      if (fillResult.lore_refs && fillResult.lore_refs.length > 0) {
        const existing = item.lore_refs ?? [];
        item.lore_refs = Array.from(new Set([...existing, ...fillResult.lore_refs]));
      }
    } catch (err: any) {
      console.warn(`[story-builder] LLM fill failed for ${item.name}: ${err.message}`);
    }
  }
}
