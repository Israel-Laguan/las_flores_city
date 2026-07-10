#!/usr/bin/env node
/**
 * Content Path Migration Runner
 *
 * Orchestrates the full migration workflow:
 * 1. Runs the migration script
 * 2. Generates stubs for missing files
 * 3. Reports results
 *
 * Usage:
 *   node scripts/run-migration.mjs [--dry-run]
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const DRY_RUN = process.argv.includes('--dry-run');
const SCRIPTS_DIR = path.resolve(process.cwd(), 'scripts');

async function runStep(label, script) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Step: ${label}`);
  console.log('='.repeat(60));

  const cmd = `node ${path.join(SCRIPTS_DIR, script)}${DRY_RUN ? ' --dry-run' : ''}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    return true;
  } catch (err) {
    console.error(`Failed: ${label}`);
    return false;
  }
}

async function main() {
  console.log('Content Path Migration Runner');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no files modified)' : 'LIVE'}`);
  console.log(`Working directory: ${process.cwd()}`);

  // Step 1: Run migration
  const migrationOk = await runStep('Add path fields to YAML files', 'migrate-content-paths.mjs');
  if (!migrationOk) {
    console.error('\nMigration failed. Aborting.');
    process.exit(1);
  }

  // Step 2: Generate stubs for missing files
  const stubsOk = await runStep('Generate lore/narrative stubs', 'generate-lore-stubs.mjs');
  if (!stubsOk) {
    console.error('\nStub generation failed. Aborting.');
    process.exit(1);
  }

  // Step 3: Report
  console.log(`\n${'='.repeat(60)}`);
  console.log('Migration complete!');
  console.log('='.repeat(60));

  // Read the migration log
  try {
    const logContent = await fs.readFile(path.join(SCRIPTS_DIR, 'migration-log.json'), 'utf-8');
    const log = JSON.parse(logContent);
    console.log(`\nMigration log summary:`);
    console.log(`  Files processed: ${log.filesProcessed}`);
    console.log(`  Files updated:   ${log.filesUpdated}`);
    console.log(`  Total changes:   ${log.changes.length}`);
  } catch {
    // Log file may not exist in dry-run mode
  }

  console.log('\nNext steps:');
  console.log('  1. Review changes: git diff content/');
  console.log('  2. Run validation: npm run validate:content');
  console.log('  3. Test in admin UI: npm run dev');
}

main().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
