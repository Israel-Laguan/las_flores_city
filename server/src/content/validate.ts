import * as yaml from 'js-yaml';
import fs from 'fs/promises';
import { glob } from 'glob';
import { ContentType } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { getCache } from '@las-flores/infra';
import { validateStoryFlow } from './storyFlow.js';
import { validateLorePaths } from './lorePathValidation.js';
import { checkForXSS } from './validate-xss.js';
import { getContentTypeFromPath, validateContentByType } from './validate-types.js';

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

export { sanitizeText, checkForXSS } from './validate-xss.js';
export { getContentTypeFromPath, validateContentByType, detectCycles } from './validate-types.js';

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

/**
 * Validate that any `metadata.required_story_beat` on a dialogue
 * tree references a slug that exists in the story_beats registry.
 *
 * Mirrors `validateSceneBeatSlugs` above so the same authoring
 * rules apply to both scenes and dialogue trees (symmetric with
 * the runtime gate in `server/src/routes/dialogue-helpers.ts`).
 */
async function validateDialogueTreeBeatSlugs(filePath: string, data: any, errors: ValidationError[]) {
  const requiredBeat = data?.metadata?.required_story_beat;
  if (requiredBeat === undefined || requiredBeat === null) return;
  const validSlugs = await loadValidBeatSlugs();
  if (validSlugs === null) {
    errors.push({ file: filePath, message: 'Beat registry unavailable: required_story_beat cross-reference checks skipped', severity: 'warning' });
  } else if (validSlugs.size === 0) {
    errors.push({ file: filePath, message: 'Cannot validate required_story_beat on dialogue tree: story_beats registry is empty. Run story_beats.yaml migration first.', severity: 'warning' });
  } else {
    const slugsToCheck = Array.isArray(requiredBeat) ? requiredBeat : [requiredBeat];
    for (const slug of slugsToCheck) {
      if (typeof slug !== 'string') {
        errors.push({ file: filePath, message: `Invalid required_story_beat value on dialogue tree: expected string or string[], got ${typeof slug}`, severity: 'error' });
        continue;
      }
      if (!validSlugs.has(slug)) {
        errors.push({ file: filePath, message: `Unknown required_story_beat slug "${slug}" in dialogue tree — not in registry`, severity: 'error' });
      }
    }
  }
}

/**
 * M48 relationship-gate authoring checks (warnings, not hard errors).
 *  - romance raised without a `required_relationship` gate is a
 *    romance-without-gate risk (the romantic beat can surprise a player
 *    who never earned the relationship);
 *  - an entry node whose every choice carries a relationship gate can
 *    yield an empty choice list at filter time (fail-closed) — at least
 *    one ungated fallback must always remain;
 *  - a node that writes a `relationship_effect` but omits the
 *    `last_<slug>_encounter_at` bookkeeping loses re-engagement tracking.
 */
function validateRelationshipGates(
  filePath: string,
  data: any,
  warnings: string[]
) {
  const nodes = data?.nodes ?? {};
  const startNodeId = data?.start_node_id;

  for (const [nodeId, node] of Object.entries(nodes as Record<string, any>)) {
    const choices: any[] = node?.choices ?? [];

    for (const choice of choices) {
      const romanceDelta = choice?.effects?.relationship_effect?.romance
        ?? choice?.relationship_effect?.romance;
      const hasRequiredRel = !!choice?.required_relationship;
      const hasHiddenRel = !!choice?.hidden_if_relationship;
      if (
        typeof romanceDelta === 'number' &&
        romanceDelta !== 0 &&
        !hasRequiredRel &&
        !hasHiddenRel
      ) {
        warnings.push(
          `${filePath}: choice "${choice?.id}" on node "${nodeId}" raises romance (${romanceDelta}) ` +
          `without a required_relationship / hidden_if_relationship gate — romance-without-gate risk.`
        );
      }

      const relEffect = choice?.effects?.relationship_effect ?? choice?.relationship_effect;
      if (relEffect && relEffect !== true) {
        const stateSet = choice?.effects?.state_set ?? node?.effects?.state_set ?? {};
        const hasEncounterBookkeeping = Object.keys(stateSet ?? {}).some((k) =>
          k.startsWith('last_') && k.endsWith('_encounter_at')
        );
        if (!hasEncounterBookkeeping) {
          warnings.push(
            `${filePath}: node "${nodeId}" (choice "${choice?.id}") writes a relationship_effect ` +
            `but omits last_<slug>_encounter_at bookkeeping in state_set.`
          );
        }
      }
    }

    // Entry-node empty-list guard (only the tree's start node).
    if (nodeId === startNodeId && choices.length > 0) {
      const allGated = choices.every(
        (c) => c?.required_relationship || c?.hidden_if_relationship
      );
      if (allGated) {
        warnings.push(
          `${filePath}: entry node "${nodeId}" has a required_relationship/hidden_if_relationship ` +
          `on EVERY choice — filterChoices may return an empty list (fail-closed). Keep at least ` +
          `one ungated fallback.`
        );
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
      // Files whose path doesn't match a known content type (e.g. lore
      // reference files) are silently skipped — they aren't migrated.
      return { valid: true, errors: [], warnings: [] };
    }

    const validationResult = validateContentByType(contentType, data);
    errors.push(...validationResult.errors.map(e => ({ ...e, file: filePath })));
    warnings.push(...validationResult.warnings);

    const xssErrors = checkForXSS(data);
    errors.push(...xssErrors.map(e => ({ ...e, file: filePath })));

    await validateLorePaths(filePath, data, warnings);

    // Skip DB/Redis cross-reference checks in schema-only mode
    if (!schemaOnly) {
      const hasSchemaErrors = validationResult.errors.some(e => e.severity === 'error');
      if (!hasSchemaErrors) {
      if (contentType === 'dialogue') {
        await validateDialogueBeatSlugs(filePath, data, errors);
        await validateDialogueTreeBeatSlugs(filePath, data, errors);
        validateRelationshipGates(filePath, data, warnings);
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
