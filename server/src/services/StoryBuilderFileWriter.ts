import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import type { ContentPlanItem, ContentLink, AssetNeed } from '@las-flores/shared';
import { generateYaml, resolveFilePath } from './ContentSkeletonGenerator.js';

export interface TopoSortResult {
  sorted: ContentPlanItem[];
  missingDeps: Array<{ itemId: string; itemName: string; missingDepId: string }>;
}

export async function writePlanItems(
  items: ContentPlanItem[],
  contentDir: string,
  createdFiles: string[],
  updatedFiles: string[],
  fileSnapshots: Map<string, string | null>,
): Promise<Array<{ itemId: string; name: string; status: 'success' | 'failed'; error?: string; filePath?: string }>> {
  const itemResults: Array<{ itemId: string; name: string; status: 'success' | 'failed'; error?: string; filePath?: string }> = [];
  const failedIds = new Set<string>();

  for (const item of items) {
    // Skip items whose dependencies failed
    const hasFailedDep = item.dependsOn.some(depId => failedIds.has(depId));
    if (hasFailedDep) {
      itemResults.push({
        itemId: item.id,
        name: item.name,
        status: 'failed',
        error: 'Skipped due to failed dependency',
      });
      failedIds.add(item.id);
      continue;
    }

    try {
      const filePath = resolveFilePath(item);
      const fullPath = path.join(contentDir, filePath);

      if (item.action === 'create') {
        const yamlStr = generateYaml(item);
        await atomicWriteYaml(fullPath, yamlStr);
        createdFiles.push(filePath);
        fileSnapshots.set(fullPath, null);
      } else if (item.action === 'update') {
        await updateExistingFile(item, fullPath, filePath, updatedFiles, fileSnapshots);
      } else {
        throw new Error(`Unsupported plan action: ${item.action}`);
      }

      itemResults.push({ itemId: item.id, name: item.name, status: 'success', filePath });
    } catch (error: any) {
      itemResults.push({ itemId: item.id, name: item.name, status: 'failed', error: error.message });
      failedIds.add(item.id);
    }
  }

  return itemResults;
}

export async function updateExistingFile(
  item: ContentPlanItem,
  fullPath: string,
  filePath: string,
  updatedFiles: string[],
  fileSnapshots: Map<string, string | null>,
): Promise<void> {
  try {
    await fs.access(fullPath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Cannot update non-existent file: ${filePath}`);
    }
    throw error;
  }
  if (!item.fields || Object.keys(item.fields).length === 0) return;

  const originalContent = await fs.readFile(fullPath, 'utf-8');
  fileSnapshots.set(fullPath, originalContent);
  const parsed = yaml.load(originalContent);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected a YAML object in ${filePath}`);
  }
  // Deep-merge known nested keys so updates don't drop existing data. Only the
  // explicitly-merged keys recurse; everything else is overridden by source.
  const updatedData = deepMergeFields(parsed as Record<string, any>, item.fields);
  const updatedYaml = yaml.dump(updatedData, { lineWidth: -1, noRefs: true });
  await atomicWriteYaml(fullPath, updatedYaml);
  updatedFiles.push(filePath);
}

/**
 * Merge `fields` onto an existing YAML object. Keys in `DEEP_MERGE_KEYS` that
 * are plain objects on *both* sides are merged recursively; all other values
 * are overridden by the source. Arrays (including `nodes`) are replaced whole.
 */
const DEEP_MERGE_KEYS = new Set(['metadata', 'asset_paths', 'conditions']);

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjects(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] =
      isObject(value) && isObject(result[key])
        ? mergeObjects(result[key], value)
        : value;
  }
  return result;
}

export function deepMergeFields(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      DEEP_MERGE_KEYS.has(key) &&
      isObject(value) &&
      isObject(result[key])
    ) {
      result[key] = mergeObjects(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function rollbackFiles(snapshots: Map<string, string | null>): Promise<void> {
  for (const [fullPath, originalContent] of snapshots) {
    try {
      if (originalContent === null) {
        // Newly created file — delete it
        await fs.unlink(fullPath);
      } else {
        // Updated file — restore original content
        await atomicWriteYaml(fullPath, originalContent);
      }
    } catch (error) {
      // Best-effort rollback; log but don't throw
      console.error(`[story-builder] Rollback failed for ${fullPath}:`, error);
    }
  }
}

export function collectAssetTasks(items: ContentPlanItem[]): Array<{ item: ContentPlanItem; needs: AssetNeed[] }> {
  return items
    .filter(item => item.assetNeeds.length > 0)
    .map(item => ({ item, needs: item.assetNeeds }));
}

export function topologicalSort(items: ContentPlanItem[]): TopoSortResult {
  const itemMap = new Map(items.map(i => [i.id, i]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: ContentPlanItem[] = [];
  const missingDeps: TopoSortResult['missingDeps'] = [];

  function visit(item: ContentPlanItem) {
    if (visiting.has(item.id)) {
      throw new Error(`Circular dependency detected involving item: ${item.name}`);
    }
    if (visited.has(item.id)) return;

    visiting.add(item.id);
    for (const depId of item.dependsOn) {
      const dep = itemMap.get(depId);
      if (!dep) {
        missingDeps.push({ itemId: item.id, itemName: item.name, missingDepId: depId });
        continue;
      }
      visit(dep);
    }
    visiting.delete(item.id);
    visited.add(item.id);
    result.push(item);
  }

  for (const item of items) {
    visit(item);
  }

  return { sorted: result, missingDeps };
}

export async function atomicWriteYaml(fullPath: string, content: string): Promise<void> {
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${fullPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, fullPath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore unlink error if file didn't exist
    }
    throw error;
  }
}

export async function applyLink(
  link: ContentLink,
  items: ContentPlanItem[],
  contentDir: string,
  fileSnapshots?: Map<string, string | null>,
): Promise<void> {
  const fromItem = items.find(i => i.id === link.fromItem);
  if (!fromItem) {
    throw new Error(`Link references unknown source item: ${link.fromItem}`);
  }

  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  if (DANGEROUS_KEYS.has(link.field)) {
    throw new Error(`Invalid link field: ${link.field}`);
  }

  const targetPath = path.join(contentDir, resolveFilePath(fromItem));
  const content = await fs.readFile(targetPath, 'utf-8');
  const parsed = yaml.load(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected a YAML object in ${targetPath}`);
  }
  const data = parsed as Record<string, any>;

  if (link.action === 'add') {
    if (data[link.field] === undefined) {
      data[link.field] = [];
    } else if (!Array.isArray(data[link.field])) {
      throw new Error(`Expected array field "${link.field}" in ${targetPath}`);
    }
    if (!data[link.field].includes(link.toItem)) {
      data[link.field].push(link.toItem);
    }
  } else if (link.action === 'set') {
    data[link.field] = link.toItem;
  }

  // Snapshot original content for rollback (only if not already snapshotted)
  if (fileSnapshots && !fileSnapshots.has(targetPath)) {
    fileSnapshots.set(targetPath, content);
  }

  const updatedYaml = yaml.dump(data, { lineWidth: -1, noRefs: true });
  await atomicWriteYaml(targetPath, updatedYaml);
}
