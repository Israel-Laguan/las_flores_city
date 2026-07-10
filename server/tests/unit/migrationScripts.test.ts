/**
 * Content Path Migration Scripts Tests
 *
 * Tests for migrate-content-paths.mjs, rollback-content-paths.mjs,
 * and generate-lore-stubs.mjs
 * Feature: story-builder-milestone-5
 *
 * SAFETY: These scripts previously ran against the *live* repository
 * (process.cwd() = project root), which meant a bug or an interrupted run
 * could mutate or delete real content and lore assets. They now honor the
 * CONTENT_MIGRATION_ROOT env var, so every test operates inside a throwaway
 * temp directory created under the OS temp dir. Nothing in this file touches
 * the real content/ or docs/ trees.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Real repo root — used ONLY to locate the scripts and node_modules.
// It is never used as the content/docs root the scripts operate on.
const REPO_ROOT = path.resolve(process.cwd(), '..');
const SCRIPTS_DIR = path.resolve(REPO_ROOT, 'scripts');

// Isolated sandbox root created per-test-file. All script I/O is confined here
// via the CONTENT_MIGRATION_ROOT env var.
let SANDBOX_ROOT: string;
let CONTENT_DIR: string;

// Helper to run a script against the sandbox root.
async function runScript(scriptName: string, args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  try {
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, ...args], {
      // cwd stays at the repo so Node resolves node_modules (glob, js-yaml),
      // but the script reads/writes only inside CONTENT_MIGRATION_ROOT.
      cwd: REPO_ROOT,
      env: { ...process.env, CONTENT_MIGRATION_ROOT: SANDBOX_ROOT },
      timeout: 30000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.code || 1,
    };
  }
}

// Helper to create a YAML file inside the sandbox content dir.
async function createYamlFile(relativePath: string, content: object): Promise<void> {
  const fullPath = path.join(CONTENT_DIR, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  let yaml = '';
  for (const [key, value] of Object.entries(content)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      yaml += `${key}:\n`;
      for (const [k2, v2] of Object.entries(value)) {
        yaml += `  ${k2}: "${v2}"\n`;
      }
    } else if (Array.isArray(value)) {
      yaml += `${key}:\n`;
      for (const item of value) {
        yaml += `  - "${item}"\n`;
      }
    } else {
      yaml += `${key}: "${value}"\n`;
    }
  }
  await fs.writeFile(fullPath, yaml, 'utf-8');
}

async function fileExists(fullPath: string): Promise<boolean> {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  SANDBOX_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-migration-scripts-'));
  CONTENT_DIR = path.join(SANDBOX_ROOT, 'content');
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  await fs.mkdir(path.join(SANDBOX_ROOT, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(SANDBOX_ROOT, 'docs', 'lore'), { recursive: true });
});

afterAll(async () => {
  // The sandbox lives entirely under the OS temp dir — safe to remove wholesale.
  if (SANDBOX_ROOT) {
    await fs.rm(SANDBOX_ROOT, { recursive: true, force: true });
  }
});

// Start each test from a clean content dir so counts/assertions are deterministic.
beforeEach(async () => {
  await fs.rm(CONTENT_DIR, { recursive: true, force: true });
  await fs.mkdir(CONTENT_DIR, { recursive: true });
});

describe('migrate-content-paths.mjs', () => {
  test('should add asset_paths to character', async () => {
    await createYamlFile('characters/char_test_character.yaml', {
      name: 'Test Character',
    });

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD UPDATE');
    expect(result.stdout).toContain('char_test_character.yaml');
  });

  test('should add asset_paths to scene', async () => {
    await createYamlFile('scenes/test_scene.yaml', {
      name: 'Test Scene',
    });

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD UPDATE');
  });

  test('should add asset_paths to location', async () => {
    await createYamlFile('locations/test_location.yaml', {
      name: 'Test Location',
    });

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD UPDATE');
  });

  test('should add asset_paths to overlay', async () => {
    await createYamlFile('overlays/test_overlay.yaml', {
      name: 'Test Overlay',
    });

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD UPDATE');
  });

  test('should skip files with YAML parse errors', async () => {
    await fs.mkdir(path.join(CONTENT_DIR, 'characters'), { recursive: true });
    await fs.writeFile(
      path.join(CONTENT_DIR, 'characters/char_invalid.yaml'),
      'name: "Test\n  invalid: yaml: content',
      'utf-8'
    );

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SKIP');
    expect(result.stdout).toContain('YAML parse error');
  });

  test('should skip non-object YAML files', async () => {
    await fs.mkdir(path.join(CONTENT_DIR, 'characters'), { recursive: true });
    await fs.writeFile(path.join(CONTENT_DIR, 'characters/char_string.yaml'), '"just a string"', 'utf-8');

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SKIP');
    expect(result.stdout).toContain('not a YAML object');
  });

  test('should skip files with unknown content type', async () => {
    await createYamlFile('unknown/something.yaml', {
      name: 'Unknown',
    });

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SKIP');
    expect(result.stdout).toContain('unknown content type');
  });

  test('should not overwrite existing fields', async () => {
    // Create character with all fields already present
    await createYamlFile('characters/char_with_all_fields.yaml', {
      name: 'With All Fields',
      lore_path: 'custom/path/to/lore.md',
      narrative_path: 'custom/path/to/narrative.md',
      asset_paths: {
        portrait: 'custom/portrait.png',
      },
    });

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    // Should not update since all fields already exist
    const lines = result.stdout.split('\n');
    const wouldUpdateLines = lines.filter(l => l.includes('WOULD UPDATE') && l.includes('char_with_all_fields'));
    expect(wouldUpdateLines.length).toBe(0);
  });

  test('should handle multiple content types in one run', async () => {
    await createYamlFile('characters/char_multi1.yaml', { name: 'Multi1' });
    await createYamlFile('scenes/scene_multi1.yaml', { name: 'Multi1' });
    await createYamlFile('locations/location_multi1.yaml', { name: 'Multi1' });

    const result = await runScript('migrate-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    // Should find at least our 3 test files
    expect(result.stdout).toContain('char_multi1.yaml');
    expect(result.stdout).toContain('scene_multi1.yaml');
    expect(result.stdout).toContain('location_multi1.yaml');
  });

  test('should write migration log', async () => {
    await createYamlFile('characters/char_log_test.yaml', { name: 'Log Test' });

    await runScript('migrate-content-paths.mjs', ['--dry-run']);

    // Log is written to <root>/scripts/migration-log.json — inside the sandbox.
    const logPath = path.join(SANDBOX_ROOT, 'scripts', 'migration-log.json');
    const logExists = await fileExists(logPath);
    expect(logExists).toBe(true);

    // Read and verify log structure
    const logContent = await fs.readFile(logPath, 'utf-8');
    const log = JSON.parse(logContent);
    expect(log).toHaveProperty('timestamp');
    expect(log).toHaveProperty('dryRun', true);
    expect(log).toHaveProperty('filesProcessed');
    expect(log).toHaveProperty('filesUpdated');
    expect(log).toHaveProperty('filesSkipped');
    expect(log).toHaveProperty('changes');
  });
});

describe('rollback-content-paths.mjs', () => {
  test('should remove lore_path from YAML file', async () => {
    const uniqueId = `rollback_${Date.now()}`;
    await createYamlFile('characters/char_rollback_test.yaml', {
      name: 'Rollback Test',
      lore_path: `docs/lore/figures/${uniqueId}/${uniqueId}.md`,
      narrative_path: `content/characters/${uniqueId}.md`,
    });

    const result = await runScript('rollback-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD ROLLBACK');
  });

  test('should remove narrative_path from YAML file', async () => {
    const uniqueId = `scene_rollback_${Date.now()}`;
    await createYamlFile('scenes/scene_rollback_test.yaml', {
      name: 'Rollback Test',
      narrative_path: `content/scenes/${uniqueId}.md`,
    });

    const result = await runScript('rollback-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD ROLLBACK');
  });

  test('should remove asset_paths from YAML file', async () => {
    await createYamlFile('characters/char_asset_rollback.yaml', {
      name: 'Asset Rollback',
      asset_paths: {
        portrait: 'characters/test/portrait.png',
      },
    });

    const result = await runScript('rollback-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD ROLLBACK');
  });

  test('should skip files without path fields', async () => {
    await createYamlFile('characters/char_no_paths.yaml', {
      name: 'No Paths',
      type: 'character',
    });

    const result = await runScript('rollback-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    // Should not show ROLLBACK for this file since it has no path fields
    const lines = result.stdout.split('\n');
    const rollbackLines = lines.filter(l => l.includes('WOULD ROLLBACK') && l.includes('char_no_paths'));
    expect(rollbackLines.length).toBe(0);
  });

  test('should handle YAML parse errors gracefully', async () => {
    await fs.mkdir(path.join(CONTENT_DIR, 'characters'), { recursive: true });
    await fs.writeFile(
      path.join(CONTENT_DIR, 'characters/char_invalid_rollback.yaml'),
      'invalid: yaml: content:',
      'utf-8'
    );

    const result = await runScript('rollback-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SKIP');
  });

  test('should process multiple files', async () => {
    const uniqueId = `multi_${Date.now()}`;
    await createYamlFile('characters/char_multi_rollback1.yaml', {
      name: 'Multi1',
      lore_path: `docs/lore/figures/${uniqueId}/${uniqueId}.md`,
    });
    await createYamlFile('scenes/scene_multi_rollback1.yaml', {
      name: 'Multi1',
      lore_path: `docs/lore/figures/${uniqueId}/${uniqueId}.md`,
    });

    const result = await runScript('rollback-content-paths.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('char_multi_rollback1.yaml');
    expect(result.stdout).toContain('scene_multi_rollback1.yaml');
  });
});

describe('generate-lore-stubs.mjs', () => {
  test('should create lore stub when file missing', async () => {
    const uniqueId = `test_${Date.now()}`;
    await createYamlFile('characters/char_stub_test.yaml', {
      name: 'Stub Test',
      lore_path: `docs/lore/figures/${uniqueId}/${uniqueId}.md`,
    });

    const result = await runScript('generate-lore-stubs.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD CREATE');
  });

  test('should create narrative stub when file missing', async () => {
    const uniqueId = `narrative_${Date.now()}`;
    await createYamlFile('characters/char_narrative_stub.yaml', {
      name: 'Narrative Stub',
      narrative_path: `content/characters/${uniqueId}.md`,
    });

    const result = await runScript('generate-lore-stubs.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WOULD CREATE');
  });

  test('should not create stub when file already exists', async () => {
    // Create the lore file first inside the sandbox with a unique name.
    const uniqueId = `existing_${Date.now()}`;
    const loreRel = `docs/lore/figures/${uniqueId}/${uniqueId}.md`;
    const loreDir = path.join(SANDBOX_ROOT, 'docs/lore/figures', uniqueId);
    await fs.mkdir(loreDir, { recursive: true });
    await fs.writeFile(path.join(loreDir, `${uniqueId}.md`), '# Existing');

    await createYamlFile('characters/char_existing_stub.yaml', {
      name: 'Existing Stub',
      lore_path: loreRel,
    });

    const result = await runScript('generate-lore-stubs.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    // Should not show WOULD CREATE since file exists
    const lines = result.stdout.split('\n');
    const createLines = lines.filter(l => l.includes('WOULD CREATE') && l.includes(uniqueId));
    expect(createLines.length).toBe(0);
  });

  test('should handle files without lore_path or narrative_path', async () => {
    await createYamlFile('characters/char_no_refs.yaml', {
      name: 'No Refs',
      // No lore_path or narrative_path
    });

    const result = await runScript('generate-lore-stubs.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Found');
    const lines = result.stdout.split('\n');
    const createLines = lines.filter(l => l.includes('WOULD CREATE') && l.includes('char_no_refs'));
    expect(createLines.length).toBe(0);
  });

  test('should handle YAML parse errors gracefully', async () => {
    await fs.mkdir(path.join(CONTENT_DIR, 'characters'), { recursive: true });
    await fs.writeFile(
      path.join(CONTENT_DIR, 'characters/char_invalid_stub.yaml'),
      'invalid: yaml: content:',
      'utf-8'
    );

    const result = await runScript('generate-lore-stubs.mjs', ['--dry-run']);

    expect(result.exitCode).toBe(0);
    // Should not crash
  });
});

describe('migration workflow integration', () => {
  test('full workflow: migrate -> generate stubs -> rollback', async () => {
    // Step 1: Create initial content
    await createYamlFile('characters/char_workflow_test.yaml', {
      name: 'Workflow Test',
    });

    // Step 2: Run migration (dry-run first)
    const dryResult = await runScript('migrate-content-paths.mjs', ['--dry-run']);
    expect(dryResult.exitCode).toBe(0);
    expect(dryResult.stdout).toContain('WOULD UPDATE');

    // Step 3: Run actual migration (writes only inside the sandbox)
    const migrateResult = await runScript('migrate-content-paths.mjs');
    expect(migrateResult.exitCode).toBe(0);

    // Step 4: Generate stubs for missing lore files
    const stubResult = await runScript('generate-lore-stubs.mjs');
    expect(stubResult.exitCode).toBe(0);

    // Step 5: Rollback
    const rollbackResult = await runScript('rollback-content-paths.mjs');
    expect(rollbackResult.exitCode).toBe(0);
  });

  test('migration is idempotent', async () => {
    await createYamlFile('characters/char_idempotent_test.yaml', {
      name: 'Idempotent Test',
    });

    // Run migration twice
    const result1 = await runScript('migrate-content-paths.mjs');
    expect(result1.exitCode).toBe(0);

    const result2 = await runScript('migrate-content-paths.mjs');
    expect(result2.exitCode).toBe(0);

    // Second run should not update (fields already present)
    expect(result2.stdout).not.toContain('UPDATED');
  });
});
