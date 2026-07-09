import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import {
  YAMLCharacterSchema,
  YAMLDialogueSchema,
  YAMLOverlaySchema,
  YAMLSceneSchema,
  YAMLMissionSchema,
  YAMLLocationSchema,
  VaultFileSchema,
  ShopItemFileSchema,
  GigFileSchema,
  StoryBeatRegistrySchema,
  ContentType,
  YAMLStoryFileSchema,
} from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { getCache } from '../database/redis.js';
import { validateStoryFlow } from './storyFlow.js';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

async function loadValidBeatSlugs(): Promise<Set<string> | null> {
  try {
    const result = await queryOLTP<{ slug: string }>('SELECT slug FROM story_beats');
    return new Set(result.rows.map(r => r.slug));
  } catch {
    // fall through to Redis
  }
  const cached = await getCache<string[]>('story_beats:slugs');
  if (cached && cached.length > 0) return new Set(cached);
  return null;
}

async function validateDialogueBeatSlugs(filePath: string, data: any, errors: ValidationError[]) {
  const validSlugs = await loadValidBeatSlugs();
  if (validSlugs === null) {
    errors.push({ file: filePath, message: 'Beat registry unavailable: story_beat cross-reference checks skipped', severity: 'warning' });
  } else if (validSlugs.size === 0) {
    errors.push({ file: filePath, message: 'Cannot validate effects.story_beat: story_beats registry not yet migrated. Run story_beats.yaml migration first.', severity: 'warning' });
  } else {
    const nodes = data?.nodes ?? {};
    for (const [nodeId, node] of Object.entries(nodes as Record<string, any>)) {
      const beatSlug = (node as any)?.effects?.story_beat;
      if (beatSlug && !validSlugs.has(beatSlug)) {
        errors.push({ file: filePath, message: `Unknown story_beat slug "${beatSlug}" on node "${nodeId}" — not in registry`, severity: 'error' });
      }
    }
  }
}

async function validateSceneBeatSlugs(filePath: string, data: any, errors: ValidationError[]) {
  const requiredBeat = data?.metadata?.required_story_beat;
  if (requiredBeat === undefined || requiredBeat === null) return;
  const validSlugs = await loadValidBeatSlugs();
  if (validSlugs === null) {
    errors.push({ file: filePath, message: 'Beat registry unavailable: required_story_beat cross-reference checks skipped', severity: 'warning' });
  } else if (validSlugs.size === 0) {
    errors.push({ file: filePath, message: 'Cannot validate required_story_beat: story_beats registry is empty. Run story_beats.yaml migration first.', severity: 'warning' });
  } else {
    const slugsToCheck = Array.isArray(requiredBeat) ? requiredBeat : [requiredBeat];
    for (const slug of slugsToCheck) {
      if (!validSlugs.has(slug)) {
        errors.push({ file: filePath, message: `Unknown required_story_beat slug "${slug}" in scene — not in registry`, severity: 'error' });
      }
    }
  }
}

export async function validateYAMLFile(filePath: string, schemaOnly: boolean = false): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    let data: any;
    try {
      data = yaml.load(content);
    } catch (e: any) {
      errors.push({ file: filePath, message: `YAML parse error: ${e.message}`, severity: 'error' });
      return { valid: false, errors, warnings };
    }

    const contentType = getContentTypeFromPath(filePath);
    if (!contentType) {
      errors.push({ file: filePath, message: 'Could not determine content type from file path', severity: 'error' });
      return { valid: false, errors, warnings };
    }

    const validationResult = validateContentByType(contentType, data);
    errors.push(...validationResult.errors.map(e => ({ ...e, file: filePath })));
    warnings.push(...validationResult.warnings);

    const xssErrors = checkForXSS(data);
    errors.push(...xssErrors.map(e => ({ ...e, file: filePath })));

    // Skip DB/Redis cross-reference checks in schema-only mode
    if (!schemaOnly) {
      const hasSchemaErrors = validationResult.errors.some(e => e.severity === 'error');
      if (!hasSchemaErrors) {
        if (contentType === 'dialogue') {
          await validateDialogueBeatSlugs(filePath, data, errors);
        } else if (contentType === 'scene') {
          await validateSceneBeatSlugs(filePath, data, errors);
        }
      }
    }

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      warnings,
    };
  } catch (error: any) {
    errors.push({ file: filePath, message: `File read error: ${error.message}`, severity: 'error' });
    return { valid: false, errors, warnings };
  }
}

export function validateContentByType(type: ContentType, data: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  try {
    switch (type) {
      case 'character':
        YAMLCharacterSchema.parse(data);
        break;
      case 'dialogue':
        YAMLDialogueSchema.parse(data);
        const cycleErrors = detectCycles(data.nodes || {});
        errors.push(...cycleErrors);
        break;
      case 'overlay':
        YAMLOverlaySchema.parse(data);
        break;
      case 'mission':
        if (data.missions) {
          for (const mission of data.missions) {
            YAMLMissionSchema.parse(mission);
          }
        } else {
          YAMLMissionSchema.parse(data);
        }
        break;
      case 'story':
        YAMLStoryFileSchema.parse(data);
        break;
      case 'scene':
        YAMLSceneSchema.parse(data);
        break;
      case 'vault':
        VaultFileSchema.parse(data);
        break;
      case 'shop_item':
        ShopItemFileSchema.parse(data);
        break;
      case 'gig':
        GigFileSchema.parse(data);
        break;
      case 'location':
        YAMLLocationSchema.parse(data);
        break;
      case 'story_beat':
        StoryBeatRegistrySchema.parse(data);
        break;
      case 'map_tile':
        break;
    }
  } catch (e: any) {
    errors.push({
      message: `Schema validation failed: ${e.message}`,
      severity: 'error',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

function detectCycles(nodes: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = nodes[nodeId];
    if (!node) return false;

    if (node.choices) {
      for (const choice of node.choices) {
        if (!visited.has(choice.next_node_id)) {
          if (dfs(choice.next_node_id)) {
            return true;
          }
        } else if (recursionStack.has(choice.next_node_id)) {
          errors.push({
            message: `Circular dependency detected: ${nodeId} -> ${choice.next_node_id}`,
            severity: 'error',
          });
          return true;
        }
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return errors;
}

function getContentTypeFromPath(filePath: string): ContentType | null {
  const normalizedPath = filePath.toLowerCase();
  
  if (normalizedPath.includes('/characters/') || normalizedPath.includes('\\characters\\')) {
    return 'character';
  }
  if (normalizedPath.includes('/dialogues/') || normalizedPath.includes('\\dialogues\\')) {
    return 'dialogue';
  }
  if (normalizedPath.includes('/overlays/') || normalizedPath.includes('\\overlays\\')) {
    return 'overlay';
  }
  if (normalizedPath.includes('/scenes/') || normalizedPath.includes('\\scenes\\')) {
    return 'scene';
  }
  if (normalizedPath.includes('/gigs/') || normalizedPath.includes('\\gigs\\') || normalizedPath.includes('gigs.yaml')) {
    return 'gig';
  }
  if (normalizedPath.includes('/vault/') || normalizedPath.includes('\\vault\\')) {
    return 'vault';
  }
  if (normalizedPath.includes('/missions/') || normalizedPath.includes('\\missions\\') || normalizedPath.includes('/mysteries/') || normalizedPath.includes('\\mysteries\\')) {
    return 'mission';
  }
  if (normalizedPath.includes('/stories/') || normalizedPath.includes('\\stories\\')) {
    return 'story';
  }
  if (normalizedPath.includes('/shop/') || normalizedPath.includes('\\shop\\')) {
    return 'shop_item';
  }
  if (normalizedPath.includes('/locations/') || normalizedPath.includes('\\locations\\')) {
    return 'location';
  }

  if (normalizedPath.endsWith('story_beats.yaml')) {
    return 'story_beat';
  }

  if (normalizedPath.endsWith('.yaml') && normalizedPath.includes('gig')) {
    return 'gig';
  }
  
  return null;
}

export async function validateAllContent(contentDir: string, schemaOnly: boolean = false): Promise<ValidationResult> {
  const allErrors: ValidationError[] = [];
  const allWarnings: string[] = [];

  const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
  const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
  const allFiles = [...yamlFiles, ...ymlFiles];

  for (const file of allFiles) {
    const result = await validateYAMLFile(file, schemaOnly);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.filter(e => e.severity === 'error').length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

export function sanitizeText(text: string): string {
  const preservedTags: string[] = [];
  let sanitized = text.replace(/<(important|\/important)>/g, (match) => {
    preservedTags.push(match);
    return `__PRESERVED_TAG_${preservedTags.length - 1}__`;
  });

  sanitized = sanitized.replace(/<[^>]*>/g, '');

  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  sanitized = sanitized.replace(/__PRESERVED_TAG_(\d+)__/g, (_, index) => preservedTags[parseInt(index)]);

  return sanitized;
}

export function checkForXSS(content: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  function checkValue(value: any, path: string) {
    if (typeof value === 'string') {
      if (/<script/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: script tag detected`,
          severity: 'error',
        });
      }
      
      if (/on\w+\s*=/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: event handler detected`,
          severity: 'error',
        });
      }
      
      if (/javascript:/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: javascript: protocol detected`,
          severity: 'error',
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, `${path}.${key}`);
      }
    }
  }
  
  checkValue(content, 'content');
  return errors;
}

export async function validateContentString(
  yamlString: string,
  contentType: ContentType
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  let data: any;
  try {
    data = yaml.load(yamlString);
  } catch (e: any) {
    errors.push({
      message: `YAML parse error: ${e.message}`,
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  const typeResult = validateContentByType(contentType, data);
  errors.push(...typeResult.errors);
  warnings.push(...typeResult.warnings);

  const xssErrors = checkForXSS(data);
  errors.push(...xssErrors);

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings,
  };
}

export async function validateContent(contentDir: string, schemaOnly: boolean = false): Promise<ValidationResult> {
  console.log(`🔍 Validating content in: ${contentDir}`);

  const schemaResult = await validateAllContent(contentDir, schemaOnly);

  const storyFlow = await validateStoryFlow();
  const allWarnings = [...schemaResult.warnings, ...storyFlow.issues];

  return {
    valid: schemaResult.valid,
    errors: schemaResult.errors,
    warnings: allWarnings,
  };
}

export { checkContentQuality } from './quality.js';
export type { QualityIssue, QualityReport } from './quality.js';

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]).endsWith(path.join('src', 'content', 'validate.ts'))
  : false;

if (isCli) {
  const contentDir = process.argv[2] || '../content';
  const schemaOnly = process.argv.includes('--schema-only');

  validateContent(contentDir, schemaOnly)
    .then(result => {
      if (result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach(w => console.log(`  - ${w}`));
      }
      if (result.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.errors.forEach(e => console.log(`  - [${e.severity}] ${e.file ?? ''}: ${e.message}`));
      }
      if (result.valid) {
        console.log('\n✅ Content validation passed!');
        process.exit(0);
      } else {
        console.log('\n💥 Content validation failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}
