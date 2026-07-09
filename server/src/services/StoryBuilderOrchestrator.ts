import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import type { ContentPlan, ContentPlanItem, ContentLink, AssetNeed } from '@las-flores/shared';
import { generateYaml, resolveFilePath } from './ContentSkeletonGenerator.js';
import { validateContent } from '../content/validate.js';
import { migrateContent } from '../content/migrate.js';

export interface ExecutionResult {
  success: boolean;
  createdFiles: string[];
  validationErrors: string[];
  migrationResult: any;
  assetTasks: Array<{ item: ContentPlanItem; needs: AssetNeed[] }>;
  error?: string;
}

function resolveContentDir(): string {
  return path.resolve(process.cwd(), 'content');
}

export async function executePlan(plan: ContentPlan): Promise<ExecutionResult> {
  const createdFiles: string[] = [];
  const contentDir = resolveContentDir();

  try {
    const sortedItems = topologicalSort(plan.items);

    for (const item of sortedItems) {
      if (item.action === 'create') {
        const yamlStr = generateYaml(item);
        const filePath = resolveFilePath(item);
        const fullPath = path.join(contentDir, filePath);
        await atomicWriteYaml(fullPath, yamlStr);
        createdFiles.push(filePath);
      } else if (item.action === 'update') {
        const filePath = resolveFilePath(item);
        const fullPath = path.join(contentDir, filePath);
        try {
          await fs.access(fullPath);
          if (item.fields && Object.keys(item.fields).length > 0) {
            const content = await fs.readFile(fullPath, 'utf-8');
            const data = yaml.load(content) as Record<string, any>;
            const updatedData = { ...data, ...item.fields };
            const updatedYaml = yaml.dump(updatedData, { lineWidth: -1, noRefs: true });
            await atomicWriteYaml(fullPath, updatedYaml);
          }
        } catch {
          throw new Error(`Cannot update non-existent file: ${filePath}`);
        }
      } else {
        throw new Error(`Unsupported plan action: ${item.action}`);
      }
    }

    for (const link of plan.links) {
      await applyLink(link, plan.items, contentDir);
    }

    const validationResult = await validateContent(contentDir);
    if (!validationResult.valid) {
      return {
        success: false,
        createdFiles,
        validationErrors: validationResult.errors
          .filter(e => e.severity === 'error')
          .map(e => `${e.file ?? ''}: ${e.message}`),
        migrationResult: null,
        assetTasks: [],
      };
    }

    const migrationResult = await migrateContent(contentDir);

    const assetTasks = plan.items
      .filter(item => item.assetNeeds.length > 0)
      .map(item => ({ item, needs: item.assetNeeds }));

    return {
      success: true,
      createdFiles,
      validationErrors: [],
      migrationResult,
      assetTasks,
    };
  } catch (error: any) {
    return {
      success: false,
      createdFiles,
      validationErrors: [],
      migrationResult: null,
      assetTasks: [],
      error: error.message,
    };
  }
}

function topologicalSort(items: ContentPlanItem[]): ContentPlanItem[] {
  const itemMap = new Map(items.map(i => [i.id, i]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: ContentPlanItem[] = [];

  function visit(item: ContentPlanItem) {
    if (visiting.has(item.id)) {
      throw new Error(`Circular dependency detected involving item: ${item.name}`);
    }
    if (visited.has(item.id)) return;

    visiting.add(item.id);
    for (const depId of item.dependsOn) {
      const dep = itemMap.get(depId);
      if (!dep) {
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

  return result;
}

async function atomicWriteYaml(fullPath: string, content: string): Promise<void> {
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = fullPath + '.tmp';
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

async function applyLink(link: ContentLink, items: ContentPlanItem[], contentDir: string): Promise<void> {
  const fromItem = items.find(i => i.id === link.fromItem);
  if (!fromItem) return;

  const targetPath = path.join(contentDir, resolveFilePath(fromItem));
  const content = await fs.readFile(targetPath, 'utf-8');
  const data = (yaml.load(content) || {}) as Record<string, any>;

  if (link.action === 'add') {
    if (!Array.isArray(data[link.field])) {
      data[link.field] = [];
    }
    if (!data[link.field].includes(link.toItem)) {
      data[link.field].push(link.toItem);
    }
  } else if (link.action === 'set') {
    data[link.field] = link.toItem;
  }

  const updatedYaml = yaml.dump(data, { lineWidth: -1, noRefs: true });
  await atomicWriteYaml(targetPath, updatedYaml);
}
