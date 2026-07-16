import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import { uploadToMinio } from './StorageService.js';
import { markPublished } from './AssetNeedsService.js';
import { resolveEntityRootDir } from './LocalDraftService.js';
import { resolveFilePath } from './ContentSkeletonGenerator.js';
import { queryOLTP } from '../database/connection.js';
import type pg from 'pg';

export interface PublishedAsset {
  itemId: string;
  itemType: string;
  needId: string;
  localFilename: string;
  url: string;
  objectKey: string;
}

export interface PublishResult {
  success: boolean;
  published: PublishedAsset[];
  errors: string[];
}

export interface PromotionResult {
  contentPath: string;
  stage: 'staging' | 'production';
  url: string;
  createdObject: boolean;
}

export interface RollbackResult {
  contentPath: string;
  removed: boolean;
}

export interface EntityPromotionStatus {
  contentPath: string;
  name: string;
  slug: string;
  stages: {
    dev?: { url: string };
    staging?: { url: string };
    production?: { url: string };
  };
}

type Stage = 'staging' | 'production';

function resolveContentDir(): string {
  return path.resolve(process.cwd(), 'content');
}

function validateContentPathLocal(contentPath: string): string {
  if (!contentPath || typeof contentPath !== 'string' || contentPath.trim() === '') {
    throw new Error('Path must be a non-empty string');
  }
  if (contentPath.includes('..')) {
    throw new Error('Path traversal sequences (..) are not allowed');
  }
  if (!contentPath.endsWith('.yaml')) {
    throw new Error('Path must end with .yaml');
  }
  const contentDir = resolveContentDir();
  const absolutePath = path.resolve(contentDir, contentPath);
  if (!absolutePath.startsWith(contentDir + path.sep) && absolutePath !== contentDir) {
    throw new Error('Resolved path falls outside the content directory');
  }
  return absolutePath;
}

async function readYaml(absolutePath: string): Promise<Record<string, any>> {
  const raw = await fs.readFile(absolutePath, 'utf-8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Content file is not a valid YAML object');
  }
  return parsed as Record<string, any>;
}

async function writeYaml(absolutePath: string, data: Record<string, any>): Promise<void> {
  const newYaml = yaml.dump(data, { lineWidth: -1, noRefs: true });
  const reloaded = yaml.load(newYaml);
  if (!reloaded || typeof reloaded !== 'object') {
    throw new Error('Resulting YAML is invalid');
  }
  await fs.writeFile(absolutePath, newYaml, 'utf-8');
}

function getPortraitUrls(data: Record<string, any>): Array<{ url: string; label?: string }> {
  return Array.isArray(data.portrait_urls) ? data.portrait_urls : [];
}

function findDevEntry(portraitUrls: Array<{ url: string; label?: string }>): { url: string; label?: string } | undefined {
  return portraitUrls.find(p => p.label === 'dev');
}

function defaultLocalFilename(item: ContentPlanItem): string {
  return `${item.slug}__default.png`;
}

export async function publishChosenDrafts(
  planId: string,
  client?: pg.PoolClient,
): Promise<PublishResult> {
  const exec = <T extends pg.QueryResultRow = any>(text: string, params?: any[]) =>
    client ? client.query<T>(text, params) : queryOLTP<T>(text, params);

  const load = await exec<{ plan_json: any }>(
    'SELECT plan_json FROM content_plans WHERE id = $1',
    [planId],
  );
  if (load.rows.length === 0) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const plan = load.rows[0].plan_json as ContentPlan;
  const contentDir = resolveContentDir();

  const published: PublishedAsset[] = [];
  const errors: string[] = [];

  for (const item of plan.items) {
    const entityRoot = resolveEntityRootDir(item, contentDir);
    const yamlPath = path.join(contentDir, resolveFilePath(item));

    let yamlData: Record<string, any> = {};
    try {
      const raw = await fs.readFile(yamlPath, 'utf-8');
      yamlData = (yaml.load(raw) as Record<string, any>) || {};
    } catch (err: any) {
      errors.push(`${item.name}: could not read staged YAML at ${yamlPath}: ${err.message}`);
      continue;
    }

    const assetPaths = (item.fields as any)?.asset_paths || {};
    const chosenNeeds = item.assetNeeds.filter(n => n.status === 'chosen' || n.status === 'pending');
    if (chosenNeeds.length === 0) continue;

    const uploadedNeeds: Array<{
      need: ContentPlanItem['assetNeeds'][number];
      localFilename: string;
      url: string;
      objectKey: string;
    }> = [];

    for (const need of chosenNeeds) {
      const localFilename = assetPaths[need.promptType] || defaultLocalFilename(item);
      const localPath = path.resolve(entityRoot, 'assets', localFilename);
      const assetsRoot = path.resolve(entityRoot, 'assets');
      if (localPath !== assetsRoot && !localPath.startsWith(assetsRoot + path.sep)) {
        errors.push(`${item.name} / ${need.promptType}: local path escapes assets directory: ${localFilename}`);
        continue;
      }
      try {
        const buf = await fs.readFile(localPath);
        const objectKey = `${need.promptType}/${localFilename}`;
        const url = await uploadToMinio(buf, objectKey, 'image/png');

        if (need.targetField.startsWith('portrait_urls')) {
          const portraitUrls: Array<{ url: string; label?: string }> = getPortraitUrls(yamlData);
          if (!portraitUrls.some(p => p.url === url && p.label === 'dev')) {
            portraitUrls.push({ url, label: 'dev' });
          }
          yamlData.portrait_urls = portraitUrls;
        } else {
          yamlData[need.targetField] = url;
        }

        uploadedNeeds.push({ need, localFilename, url, objectKey });
      } catch (err: any) {
        errors.push(`${item.name} / ${need.promptType}: ${err.message}`);
      }
    }

    if (uploadedNeeds.length > 0) {
      try {
        await fs.writeFile(yamlPath, yaml.dump(yamlData, { lineWidth: -1, noRefs: true }), 'utf-8');
        for (const { need, localFilename, url, objectKey } of uploadedNeeds) {
          markPublished(need);
          published.push({
            itemId: item.id,
            itemType: item.type,
            needId: need.promptType,
            localFilename,
            url,
            objectKey,
          });
        }
      } catch (err: any) {
        errors.push(`${item.name}: failed to write portrait_urls to YAML: ${err.message}`);
      }
    }
  }

  await exec('UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2', [
    plan,
    planId,
  ]);

  return { success: errors.length === 0, published, errors };
}

async function promoteStage(
  contentPath: string,
  stage: Stage,
  opts?: { newBuffer?: Buffer; filename?: string },
): Promise<PromotionResult> {
  const absolutePath = validateContentPathLocal(contentPath);
  const data = await readYaml(absolutePath);

  const portraitUrls = getPortraitUrls(data);
  const devEntry = findDevEntry(portraitUrls);

  if (!devEntry) {
    throw new Error('No dev entry to promote; publish the asset first (Milestone 04)');
  }

  let url = devEntry.url;
  let createdObject = false;

  if (opts?.newBuffer && opts?.filename) {
    const objectKey = `portrait/${opts.filename}`;
    url = await uploadToMinio(opts.newBuffer, objectKey, 'image/png');
    createdObject = true;
  }

  const filtered = portraitUrls.filter(p => p.label !== stage);
  filtered.push({ url, label: stage });

  data.portrait_urls = filtered;
  await writeYaml(absolutePath, data);

  return { contentPath, stage, url, createdObject };
}

export async function promoteToStaging(
  contentPath: string,
  opts?: { newBuffer?: Buffer; filename?: string },
): Promise<PromotionResult> {
  return promoteStage(contentPath, 'staging', opts);
}

export async function promoteToProduction(
  contentPath: string,
  opts?: { newBuffer?: Buffer; filename?: string },
): Promise<PromotionResult> {
  return promoteStage(contentPath, 'production', opts);
}

export async function rollbackFromStaging(contentPath: string): Promise<RollbackResult> {
  const absolutePath = validateContentPathLocal(contentPath);
  const data = await readYaml(absolutePath);

  const portraitUrls = getPortraitUrls(data);
  const hasStaging = portraitUrls.some(p => p.label === 'staging');

  if (!hasStaging) {
    return { contentPath, removed: false };
  }

  data.portrait_urls = portraitUrls.filter(p => p.label !== 'staging');
  await writeYaml(absolutePath, data);

  return { contentPath, removed: true };
}

export async function listPromotionStatus(): Promise<EntityPromotionStatus[]> {
  const contentDir = resolveContentDir();
  const charactersDir = path.join(contentDir, 'characters');

  const results: EntityPromotionStatus[] = [];

  try {
    const entries = await fs.readdir(charactersDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const slug = entry.name;
      const entityDir = path.join(charactersDir, slug);
      const yamlFiles = await fs.readdir(entityDir);
      const yamlFile = yamlFiles.find(f => f.startsWith('char_') && f.endsWith('.yaml'));
      if (!yamlFile) continue;

      const contentPath = `characters/${slug}/${yamlFile}`;
      const absolutePath = path.join(entityDir, yamlFile);

      try {
        const data = await readYaml(absolutePath);
        const portraitUrls = getPortraitUrls(data);

        const stages: EntityPromotionStatus['stages'] = {};
        for (const entry of portraitUrls) {
          if (entry.label === 'dev' || entry.label === 'staging' || entry.label === 'production') {
            stages[entry.label] = { url: entry.url };
          }
        }

        results.push({
          contentPath,
          name: data.name || slug,
          slug,
          stages,
        });
      } catch {
        continue;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}
