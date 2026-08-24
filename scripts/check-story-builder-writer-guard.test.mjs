/**
 * Fixture suite for scripts/check-story-builder-writer-guard.mjs.
 *
 * Covers the detection rules with synthetic repo fixtures:
 *   - double-quoted StoryBuilderFileWriter imports are detected
 *   - .tsx importers are scanned (not just .ts)
 *   - a comment-only migrateContent reference does NOT satisfy the
 *     reachable-migration-call requirement for pipeline files
 *
 * Run: node --test scripts/check-story-builder-writer-guard.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripComments, runGuard, REGISTRY } from './check-story-builder-writer-guard.mjs';

function makeFakeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'writer-guard-'));
  mkdirSync(join(root, 'server', 'src', 'services'), { recursive: true });
  // Stub every real registry entry so its presence check passes; fixture
  // tests overwrite/extend as needed.
  for (const rel of Object.keys(REGISTRY)) {
    writeFile(root, rel, `// registry stub for ${rel}\nexport {};\n`);
  }
  return root;
}

function writeFile(root, rel, content) {
  const full = join(root, 'server', 'src', rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

// Register the fixture file so the pipeline checks exercise its logic.
const PIPELINE_REL = 'services/FakePipeline.ts';

describe('writer guard fixtures', () => {
  test('detects double-quoted writer imports and accepts real migrateContent call', () => {
    const root = makeFakeRepo();
    try {
      // Temporarily extend the registry for the fixture path.
      REGISTRY[PIPELINE_REL] = { mode: 'pipeline' };
      writeFile(
        root,
        PIPELINE_REL,
        [
          `import { writePlanItems } from "./StoryBuilderFileWriter.js";`,
          `import { migrateContent } from "../content/migrate.js";`,
          `export async function run() {`,
          `  await migrateContent("/tmp");`,
          `}`,
        ].join('\n'),
      );
      const result = runGuard(root);
      assert.deepEqual(result.problems, []);
      assert.ok(result.importers.includes(PIPELINE_REL));
    } finally {
      delete REGISTRY[PIPELINE_REL];
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('scans .tsx importers as unregistered call sites', () => {
    const root = makeFakeRepo();
    try {
      writeFile(
        root,
        'components/FakePanel.tsx',
        `import { atomicWriteYaml } from "../services/StoryBuilderFileWriter.js";\nexport {}`,
      );
      const result = runGuard(root);
      assert.equal(result.ok, false);
      assert.ok(result.problems.some((p) => p.includes('UNREGISTERED') && p.includes('FakePanel.tsx')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('comment-only migrateContent mention fails the pipeline check', () => {
    const root = makeFakeRepo();
    try {
      REGISTRY[PIPELINE_REL] = { mode: 'pipeline' };
      writeFile(
        root,
        PIPELINE_REL,
        [
          `import { applyLink } from './StoryBuilderFileWriter.js';`,
          `// TODO: wire this up to migrateContent soon.`,
          `/* migrateContent(contentDir) */`,
          `const hint = "call migrateContent() here";`,
          `export async function migrateContentUnused() {}`,
          `export async function run(link) { await applyLink(link); }`,
        ].join('\n'),
      );
      const result = runGuard(root);
      assert.equal(result.ok, false);
      assert.ok(result.problems.some((p) => p.includes('no reachable migrateContent')));
    } finally {
      delete REGISTRY[PIPELINE_REL];
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('stripComments removes line and block comments but keeps code', () => {
    const src = [
      `// migrateContent(fake)`,
      `/* migrateContent(also fake) */`,
      `await migrateContent(real);`,
    ].join('\n');
    const stripped = stripComments(src);
    assert.equal(/\bmigrateContent\s*\(/.test(stripped), true);
    assert.equal(stripped.includes('fake'), false);
  });

  test('function declarations do not count as migration calls', () => {
    const src = `export async function executePlan(plan) { return plan; }`;
    assert.equal(/(?<!function\s)(?<!async\s)\b(?:migrateContent|migrateStagedPlan|executePlan|runSolidify)\s*\(/.test(stripComments(src)), false);
  });
});
