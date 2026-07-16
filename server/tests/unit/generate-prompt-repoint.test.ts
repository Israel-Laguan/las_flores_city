import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/asset-pipeline/scripts/generate-prompt.mjs');
const TMP_BASE = path.join(os.tmpdir(), 'lf-repoint-test-' + Date.now());

beforeAll(async () => {
  await fs.mkdir(TMP_BASE, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TMP_BASE, { recursive: true, force: true });
});

describe('generate-prompt.mjs repoint', () => {
  it('contains no docs/lore/figures or docs/lore/landmarks references', async () => {
    const source = await fs.readFile(SCRIPT_PATH, 'utf-8');
    expect(source).not.toMatch(/docs\/lore\/figures/);
    expect(source).not.toMatch(/docs\/lore\/landmarks/);
  });

  it('writes character sheet .prompt.md into content/characters/<slug>/', async () => {
    const slug = 'repoint_test_char';
    // The script uses path.resolve('content/characters', slug) relative to CWD,
    // so set up the entity inside a CWD that has content/characters/<slug>.
    const cwd = path.join(TMP_BASE, 'cwd_char');
    const entityDir = path.join(cwd, 'content', 'characters', slug);
    await fs.mkdir(entityDir, { recursive: true });

    const yamlContent = [
      `name: Repoint Test Character`,
      `occupation: Street Vendor`,
      `district: Centro`,
      `description: A test character for repoint verification.`,
    ].join('\n');
    const yamlPath = path.join(entityDir, `char_${slug}.yaml`);
    await fs.writeFile(yamlPath, yamlContent, 'utf-8');

    // Pass relative source path so the script resolves it from CWD
    const relSource = path.relative(cwd, yamlPath);
    const { stdout } = await execFileAsync('node', [SCRIPT_PATH, '--type', 'character-sheet', '--source', relSource, '--force'], {
      cwd,
      timeout: 30000,
    });

    expect(stdout).toMatch(/✅ Created/);

    const promptFiles = await fs.readdir(entityDir);
    const promptMd = promptFiles.filter(f => f.endsWith('.prompt.md'));
    expect(promptMd.length).toBeGreaterThanOrEqual(1);

    for (const f of promptMd) {
      expect(path.join(entityDir, f)).not.toMatch(/docs\/lore/);
    }
  });

  it('writes biometric .prompt.md into content/characters/<slug>/', async () => {
    const slug = 'repoint_test_bio';
    const cwd = path.join(TMP_BASE, 'cwd_bio');
    const entityDir = path.join(cwd, 'content', 'characters', slug);
    await fs.mkdir(entityDir, { recursive: true });

    const yamlContent = [
      `name: Repoint Bio Character`,
      `occupation: Hacker`,
      `district: Barrio Alto`,
      `description: A biometric test character.`,
    ].join('\n');
    const yamlPath = path.join(entityDir, `char_${slug}.yaml`);
    await fs.writeFile(yamlPath, yamlContent, 'utf-8');

    const relSource = path.relative(cwd, yamlPath);
    const { stdout } = await execFileAsync('node', [SCRIPT_PATH, '--type', 'biometric', '--source', relSource, '--force'], {
      cwd,
      timeout: 30000,
    });

    expect(stdout).toMatch(/✅ Created/);

    const promptFiles = await fs.readdir(entityDir);
    const bioPrompt = promptFiles.filter(f => f.includes('_biometric.prompt.md'));
    expect(bioPrompt.length).toBe(1);
  });

  it('writes location map .prompt.md into content/locations/<slug>/', async () => {
    const slug = 'repoint_test_loc';
    const cwd = path.join(TMP_BASE, 'cwd_loc');
    const entityDir = path.join(cwd, 'content', 'locations', slug);
    await fs.mkdir(entityDir, { recursive: true });

    const yamlContent = [
      `name: Repoint Test Location`,
      `district: Centro`,
      `description: A test location for repoint verification.`,
    ].join('\n');
    const yamlPath = path.join(entityDir, `location_${slug}.yaml`);
    await fs.writeFile(yamlPath, yamlContent, 'utf-8');

    const relSource = path.relative(cwd, yamlPath);
    const { stdout } = await execFileAsync('node', [SCRIPT_PATH, '--type', 'location-map', '--source', relSource, '--force'], {
      cwd,
      timeout: 30000,
    });

    expect(stdout).toMatch(/✅ Created/);

    const promptFiles = await fs.readdir(entityDir);
    const mapPrompt = promptFiles.filter(f => f.endsWith('.map.md'));
    expect(mapPrompt.length).toBe(1);

    for (const f of mapPrompt) {
      expect(path.join(entityDir, f)).not.toMatch(/docs\/lore/);
    }
  });
});
