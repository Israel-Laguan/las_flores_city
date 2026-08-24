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

function resolveRoot(p) {
  return p.startsWith('/') ? p.replace(/\/$/, '') : `${process.cwd()}/${p}`.replace(/\/$/, '');
}

// Import detection accepts both single and double quotes (TypeScript allows
// either), and the scan includes .tsx files alongside .ts.
const WRITER_MODULE_RE = /from\s+['"][^'"]*StoryBuilderFileWriter(?:\.js)?['"]/;
const CANON_FNS = ['writePlanItems', 'updateExistingFile', 'applyLink'];
// Migration-entry invocation: an actual call expression, not a comment,
// string literal, unused import, or function *declaration*.
const MIGRATION_CALL_RE = /(?<!function\s)(?<!async\s)\b(?:migrateContent|migrateStagedPlan|executePlan|runSolidify)\s*\(/;

/**
 * Strip // line comments and block comments, and blank out the contents of
 * string literals, so identifiers inside comments or strings cannot satisfy
 * the migration-path check.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
    // Blank string-literal contents (single/double/template), keeping quotes.
    .replace(/'([^'\\\n]|\\.)*'/g, (m) => m.replace(/[^']/g, ' '))
    .replace(/"([^"\\\n]|\\.)*"/g, (m) => m.replace(/[^"]/g, ' '))
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => m.replace(/[^`]/g, ' '));
}

// Explicit registry: every writer call site is either inside the migration
// pipeline (mode 'pipeline') or restricted to non-canon sidecar artifacts.
export const REGISTRY = {
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
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function runGuard(root) {
  const SRC = join(root, 'server', 'src');
  const importers = [];
  const problems = [];

  function report(msg) {
    problems.push(msg);
  }

  for (const file of listTsFiles(SRC)) {
    const content = readFileSync(file, 'utf8');
    if (!WRITER_MODULE_RE.test(content)) continue;
    const rel = relative(SRC, file).split('\\').join('/');
    importers.push(rel);

    const entry = REGISTRY[rel];
    if (!entry) {
      report(`UNREGISTERED writer call site: server/src/${rel} — add it to REGISTRY in check-story-builder-writer-guard.mjs as 'pipeline' (migrates via migrateContent) or 'sidecar' (non-canon artifacts only).`);
      continue;
    }

    const code = stripComments(content);
    const usesCanon = CANON_FNS.some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(code));
    if (entry.mode === 'pipeline') {
      // A pipeline file must show a REACHABLE migration path: an actual call
      // expression of migrateContent (or a delegation entry that itself calls
      // it), after comment stripping. Comments, strings, and unused imports
      // do not count.
      if (!MIGRATION_CALL_RE.test(code)) {
        report(`PIPELINE file server/src/${rel} shows no reachable migrateContent/migrateStagedPlan call.`);
      }
    } else {
      if (usesCanon) {
        report(`SIDECAR file server/src/${rel} uses canon plan-writers (${CANON_FNS.join('/')}); only atomicWriteYaml is allowed outside the migration pipeline.`);
      }
    }
  }

  for (const key of Object.keys(REGISTRY)) {
    if (!importers.includes(key)) {
      if (!existsSync(join(SRC, key))) {
        report(`STALE registry entry: server/src/${key} no longer exists — remove it from the REGISTRY.`);
      } else {
        console.warn(`  note: registered file server/src/${key} no longer imports StoryBuilderFileWriter (registry entry can be retired).`);
      }
    }
  }

  return { ok: problems.length === 0, importers, problems };
}

// Main entry (skipped under `node --test` so the fixture suite can import this
// module without executing the real repo scan).
if (process.env.NODE_TEST_CONTEXT === undefined) {
  const root = process.argv[2] ? resolveRoot(process.argv[2]) : new URL('..', import.meta.url).pathname.replace(/\/$/, '');
  const result = runGuard(root);
  for (const problem of result.problems) console.error(`  ${problem}`);
  if (!result.ok) {
    console.error('\n✗ StoryBuilderFileWriter canon guard FAILED. Canon entity YAML must only be written inside the migration pipeline (stage → migrateContent → verify).');
    process.exit(1);
  } else {
    console.log(`✓ StoryBuilderFileWriter guard OK — ${result.importers.length} call site(s), all guarded (${Object.keys(REGISTRY).length} registered).`);
  }
}
