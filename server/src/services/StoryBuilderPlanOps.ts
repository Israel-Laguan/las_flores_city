import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContentPlan, ContentPlanItem, AssetNeed } from '@las-flores/shared';
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
}

export async function stagePlan(plan: ContentPlan, options?: StagePlanOptions): Promise<StagingResult> {
  const createdFiles: string[] = [];
  const updatedFiles: string[] = [];
  const fileSnapshots = new Map<string, string | null>();
  const contentDir = resolveContentDir();

  try {
    // Hard error: a `create` action must not clobber an existing file. Catch
    // this before writing anything so the failure is explicit rather than a
    // silent overwrite.
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

    const { sorted: sortedItems } = topologicalSort(plan.items);

    // Fill free-text fields via LLM (non-fatal on error)
    if (options?.provider && options?.context) {
      for (const item of sortedItems) {
        try {
          const fillResult = await fillFields(item, options.context, options.provider);
          if (Object.keys(fillResult.fields).length > 0) {
            mergeFilledFields(item, fillResult.fields);
          }
          if (fillResult.lore_refs) {
            item.lore_refs = fillResult.lore_refs;
          }
        } catch (err: any) {
          console.warn(`[story-builder] LLM fill failed for ${item.name}: ${err.message}`);
        }
      }
    }

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
        itemResults,
        error: `${failedItems.length} item(s) failed`,
      };
    }

    for (const link of plan.links) {
      await applyLink(link, plan.items, contentDir, fileSnapshots);
    }

    const validationResult = await validateContent(contentDir);

    if (!validationResult.valid) {
      await rollbackFiles(fileSnapshots);
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
    await rollbackFiles(fileSnapshots);
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
