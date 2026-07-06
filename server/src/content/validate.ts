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

export async function validateYAMLFile(filePath: string): Promise<ValidationResult> {
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

    const hasSchemaErrors = validationResult.errors.some(e => e.severity === 'error');
    if (!hasSchemaErrors) {
      if (contentType === 'dialogue') {
        await validateDialogueBeatSlugs(filePath, data, errors);
      } else if (contentType === 'scene') {
        await validateSceneBeatSlugs(filePath, data, errors);
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

export async function validateAllContent(contentDir: string): Promise<ValidationResult> {
  const allErrors: ValidationError[] = [];
  const allWarnings: string[] = [];

  const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
  const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
  const allFiles = [...yamlFiles, ...ymlFiles];

  for (const file of allFiles) {
    const result = await validateYAMLFile(file);
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

export async function validateContent(contentDir: string): Promise<ValidationResult> {
  console.log(`🔍 Validating content in: ${contentDir}`);
  
  const schemaResult = await validateAllContent(contentDir);
  
  const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
  const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
  const allFiles = [...yamlFiles, ...ymlFiles];
  
  const allErrors = [...schemaResult.errors];
  const allWarnings = [...schemaResult.warnings];
  
  for (const file of allFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const data = yaml.load(content);
      const xssErrors = checkForXSS(data);
      allErrors.push(...xssErrors.map(e => ({ ...e, file })));
    } catch (error) {
      // Skip files that failed schema validation
    }
  }

  const storyFlow = await validateStoryFlow();
  allWarnings.push(...storyFlow.issues);

  return {
    valid: allErrors.filter(e => e.severity === 'error').length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// ---------------------------------------------------------------------------
// Content Quality Checks
// ---------------------------------------------------------------------------
// These are advisory checks that warn about common content issues.
// They never block migration — severity is always 'warning' (or 'error'
// only for genuine cross-reference mismatches that would break gameplay).

export interface QualityIssue {
  file?: string;
  contentId?: string;
  message: string;
  severity: 'warning' | 'error';
  checkType: 'density' | 'length' | 'inconsistency' | 'completeness';
}

export interface QualityReport {
  density: QualityIssue[];
  length: QualityIssue[];
  inconsistency: QualityIssue[];
  completeness: QualityIssue[];
}

function addIssue(
  issues: QualityIssue[],
  checkType: QualityIssue['checkType'],
  severity: QualityIssue['severity'],
  message: string,
  file?: string,
  contentId?: string,
) {
  issues.push({ checkType, severity, message, file, contentId });
}

// --- Helpers ----------------------------------------------------------------

interface LoadedContent {
  file: string;
  type: ContentType;
  data: any;
}

async function loadAllContent(contentDir: string): Promise<LoadedContent[]> {
  const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
  const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
  const allFiles = [...yamlFiles, ...ymlFiles];
  const items: LoadedContent[] = [];

  for (const file of allFiles) {
    const contentType = getContentTypeFromPath(file);
    if (!contentType) continue;
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const data = yaml.load(raw);
      items.push({ file, type: contentType, data });
    } catch {
      // skip files that failed to parse
    }
  }
  return items;
}

function getAllIds(data: any): string[] {
  const ids: string[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item.id === 'string') ids.push(item.id);
    }
  } else if (data && typeof data.id === 'string') {
    ids.push(data.id);
  }
  return ids;
}

function extractItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  // Handle multi-item bundles: { characters: [...], missions: [...], etc. }
  for (const key of ['characters', 'missions', 'stories', 'vault_items', 'gigs', 'shop_items', 'overlays', 'beats']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return data ? [data] : [];
}

// --- Density checks --------------------------------------------------------

function checkDensity(items: LoadedContent[], report: QualityReport) {
  const characters = new Map<string, { id: string; name: string; file: string }>();
  const scenes = new Map<string, { id: string; name: string; file: string; data: any }>();
  const dialogues = new Map<string, { id: string; name: string; file: string; data: any }>();
  const missions = new Map<string, { id: string; title: string; file: string }>();
  const vaultItems = new Map<string, { id: string; file: string; missionId?: string }>();
  const overlays = new Map<string, { id: string; file: string; missionId?: string; targetTreeId?: string }>();

  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      switch (item.type) {
        case 'character':
          characters.set(entry.id, { id: entry.id, name: entry.name, file: item.file });
          break;
        case 'scene':
          scenes.set(entry.id, { id: entry.id, name: entry.name, file: item.file, data: entry });
          break;
        case 'dialogue':
          dialogues.set(entry.id, { id: entry.id, name: entry.name, file: item.file, data: entry });
          break;
        case 'mission':
          missions.set(entry.id, { id: entry.id, title: entry.title, file: item.file });
          break;
        case 'vault':
          for (const vi of extractItems(entry)) {
            vaultItems.set(vi.id, { id: vi.id, file: item.file, missionId: vi.mission_id });
          }
          break;
        case 'overlay':
          overlays.set(entry.id, { id: entry.id, file: item.file, missionId: entry.mission_id, targetTreeId: entry.target_tree_id });
          break;
      }
    }
  }

  // Scene should have ≥1 linked dialogue
  for (const [, scene] of scenes) {
    const dialoguesLinked = scene.data?.available_dialogues;
    if (!dialoguesLinked || !Array.isArray(dialoguesLinked) || dialoguesLinked.length === 0) {
      addIssue(report.density, 'density', 'warning', `Scene "${scene.name}" has no linked dialogues`, scene.file, scene.id);
    }
  }

  // Mission should have ≥1 vault item
  for (const [, mission] of missions) {
    const linkedVault = [...vaultItems.values()].filter(v => v.missionId === mission.id);
    if (linkedVault.length === 0) {
      addIssue(report.density, 'density', 'warning', `Mission "${mission.title}" has no linked vault items`, mission.file, mission.id);
    }
  }

  // Dialogue should have ≥3 nodes
  for (const [, dialogue] of dialogues) {
    const nodeCount = dialogue.data?.nodes ? Object.keys(dialogue.data.nodes).length : 0;
    if (nodeCount < 3) {
      addIssue(report.density, 'density', 'warning', `Dialogue "${dialogue.name}" has only ${nodeCount} node(s) (recommend ≥3)`, dialogue.file, dialogue.id);
    }
  }

  // Character should appear in ≥1 scene (check scene metadata)
  const characterIdsUsedInScenes = new Set<string>();
  for (const [, scene] of scenes) {
    const npcs = scene.data?.metadata?.npcs;
    if (Array.isArray(npcs)) {
      for (const npcId of npcs) characterIdsUsedInScenes.add(npcId);
    }
  }
  for (const [charId, char] of characters) {
    if (!characterIdsUsedInScenes.has(charId)) {
      addIssue(report.density, 'density', 'warning', `Character "${char.name}" is not linked in any scene's NPCs`, char.file, charId);
    }
  }
}

// --- Length checks ----------------------------------------------------------

function checkLength(items: LoadedContent[], report: QualityReport) {
  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      // Character description
      if (item.type === 'character' && entry.description) {
        const len = entry.description.length;
        if (len < 20) {
          addIssue(report.length, 'length', 'warning', `Character "${entry.name}" description is very short (${len} chars, recommend ≥20)`, item.file, entry.id);
        } else if (len > 300) {
          addIssue(report.length, 'length', 'warning', `Character "${entry.name}" description is very long (${len} chars, recommend ≤300)`, item.file, entry.id);
        }
      }

      // Scene description
      if (item.type === 'scene' && entry.description) {
        const len = entry.description.length;
        if (len < 20) {
          addIssue(report.length, 'length', 'warning', `Scene "${entry.name}" description is very short (${len} chars, recommend ≥20)`, item.file, entry.id);
        } else if (len > 300) {
          addIssue(report.length, 'length', 'warning', `Scene "${entry.name}" description is very long (${len} chars, recommend ≤300)`, item.file, entry.id);
        }
      }

      // Dialogue node text
      if (item.type === 'dialogue' && entry.nodes) {
        for (const [nodeId, node] of Object.entries(entry.nodes as Record<string, any>)) {
          const text = (node as any)?.text;
          if (typeof text === 'string') {
            const len = text.length;
            if (len < 10) {
              addIssue(report.length, 'length', 'warning', `Dialogue node "${nodeId}" text is very short (${len} chars, recommend ≥10)`, item.file, entry.id);
            } else if (len > 500) {
              addIssue(report.length, 'length', 'warning', `Dialogue node "${nodeId}" text is very long (${len} chars, recommend ≤500)`, item.file, entry.id);
            }
          }
        }
      }

      // Dialogue choice text
      if (item.type === 'dialogue' && entry.nodes) {
        for (const [nodeId, node] of Object.entries(entry.nodes as Record<string, any>)) {
          const choices = (node as any)?.choices;
          if (Array.isArray(choices)) {
            for (const choice of choices) {
              const text = choice?.text;
              if (typeof text === 'string') {
                const len = text.length;
                if (len < 5) {
                  addIssue(report.length, 'length', 'warning', `Choice text in node "${nodeId}" is very short (${len} chars, recommend ≥5)`, item.file, entry.id);
                } else if (len > 100) {
                  addIssue(report.length, 'length', 'warning', `Choice text in node "${nodeId}" is very long (${len} chars, recommend ≤100)`, item.file, entry.id);
                }
              }
            }
          }
        }
      }
    }
  }
}

// --- Inconsistency checks ---------------------------------------------------

function checkInconsistency(items: LoadedContent[], report: QualityReport) {
  const allCharacterIds = new Set<string>();
  const allDialogueIds = new Set<string>();
  const allMissionIds = new Set<string>();
  const allOverlayIds = new Set<string>();

  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      switch (item.type) {
        case 'character':
          for (const id of getAllIds(entry)) allCharacterIds.add(id);
          break;
        case 'dialogue':
          for (const id of getAllIds(entry)) allDialogueIds.add(id);
          break;
        case 'mission':
          for (const id of getAllIds(entry)) allMissionIds.add(id);
          break;
        case 'overlay':
          for (const id of getAllIds(entry)) allOverlayIds.add(id);
          break;
      }
    }
  }

  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      // Scene → dialogue references
      if (item.type === 'scene' && Array.isArray(entry.available_dialogues)) {
        for (const dialogueId of entry.available_dialogues) {
          if (!allDialogueIds.has(dialogueId)) {
            addIssue(report.inconsistency, 'inconsistency', 'error', `Scene references non-existent dialogue "${dialogueId}"`, item.file, entry.id);
          }
        }
      }

      // Dialogue → speaker references
      if (item.type === 'dialogue' && entry.nodes) {
        for (const [nodeId, node] of Object.entries(entry.nodes as Record<string, any>)) {
          const speakerId = (node as any)?.speaker_id;
          if (speakerId && !allCharacterIds.has(speakerId)) {
            addIssue(report.inconsistency, 'inconsistency', 'error', `Dialogue node "${nodeId}" references non-existent speaker "${speakerId}"`, item.file, entry.id);
          }
        }
      }

      // Overlay → target tree references
      if (item.type === 'overlay' && entry.target_tree_id) {
        if (!allDialogueIds.has(entry.target_tree_id)) {
          addIssue(report.inconsistency, 'inconsistency', 'error', `Overlay references non-existent target dialogue tree "${entry.target_tree_id}"`, item.file, entry.id);
        }
      }

      // Overlay → mission references
      if (item.type === 'overlay' && entry.mission_id) {
        if (!allMissionIds.has(entry.mission_id)) {
          addIssue(report.inconsistency, 'inconsistency', 'error', `Overlay references non-existent mission "${entry.mission_id}"`, item.file, entry.id);
        }
      }

      // Vault → mission references
      if (item.type === 'vault') {
        for (const vi of extractItems(entry)) {
          if (vi.mission_id && !allMissionIds.has(vi.mission_id)) {
            addIssue(report.inconsistency, 'inconsistency', 'error', `Vault item "${vi.id}" references non-existent mission "${vi.mission_id}"`, item.file, vi.id);
          }
        }
      }
    }
  }
}

// --- Completeness checks ----------------------------------------------------

function checkCompleteness(items: LoadedContent[], report: QualityReport) {
  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      if (item.type === 'character') {
        if (!entry.portrait_urls || (Array.isArray(entry.portrait_urls) && entry.portrait_urls.length === 0)) {
          addIssue(report.completeness, 'completeness', 'warning', `Character "${entry.name}" has no portrait_urls`, item.file, entry.id);
        }
        if (!entry.lore_ref) {
          addIssue(report.completeness, 'completeness', 'warning', `Character "${entry.name}" has no lore_ref`, item.file, entry.id);
        }
      }

      if (item.type === 'scene') {
        if (!entry.background_url) {
          addIssue(report.completeness, 'completeness', 'warning', `Scene "${entry.name}" has no background_url`, item.file, entry.id);
        }
        if (!entry.mood) {
          addIssue(report.completeness, 'completeness', 'warning', `Scene "${entry.name}" has no mood set`, item.file, entry.id);
        }
      }

      if (item.type === 'mission') {
        if (!entry.aftermath_payload || Object.keys(entry.aftermath_payload).length === 0) {
          addIssue(report.completeness, 'completeness', 'warning', `Mission "${entry.title}" has no aftermath_payload`, item.file, entry.id);
        }
      }

      if (item.type === 'overlay') {
        if (!entry.modifications || (Array.isArray(entry.modifications) && entry.modifications.length === 0)) {
          if (!entry.nodes || Object.keys(entry.nodes).length === 0) {
            addIssue(report.completeness, 'completeness', 'warning', `Overlay "${entry.name}" has no modifications or nodes`, item.file, entry.id);
          }
        }
      }
    }
  }
}

// --- Main quality check entry point -----------------------------------------

export async function checkContentQuality(contentDir: string): Promise<QualityReport> {
  const items = await loadAllContent(contentDir);
  const report: QualityReport = {
    density: [],
    length: [],
    inconsistency: [],
    completeness: [],
  };

  checkDensity(items, report);
  checkLength(items, report);
  checkInconsistency(items, report);
  checkCompleteness(items, report);

  return report;
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]).endsWith(path.join('src', 'content', 'validate.ts'))
  : false;

if (isCli) {
  const contentDir = process.argv[2] || '../content';

  validateContent(contentDir)
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