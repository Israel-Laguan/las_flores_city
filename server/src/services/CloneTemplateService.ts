import yaml from 'js-yaml';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ContentPlanItem, ContentType } from '@las-flores/shared';
import { resolveContentDir, validateContentPath } from '../routes/admin-content.helpers.js';
import { createItem } from './createPlanItem.js';

const IDENTITY_FIELDS = new Set(['id', 'created_at', 'updated_at']);

const RELATIONSHIP_FIELDS: Partial<Record<ContentType, string[]>> = {
  character: ['relationships'],
  scene: ['available_dialogues'],
  dialogue: ['nodes'],
  overlay: ['target_tree_id', 'mission_id', 'nodes'],
  mission: ['aftermath_payload'],
  story: ['mission_id', 'characters', 'scenes', 'dialogues', 'overlays', 'vault_items'],
  gig: ['location_restriction_id'],
  vault: ['mission_id'],
  map_tile: ['district_id'],
};

const RELATIONSHIP_NESTED_IDS = new Set([
  'target_id', 'speaker_id', 'vault_unlock', 'mystery_solve',
  'grant_item', 'scene_id', 'character_id',
]);

function inferTypeFromPath(relativePath: string): ContentType {
  const firstSegment = relativePath.split('/')[0] ?? '';
  const singular = firstSegment.endsWith('ies')
    ? `${firstSegment.slice(0, -3)}y`
    : firstSegment.endsWith('s')
      ? firstSegment.slice(0, -1)
      : firstSegment;
  return singular as ContentType;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'untitled';
}

function deepStripIds(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => deepStripIds(item));
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (IDENTITY_FIELDS.has(key)) continue;
    const val = obj[key];
    result[key] = val && typeof val === 'object' ? deepStripIds(val) : val;
  }
  return result;
}

function deepStripRelationshipUuids(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => deepStripRelationshipUuids(item));
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (RELATIONSHIP_NESTED_IDS.has(key)) {
      result[key] = null;
    } else {
      const val = obj[key];
      result[key] = val && typeof val === 'object' ? deepStripRelationshipUuids(val) : val;
    }
  }
  return result;
}

function stripRelationshipFields(
  fields: Record<string, any>,
  contentType: ContentType,
): Record<string, any> {
  const relFields = RELATIONSHIP_FIELDS[contentType] || [];
  const result = { ...fields };

  for (const field of relFields) {
    if (!(field in result)) continue;
    const val = result[field];
    if (Array.isArray(val)) {
      result[field] = [];
    } else if (val && typeof val === 'object') {
      result[field] = deepStripRelationshipUuids(val);
    } else {
      result[field] = null;
    }
  }

  return result;
}

function resetAssetPaths(
  fields: Record<string, any>,
  newSlug: string,
): Record<string, any> {
  if (!fields.asset_paths || typeof fields.asset_paths !== 'object') return fields;
  const newAssets: Record<string, string> = {};
  for (const key of Object.keys(fields.asset_paths)) {
    newAssets[key] = `${newSlug}__default.png`;
  }
  return { ...fields, asset_paths: newAssets };
}

/**
 * Clone a content entity as a ContentPlanItem for the story builder.
 *
 * Reads the source YAML, strips identity fields and relationship UUIDs,
 * resets asset paths, and returns a new ContentPlanItem ready to add to a plan.
 */
export async function cloneItem(
  sourcePath: string,
  newName: string,
): Promise<ContentPlanItem> {
  const pathCheck = validateContentPath(sourcePath);
  if (!pathCheck.valid) {
    throw new Error(`Invalid source path: ${pathCheck.reason}`);
  }

  const contentDir = resolveContentDir();
  const absolutePath = path.resolve(contentDir, sourcePath);

  let rawYaml: string;
  try {
    rawYaml = await fs.readFile(absolutePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error(`Source file not found: ${sourcePath}`);
    }
    throw err;
  }

  const parsed = yaml.load(rawYaml) as Record<string, any>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Source file is not valid YAML');
  }

  const contentType = inferTypeFromPath(sourcePath);
  const newSlug = slugify(newName);

  // Deep clone and sanitize
  let fields = deepStripIds(JSON.parse(JSON.stringify(parsed)));
  fields = stripRelationshipFields(fields, contentType);
  fields = resetAssetPaths(fields, newSlug);

  // Update lore/narrative paths to use new slug
  if (fields.lore_path) fields.lore_path = `${newSlug}.md`;
  if (fields.narrative_path) fields.narrative_path = `${newSlug}.md`;

  return createItem({
    type: contentType,
    name: newName,
    slug: newSlug,
    fields,
  });
}
