#!/usr/bin/env node
/**
 * Content Path Rollback Script
 *
 * Reverts the content path migration by removing lore_path, narrative_path,
 * and asset_paths fields from all YAML files in content/.
 *
 * Usage:
 *   node scripts/rollback-content-paths.mjs [--dry-run]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';

// Project root. Defaults to the current working directory, but can be
// overridden (e.g. by tests) so the script never touches the live repo.
const ROOT = process.env.CONTENT_MIGRATION_ROOT || process.cwd();
const CONTENT_DIR = path.resolve(ROOT, 'content');
const FIELDS_TO_REMOVE = ['lore_path', 'narrative_path', 'asset_paths'];
const DRY_RUN = process.argv.includes('--dry-run');

let filesProcessed = 0;
let filesUpdated = 0;

async function rollbackFile(filePath) {
  const relativePath = path.relative(ROOT, filePath);
  const content = await fs.readFile(filePath, 'utf-8');
  let data;
  try {
    data = yaml.load(content);
  } catch {
    console.log(`  SKIP ${relativePath}: YAML parse error`);
    return;
  }

  if (!data || typeof data !== 'object') return;

  filesProcessed++;
  let updated = false;

  for (const field of FIELDS_TO_REMOVE) {
    if (field in data) {
      delete data[field];
      updated = true;
    }
  }

  if (updated) {
    if (!DRY_RUN) {
      const updatedYaml = yaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' });
      await fs.writeFile(filePath, updatedYaml, 'utf-8');
    }
    filesUpdated++;
    console.log(`  ${DRY_RUN ? 'WOULD ROLLBACK' : 'ROLLED BACK'} ${relativePath}`);
  }
}

async function main() {
  console.log(`Content Path Rollback${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`Scanning ${CONTENT_DIR}...`);

  const files = await glob(`${CONTENT_DIR}/**/*.yaml`, { absolute: true });
  console.log(`Found ${files.length} YAML files\n`);

  for (const file of files) {
    await rollbackFile(file);
  }

  console.log(`\nRollback complete!`);
  console.log(`  Files processed: ${filesProcessed}`);
  console.log(`  Files updated:   ${filesUpdated}`);
}

main().catch((err) => {
  console.error('Rollback failed:', err);
  process.exit(1);
});
