import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContentPlan, ContentPlanItem, AssetNeed } from '@las-flores/shared';
import { generateYaml, resolveFilePath } from './ContentSkeletonGenerator.js';
import { validateContent } from '../content/validate.js';
import { migrateContent } from '../content/migrate.js';
import { queryOLTP } from '../database/connection.js';
import { generatePromptFiles } from './PromptFileGenerator.js';
import {
  writePlanItems,
  rollbackFiles,
  collectAssetTasks,
  topologicalSort,
  applyLink,
  atomicWriteYaml,
} from './StoryBuilderFileWriter.js';

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

export interface MigrationResult {
  success: boolean;
  migrationResult: any;
  error?: string;
}

function resolveContentDir(): string {
  return path.resolve(process.cwd(), 'content');
}

/**
 * Generate placeholder lore/narrative markdown files for plan items.
 * Only creates files that don't already exist.
 * Creates files in the per-entity folder (e.g. content/characters/<slug>/<slug>.md).
 */
async function generateLoreStubs(items: ContentPlanItem[], contentDir: string, fileSnapshots?: Map<string, string | null>): Promise<string[]> {
  const createdFiles: string[] = [];

  for (const item of items) {
    const pathsToCreate: Array<{ field: string; label: string }> = [
      { field: 'lore_path', label: 'Lore' },
      { field: 'narrative_path', label: 'Narrative' },
    ];

    for (const { field, label } of pathsToCreate) {
      const relPath = item.fields[field];
      if (!relPath || typeof relPath !== 'string') continue;

      // New per-folder layout: lore files are in the same directory as the YAML
      const yamlDir = path.dirname(resolveFilePath(item));
      const fullPath = path.join(contentDir, yamlDir, relPath);

      // Security check: ensure the resolved path is within the content directory
      if (!fullPath.startsWith(contentDir + path.sep) && fullPath !== contentDir) {
        console.warn(`[story-builder] Skipping unsafe path: ${relPath}`);
        continue;
      }

      try {
        await fs.access(fullPath);
        continue;
      } catch {
        // File doesn't exist, create it
      }

      const stub = buildLoreStub(item, label);
      await atomicWriteYaml(fullPath, stub);
      if (fileSnapshots) {
        fileSnapshots.set(fullPath, null);
      }

      createdFiles.push(`${yamlDir}/${relPath}`);
    }
  }

  return createdFiles;
}

function buildLoreStub(item: ContentPlanItem, _label: string): string {
  const name = item.name || 'Untitled';
  const description = item.fields.description || '';

  // Use a structure similar to generateLore output but marked as placeholder
  const title = item.fields.title || name;
  const age = item.fields.age || 'Unknown';
  const origin = item.fields.origin || 'Las Flores urban sprawl';
  const occupation = item.fields.occupation || item.fields.title || 'Unspecified';

  return `# ${name}

**Title (full):** ${title}
**Title (short):** ${name}, ${title}

**Description (full):**
**Age:** ${age}
**Origin:** ${origin}
**Occupation:** ${occupation}

${description || `${name} is a ${item.type} in the world of Las Flores 2077.`}

---

**Key Relationships**

| Name | Nature | Notes |
|------|--------|-------|
| Unknown | Connection | To be determined by the GM |

**Known Habit**

${name} has yet to be fully fleshed out. This is a placeholder — run lore regeneration to generate AI content, or edit manually.
`;
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

export async function stagePlan(plan: ContentPlan): Promise<StagingResult> {
  const createdFiles: string[] = [];
  const updatedFiles: string[] = [];
  const fileSnapshots = new Map<string, string | null>();
  const contentDir = resolveContentDir();

  try {
    const { sorted: sortedItems } = topologicalSort(plan.items);

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

export async function migrateStagedPlan(planId: string): Promise<MigrationResult> {
  try {
    const result = await queryOLTP<{ plan_json: any; status: string }>(
      'SELECT plan_json, status FROM content_plans WHERE id = $1',
      [planId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (result.rows[0].status !== 'staged' && result.rows[0].status !== 'approved') {
      throw new Error(`Plan must be staged before migration. Current status: ${result.rows[0].status}`);
    }

    const contentDir = resolveContentDir();

    const migrationResult = await migrateContent(contentDir);

    const newStatus = migrationResult.success ? 'migrated' : 'failed';
    await queryOLTP(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, planId]
    );

    return {
      success: migrationResult.success,
      migrationResult,
      error: migrationResult.success ? undefined : migrationResult.errors.join('; '),
    };
  } catch (error: any) {
    try {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId]
      );
    } catch { /* ignore */ }

    return {
      success: false,
      migrationResult: null,
      error: error.message,
    };
  }
}

/**
 * Verify a migrated plan's cross-references.
 * Stub — full implementation in M05 PlanVerificationService.
 */
export async function verifyPlan(planId: string): Promise<{ success: boolean; checks: string[]; error?: string }> {
  try {
    // Confirm the plan exists and is in 'migrated' status
    const result = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1',
      [planId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }
    if (result.rows[0].status !== 'migrated') {
      throw new Error(`Plan must be migrated before verification. Current status: ${result.rows[0].status}`);
    }

    // Placeholder — full cross-reference checks in M05
    return { success: true, checks: [] };
  } catch (error: any) {
    return { success: false, checks: [], error: error.message };
  }
}

interface ValidationError {
  file?: string;
  message: string;
  severity: string;
}

function buildValidationErrors(
  errors: ValidationError[],
  depErrors: string[],
): string[] {
  return [
    ...errors
      .filter(e => e.severity === 'error')
      .map(e => `${e.file ?? ''}: ${e.message}`),
    ...depErrors,
  ];
}

