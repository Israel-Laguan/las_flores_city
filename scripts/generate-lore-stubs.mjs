#!/usr/bin/env node
/**
 * Lore Stub Generator
 *
 * Scans all YAML files in content/ and creates empty stub files for
 * any lore_path or narrative_path that references a missing file.
 *
 * Usage:
 *   node scripts/generate-lore-stubs.mjs [--dry-run]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';

// Project root. Defaults to the current working directory, but can be
// overridden (e.g. by tests) so the script never touches the live repo.
const ROOT = process.env.CONTENT_MIGRATION_ROOT || process.cwd();
const CONTENT_DIR = path.resolve(ROOT, 'content');
const DRY_RUN = process.argv.includes('--dry-run');

let stubsCreated = 0;

async function fileExists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function createStubIfMissing(fullPath, stubContent) {
  if (await fileExists(fullPath)) return false;
  if (DRY_RUN) {
    console.log(`  WOULD CREATE ${path.relative(ROOT, fullPath)}`);
    stubsCreated++;
    return true;
  }
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, stubContent, 'utf-8');
  stubsCreated++;
  return true;
}

async function processFile(filePath) {
  const relativePath = path.relative(ROOT, filePath);
  const content = await fs.readFile(filePath, 'utf-8');
  let data;
  try {
    data = yaml.load(content);
  } catch {
    return;
  }

  if (!data || typeof data !== 'object') return;

  const name = data.name || 'Untitled';

  // Check lore_path
  if (data.lore_path && typeof data.lore_path === 'string') {
    const fullPath = path.resolve(ROOT, data.lore_path);
    const stub = `# ${name}\n\n> TODO: Add lore for ${name}\n`;
    if (await createStubIfMissing(fullPath, stub)) {
      console.log(`  Created lore stub: ${data.lore_path}`);
    }
  }

  // Check narrative_path
  if (data.narrative_path && typeof data.narrative_path === 'string') {
    const fullPath = path.resolve(ROOT, data.narrative_path);
    const stub = `# ${name}\n\n> TODO: Add narrative for ${name}\n`;
    if (await createStubIfMissing(fullPath, stub)) {
      console.log(`  Created narrative stub: ${data.narrative_path}`);
    }
  }
}

async function main() {
  console.log(`Lore Stub Generator${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`Scanning ${CONTENT_DIR}...`);

  const files = await glob(`${CONTENT_DIR}/**/*.yaml`, { absolute: true });
  console.log(`Found ${files.length} YAML files\n`);

  for (const file of files) {
    await processFile(file);
  }

  console.log(`\nStub generation complete!`);
  console.log(`  Stubs created: ${stubsCreated}`);
}

main().catch((err) => {
  console.error('Stub generation failed:', err);
  process.exit(1);
});
