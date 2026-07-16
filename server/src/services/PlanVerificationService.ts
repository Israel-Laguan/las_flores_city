import fs from 'node:fs/promises';
import path from 'node:path';
import type { ContentPlan, ContentPlanItem, VerificationReport, CheckResult } from '@las-flores/shared';
import { resolveFilePath } from './ContentSkeletonGenerator.js';
import { queryOLTP } from '../database/connection.js';


function yamlDir(item: ContentPlanItem, contentDir: string): string {
  return path.join(contentDir, path.dirname(resolveFilePath(item)));
}

/**
 * Resolve `child` (relative to `base`) and verify the result stays within
 * `base`. Returns null if the resolved path escapes the base directory
 * (e.g. via `..` segments), so callers can skip/flag unsafe references.
 */
function safeResolveWithin(base: string, child: string): string | null {
  const resolved = path.resolve(base, child);
  const normalizedBase = path.resolve(base);
  if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + path.sep)) {
    return null;
  }
  return resolved;
}

// ─── Check 1: lore_path resolution ──────────────────────────────────────────

async function checkLorePaths(items: ContentPlanItem[], contentDir: string): Promise<CheckResult> {
  const details: string[] = [];

  for (const item of items) {
    const lorePath = item.fields.lore_path;
    if (!lorePath || typeof lorePath !== 'string') continue;

    const fullPath = safeResolveWithin(yamlDir(item, contentDir), lorePath);
    if (fullPath === null) {
      details.push(`${item.name}: lore_path "${lorePath}" escapes content directory`);
      continue;
    }
    try {
      await fs.access(fullPath);
    } catch {
      details.push(`${item.name}: lore_path "${lorePath}" not found`);
    }
  }

  return {
    name: 'lore-path-resolution',
    description: 'All lore_path references point to existing files on disk.',
    status: details.length === 0 ? 'pass' : 'fail',
    details: details.length > 0 ? details : undefined,
  };
}

// ─── Check 2: narrative_path resolution ─────────────────────────────────────

async function checkNarrativePaths(items: ContentPlanItem[], contentDir: string): Promise<CheckResult> {
  const details: string[] = [];

  for (const item of items) {
    const narrativePath = item.fields.narrative_path;
    if (!narrativePath || typeof narrativePath !== 'string') continue;

    const fullPath = safeResolveWithin(yamlDir(item, contentDir), narrativePath);
    if (fullPath === null) {
      details.push(`${item.name}: narrative_path "${narrativePath}" escapes content directory`);
      continue;
    }
    try {
      await fs.access(fullPath);
    } catch {
      details.push(`${item.name}: narrative_path "${narrativePath}" not found`);
    }
  }

  return {
    name: 'narrative-path-resolution',
    description: 'All narrative_path references point to existing files on disk.',
    status: details.length === 0 ? 'pass' : 'fail',
    details: details.length > 0 ? details : undefined,
  };
}

// ─── Check 3: asset_path resolution ─────────────────────────────────────────

async function checkAssetPaths(items: ContentPlanItem[], contentDir: string): Promise<CheckResult> {
  const details: string[] = [];

  for (const item of items) {
    const assetPaths = item.fields.asset_paths;
    if (!assetPaths || typeof assetPaths !== 'object') continue;

    for (const [field, filename] of Object.entries(assetPaths)) {
      if (typeof filename !== 'string' || !filename) continue;

      const fullPath = safeResolveWithin(path.join(yamlDir(item, contentDir), 'assets'), filename);
      if (fullPath === null) {
        details.push(`${item.name}.${field}: asset "${filename}" escapes assets directory`);
        continue;
      }
      try {
        await fs.access(fullPath);
      } catch {
        details.push(`${item.name}.${field}: asset "${filename}" not found in assets/`);
      }
    }
  }

  return {
    name: 'asset-path-resolution',
    description: 'Referenced asset files exist in assets/ subdirectory.',
    status: details.length === 0 ? 'pass' : 'warn',
    details: details.length > 0 ? details : undefined,
  };
}

async function checkTableFks(
  ids: Set<string>,
  table: string,
  label: string,
  details: string[],
  uuidRegex?: RegExp,
): Promise<void> {
  if (ids.size === 0) return;

  let toCheck = [...ids];
  if (uuidRegex) {
    toCheck = toCheck.filter(id => {
      if (uuidRegex.test(id)) return true;
      details.push(`Invalid UUID format: ${label} reference "${id}" is not a valid UUID`);
      return false;
    });
  }
  if (toCheck.length === 0) return;

  const result = await queryOLTP<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = ANY($1::uuid[])`,
    [toCheck],
  );
  const found = new Set(result.rows.map(r => r.id));
  for (const id of toCheck) {
    if (!found.has(id)) {
      details.push(`Missing FK: ${label} "${id}" does not exist`);
    }
  }
}

// ─── Check 4: FK integrity ──────────────────────────────────────────────────

async function checkForeignKeyIntegrity(items: ContentPlanItem[]): Promise<CheckResult> {
  const details: string[] = [];

  // Collect all UUIDs per target table
  const dialogueTreeIds = new Set<string>();
  const characterIds = new Set<string>();
  const mysteryIds = new Set<string>();
  const sceneIds = new Set<string>();

  for (const item of items) {
    if (item.type === 'scene') {
      const dialogues = item.fields.available_dialogues;
      if (Array.isArray(dialogues)) {
        for (const id of dialogues) {
          if (typeof id === 'string' && id.length > 0) dialogueTreeIds.add(id);
        }
      }
      const npcs = item.fields.metadata?.npcs;
      if (Array.isArray(npcs)) {
        for (const id of npcs) {
          if (typeof id === 'string' && id.length > 0) characterIds.add(id);
        }
      }
    }
    if (item.type === 'overlay') {
      const treeId = item.fields.target_tree_id;
      if (typeof treeId === 'string' && treeId.length > 0) dialogueTreeIds.add(treeId);
      const missionId = item.fields.mission_id;
      if (typeof missionId === 'string' && missionId.length > 0) mysteryIds.add(missionId);
    }
    if (item.type === 'vault') {
      const missionId = item.fields.mission_id;
      if (typeof missionId === 'string' && missionId.length > 0) mysteryIds.add(missionId);
    }
    if (item.type === 'story') {
      const missionId = item.fields.mission_id;
      if (typeof missionId === 'string' && missionId.length > 0) mysteryIds.add(missionId);
    }
    if (item.type === 'gig') {
      const locationId = item.fields.location_restriction_id;
      if (typeof locationId === 'string' && locationId.length > 0) sceneIds.add(locationId);
    }
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Batch-check each table
  await checkTableFks(
    dialogueTreeIds,
    'dialogue_trees',
    'dialogue_tree',
    details,
    UUID_REGEX,
  );
  await checkTableFks(characterIds, 'characters', 'character', details, UUID_REGEX);
  await checkTableFks(mysteryIds, 'mysteries', 'mystery', details, UUID_REGEX);
  await checkTableFks(sceneIds, 'scenes', 'scene', details, UUID_REGEX);

  return {
    name: 'fk-integrity',
    description: 'All FK references in migrated data resolve to existing rows.',
    status: details.length === 0 ? 'pass' : 'fail',
    details: details.length > 0 ? details : undefined,
  };
}

// ─── Check 5: story beat references ─────────────────────────────────────────

async function checkStoryBeatReferences(items: ContentPlanItem[]): Promise<CheckResult> {
  const details: string[] = [];
  const beatSlugs = new Set<string>();

  for (const item of items) {
    if (item.type === 'story' && Array.isArray(item.fields.beats)) {
      for (const slug of item.fields.beats) {
        if (typeof slug === 'string' && slug.length > 0) beatSlugs.add(slug);
      }
    }
  }

  if (beatSlugs.size === 0) {
    return {
      name: 'story-beat-references',
      description: 'Story beat slugs reference existing beats.',
      status: 'pass',
    };
  }

  const slugs = [...beatSlugs];
  const result = await queryOLTP<{ slug: string }>(
    'SELECT slug FROM story_beats WHERE slug = ANY($1::text[])',
    [slugs],
  );
  const found = new Set(result.rows.map(r => r.slug));
  for (const slug of slugs) {
    if (!found.has(slug)) {
      details.push(`Missing story beat: slug "${slug}" does not exist in story_beats`);
    }
  }

  return {
    name: 'story-beat-references',
    description: 'Story beat slugs reference existing beats.',
    status: details.length === 0 ? 'pass' : 'fail',
    details: details.length > 0 ? details : undefined,
  };
}

// ─── Check 6: cross-plan consistency ────────────────────────────────────────

function checkCrossPlanConsistency(plan: ContentPlan): CheckResult {
  const details: string[] = [];
  const itemIds = new Set(plan.items.map(i => i.id));

  // Check dependsOn references
  for (const item of plan.items) {
    for (const depId of item.dependsOn) {
      if (!itemIds.has(depId)) {
        details.push(`${item.name}: dependsOn "${depId}" references non-existent item in plan`);
      }
    }
  }

  // Check link references
  for (const link of plan.links) {
    if (!itemIds.has(link.fromItem)) {
      details.push(`Link: fromItem "${link.fromItem}" references non-existent item in plan`);
    }
    if (!itemIds.has(link.toItem)) {
      details.push(`Link: toItem "${link.toItem}" references non-existent item in plan`);
    }
  }

  return {
    name: 'cross-plan-consistency',
    description: 'Internal plan references (dependsOn, links) are self-consistent.',
    status: details.length === 0 ? 'pass' : 'fail',
    details: details.length > 0 ? details : undefined,
  };
}

// ─── Check 7: asset need status sanity ──────────────────────────────────────

function checkAssetNeedStatus(items: ContentPlanItem[]): CheckResult {
  const details: string[] = [];

  for (const item of items) {
    for (const need of item.assetNeeds) {
      if (need.status === 'failed') {
        details.push(`${item.name}: asset need "${need.promptType}" has status "failed"`);
      } else if (need.status === 'pending') {
        details.push(`${item.name}: asset need "${need.promptType}" is still pending`);
      }
    }
  }

  const hasFailed = details.some(d => d.includes('"failed"'));
  const status = hasFailed ? 'fail' : details.length > 0 ? 'warn' : 'pass';

  return {
    name: 'asset-need-status',
    description: 'Asset generation statuses are sane.',
    status,
    details: details.length > 0 ? details : undefined,
  };
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function verifyPlanCrossReferences(
  plan: ContentPlan,
  contentDir: string,
): Promise<VerificationReport> {
  const checks: CheckResult[] = [];

  checks.push(await checkLorePaths(plan.items, contentDir));
  checks.push(await checkNarrativePaths(plan.items, contentDir));
  checks.push(await checkAssetPaths(plan.items, contentDir));
  checks.push(await checkForeignKeyIntegrity(plan.items));
  checks.push(await checkStoryBeatReferences(plan.items));
  checks.push(checkCrossPlanConsistency(plan));
  checks.push(checkAssetNeedStatus(plan.items));

  const errors = checks
    .filter(c => c.status === 'fail')
    .flatMap(c => c.details ?? [`${c.name}: failed`]);

  const warnings = checks
    .filter(c => c.status === 'warn')
    .flatMap(c => c.details ?? [`${c.name}: warning`]);

  return {
    planId: plan.id,
    checkedAt: new Date().toISOString(),
    passed: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}
