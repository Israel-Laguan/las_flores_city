#!/usr/bin/env node
/**
 * Content Path Migration Script
 *
 * Scans all YAML files in content/ and adds lore_path, narrative_path,
 * and asset_paths fields based on naming conventions. Only adds fields
 * where the target files already exist on disk.
 *
 * Usage:
 *   node scripts/migrate-content-paths.mjs [--dry-run]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';

const CONTENT_DIR = path.resolve(process.cwd(), 'content');
const LORE_DIR = path.resolve(process.cwd(), 'docs', 'lore');
const DRY_RUN = process.argv.includes('--dry-run');

const migrationLog = {
  timestamp: new Date().toISOString(),
  dryRun: DRY_RUN,
  filesProcessed: 0,
  filesUpdated: 0,
  filesSkipped: 0,
  changes: [],
};

function getContentTypeFromPath(filePath) {
  const normalized = filePath.toLowerCase();
  if (normalized.includes('/characters/')) return 'character';
  if (normalized.includes('/dialogues/')) return 'dialogue';
  if (normalized.includes('/scenes/')) return 'scene';
  if (normalized.includes('/missions/') || normalized.includes('/mysteries/')) return 'mission';
  if (normalized.includes('/locations/')) return 'location';
  if (normalized.includes('/stories/')) return 'story';
  if (normalized.includes('/overlays/')) return 'overlay';
  if (normalized.includes('/gigs/')) return 'gig';
  if (normalized.includes('/vault/')) return 'vault';
  if (normalized.includes('/shop/')) return 'shop_item';
  return null;
}

function deriveSlug(filePath, type) {
  const basename = path.basename(filePath, '.yaml');
  if (type === 'character') {
    return basename.replace(/^char_/, '');
  }
  return basename;
}

function shouldHaveLorePath(type) {
  return ['character', 'dialogue', 'mission', 'scene', 'location'].includes(type);
}

function shouldHaveNarrativePath(type) {
  return ['character', 'dialogue', 'scene', 'mission', 'location'].includes(type);
}

function shouldHaveAssetPaths(type) {
  return ['character', 'scene', 'location', 'overlay'].includes(type);
}

function deriveLorePath(type, slug) {
  if (type === 'character') {
    return `docs/lore/figures/${slug}/${slug}.md`;
  }
  return `docs/lore/${type}s/${slug}.md`;
}

function deriveNarrativePath(type, slug) {
  if (type === 'character') {
    return `content/characters/char_${slug}.md`;
  }
  return `content/${type}s/${slug}.md`;
}

function deriveAssetPaths(type, slug) {
  const paths = {};
  switch (type) {
    case 'character':
      paths.portrait = `characters/${slug}/portrait.png`;
      break;
    case 'scene':
      paths.background = `scenes/${slug}/background.jpg`;
      break;
    case 'location':
      paths.image = `locations/${slug}/image.jpg`;
      break;
    case 'overlay':
      paths.background = `overlays/${slug}/background.jpg`;
      break;
  }
  return paths;
}

async function fileExists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function migrateFile(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  const content = await fs.readFile(filePath, 'utf-8');
  let data;
  try {
    data = yaml.load(content);
  } catch {
    console.log(`  SKIP ${relativePath}: YAML parse error`);
    migrationLog.filesSkipped++;
    return;
  }

  if (!data || typeof data !== 'object') {
    console.log(`  SKIP ${relativePath}: not a YAML object`);
    migrationLog.filesSkipped++;
    return;
  }

  const type = getContentTypeFromPath(filePath);
  if (!type) {
    console.log(`  SKIP ${relativePath}: unknown content type`);
    migrationLog.filesSkipped++;
    return;
  }

  migrationLog.filesProcessed++;
  let updated = false;
  const slug = deriveSlug(filePath, type);

  // Add lore_path if missing and target file exists
  if (!data.lore_path && shouldHaveLorePath(type)) {
    const lorePath = deriveLorePath(type, slug);
    const fullLorePath = path.resolve(process.cwd(), lorePath);
    if (await fileExists(fullLorePath)) {
      data.lore_path = lorePath;
      updated = true;
      migrationLog.changes.push({ file: relativePath, field: 'lore_path', value: lorePath });
    }
  }

  // Add narrative_path if missing and target file exists
  if (!data.narrative_path && shouldHaveNarrativePath(type)) {
    const narrativePath = deriveNarrativePath(type, slug);
    const fullNarrativePath = path.resolve(process.cwd(), narrativePath);
    if (await fileExists(fullNarrativePath)) {
      data.narrative_path = narrativePath;
      updated = true;
      migrationLog.changes.push({ file: relativePath, field: 'narrative_path', value: narrativePath });
    }
  }

  // Add asset_paths if missing
  if (!data.asset_paths && shouldHaveAssetPaths(type)) {
    const assetPaths = deriveAssetPaths(type, slug);
    data.asset_paths = assetPaths;
    updated = true;
    migrationLog.changes.push({ file: relativePath, field: 'asset_paths', value: assetPaths });
  }

  if (updated) {
    if (!DRY_RUN) {
      const updatedYaml = yaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' });
      await fs.writeFile(filePath, updatedYaml, 'utf-8');
    }
    migrationLog.filesUpdated++;
    console.log(`  ${DRY_RUN ? 'WOULD UPDATE' : 'UPDATED'} ${relativePath}`);
  }
}

async function main() {
  console.log(`Content Path Migration${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`Scanning ${CONTENT_DIR}...`);

  const files = await glob(`${CONTENT_DIR}/**/*.yaml`, { absolute: true });
  console.log(`Found ${files.length} YAML files\n`);

  for (const file of files) {
    await migrateFile(file);
  }

  // Write migration log
  const logPath = path.resolve(process.cwd(), 'scripts', 'migration-log.json');
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, JSON.stringify(migrationLog, null, 2), 'utf-8');

  console.log(`\nMigration complete!`);
  console.log(`  Files processed: ${migrationLog.filesProcessed}`);
  console.log(`  Files updated:   ${migrationLog.filesUpdated}`);
  console.log(`  Files skipped:   ${migrationLog.filesSkipped}`);
  console.log(`  Total changes:   ${migrationLog.changes.length}`);
  console.log(`  Log written to:  ${logPath}`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
