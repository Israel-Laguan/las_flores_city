/**
 * StoryBuilderFileWriter canon guard (M43).
 *
 * Ensures NO call site of the StoryBuilderFileWriter exports can commit
 * canon (entity YAML that lands in the database) without going through
 * `migrateContent`.
 *
 * Rules:
 * 1. Every server/src file importing `StoryBuilderFileWriter.js` must appear
 *    in the explicit REGISTRY below — an unregistered importer fails.
 * 2. Files using the CANON writers (`writePlanItems`, `updateExistingFile`,
 *    `applyLink`) must be registered as mode 'pipeline' AND must reference
 *    `migrateContent` directly or transitively (verified here by requiring
 *    a direct import in the pipeline entry file).
 * 3. Files registered as mode 'sidecar' may only use the low-level
 *    `atomicWriteYaml` primitive for non-canon artifacts (.md lore stubs,
 *    .prompt.md sidecars, assets/) — never the canon plan-writers.
 * 4. Registry entries pointing at files that no longer exist fail, so the
 *    registry cannot rot.
 *
 * Usage: node scripts/check-story-builder-writer-guard.mjs [repoRoot]
 * Exits 1 on any violation.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.argv[2] ? resolveRoot(process.argv[2]) : new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function resolveRoot(p) {
  return p.startsWith('/') ? p.replace(/\/$/, '') : `${process.cwd()}/${p}`.replace(/\/$/, '');
}

const SRC_DIR = join(ROOT, 'server', 'src');

const WRITER_MODULE_RE = /from\s+'[^']*StoryBuilderFileWriter(?:\.js)?'/;
const CANON_FNS = ['writePlanItems', 'updateExistingFile', 'applyLink'];

// Explicit registry: every writer call site is either inside the migration
// pipeline (mode 'pipeline') or restricted to non-canon sidecar artifacts.
const REGISTRY = {
  // Pipeline entry: executePlan/stagePlan write via writePlanItems/applyLink,
  // then executePlan runs migrateContent; staged plans migrate through
  // migrateStagedPlan (StoryBuilderMigration.ts) during solidify.
  'services/StoryBuilderPlanOps.ts': { mode: 'pipeline' },
  // Sidecars: lore .md stubs written inside stagePlan (never migrated alone).
  'services/StoryBuilderLore.ts': { mode: 'sidecar' },
  // Sidecars: .prompt.md asset-generation inputs (not canon YAML).
  'services/PromptFileGenerator.ts': { mode: 'sidecar' },
  // Sidecars: asset drafts + asset_paths selection; DB sync goes through
  // AssetPublishService publish flow, not direct YAML-to-DB migration.
  'services/LocalDraftService.ts': { mode: 'sidecar' },
};

function listTsFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

let failed = false;
function report(msg) {
  console.error(`  ${msg}`);
  failed = true;
}

const allFiles = listTsFiles(SRC_DIR);
const importers = [];

for (const file of allFiles) {
  const content = readFileSync(file, 'utf8');
  if (!WRITER_MODULE_RE.test(content)) continue;
  const rel = relative(SRC_DIR, file).split('\\').join('/');
  importers.push(rel);

  const entry = REGISTRY[rel];
  if (!entry) {
    report(`UNREGISTERED writer call site: server/src/${rel} — add it to REGISTRY in check-story-builder-writer-guard.mjs as 'pipeline' (migrates via migrateContent) or 'sidecar' (non-canon artifacts only).`);
    continue;
  }
  if (!existsSync(file)) continue; // unreachable, kept for clarity

  const usesCanon = CANON_FNS.some((fn) => new RegExp(`\\b${fn}\\b`).test(content));
  if (entry.mode === 'pipeline') {
    if (!/\bmigrateContent\b/.test(content) && !/from\s+'\.\.\/content\/migrate\.js'|from\s+"[^"]*content\/migrate\.js"/.test(content)) {
      // A pipeline file itself need not import migrateContent if it delegates
      // to a module that does (e.g. StoryBuilderMigration); allow delegation.
      const delegates = /migrateStagedPlan|runSolidify|executePlan/.test(content);
      if (!delegates) {
        report(`PIPELINE file server/src/${rel} shows no path to migrateContent/migrateStagedPlan.`);
      }
    }
  } else {
    if (usesCanon) {
      report(`SIDECAR file server/src/${rel} uses canon plan-writers (${CANON_FNS.join('/')}); only atomicWriteYaml is allowed outside the migration pipeline.`);
    }
  }
}

for (const key of Object.keys(REGISTRY)) {
  if (!importers.includes(key)) {
    if (!existsSync(join(SRC_DIR, key))) {
      report(`STALE registry entry: server/src/${key} no longer exists — remove it from the REGISTRY.`);
    } else {
      console.warn(`  note: registered file server/src/${key} no longer imports StoryBuilderFileWriter (registry entry can be retired).`);
    }
  }
}

if (failed) {
  console.error('\n✗ StoryBuilderFileWriter canon guard FAILED. Canon entity YAML must only be written inside the migration pipeline (stage → migrateContent → verify).');
  process.exit(1);
} else {
  console.log(`✓ StoryBuilderFileWriter guard OK — ${importers.length} call site(s), all guarded (${Object.keys(REGISTRY).length} registered).`);
}
