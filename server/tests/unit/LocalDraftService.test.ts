import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ContentPlanItem } from '@las-flores/shared';

// Mock generateImageBuffer so tests don't hit the network
jest.mock('../../src/services/AssetGenerationService.js', () => ({
  generateImageBuffer: jest.fn(async () => Buffer.from('fake-png-data'.repeat(100))),
  generateBaseImage: jest.fn(async () => Buffer.from('fake-png-data'.repeat(100))),
  fetchImageAsBase64: jest.fn(),
  generateVariantImage: jest.fn(),
}));

import {
  buildGeneratedAssetFilename,
  isValidAssetFilename,
  VALID_ASSET_EXTENSIONS,
  generateLocalDrafts,
  listLocalAssets,
  chooseDraft,
  resolveEntityRootDir,
  findNeedByPromptType,
  getAssetFieldName,
  parsePromptFile,
} from '../../src/services/LocalDraftService.js';

const TMP_BASE = path.join(os.tmpdir(), 'lf-draft-test-' + Date.now());

async function mkEntityDir(slug: string, withPrompt = true): Promise<string> {
  const dir = path.join(TMP_BASE, 'characters', slug);
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  if (withPrompt) {
    await fs.writeFile(path.join(dir, `${slug}.prompt.md`),
      '# Prompt: Test\n\n**Type:** portrait\n**Dimensions:** 832x1248\n\n## Prompt — Base\nA cyberpunk bartender.\n\n## Negative Prompt\nno robots, no guns\n');
  }
  return dir;
}

function mkItem(slug: string): ContentPlanItem {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    type: 'character',
    action: 'create',
    name: 'Test',
    slug,
    fields: { title: 'Test', description: 'Test desc' },
    assetNeeds: [
      { promptType: 'portrait', targetField: 'asset_paths.portrait', status: 'pending' },
    ],
    dependsOn: [],
  } as ContentPlanItem;
}

beforeAll(async () => {
  await fs.mkdir(TMP_BASE, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TMP_BASE, { recursive: true, force: true });
});

describe('buildGeneratedAssetFilename', () => {
  it('produces <slug>__<ISO-timestamp>.<ext>', () => {
    const name = buildGeneratedAssetFilename('aisha_al_sayed', '.png');
    expect(name).toMatch(/^aisha_al_sayed__\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/);
  });

  it('defaults to .png extension', () => {
    const name = buildGeneratedAssetFilename('diego');
    expect(name).toMatch(/\.png$/);
  });

  it('contains no colons (filesystem-safe)', () => {
    const name = buildGeneratedAssetFilename('test_slug', '.png');
    expect(name).not.toContain(':');
  });
});

describe('isValidAssetFilename', () => {
  it('accepts valid image extensions (case-insensitive)', () => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.PNG', '.JPG', '.JPEG']) {
      expect(isValidAssetFilename(`file${ext}`)).toBe(true);
    }
  });

  it('rejects non-image extensions', () => {
    for (const name of ['file.txt', 'file.json', 'file.md', 'file.yaml', 'file DS_Store', 'noext']) {
      expect(isValidAssetFilename(name)).toBe(false);
    }
  });

  it('rejects .DS_Store and hidden files', () => {
    expect(isValidAssetFilename('.DS_Store')).toBe(false);
    expect(isValidAssetFilename('.gitkeep')).toBe(false);
  });
});

describe('listLocalAssets', () => {
  it('returns [] for a non-existent assets/ folder (ENOENT)', async () => {
    const result = await listLocalAssets(path.join(TMP_BASE, 'nonexistent'));
    expect(result).toEqual([]);
  });

  it('lists every valid file including hand-dropped ones', async () => {
    const dir = await mkEntityDir('list_test');
    const assetsDir = path.join(dir, 'assets');
    // Pre-existing default
    await fs.writeFile(path.join(assetsDir, 'list_test__default.png'), Buffer.from('default'));
    // Generated draft
    await fs.writeFile(path.join(assetsDir, 'list_test__2026-07-15T01-30-12.png'), Buffer.from('draft1'));
    // Hand-dropped file (any name)
    await fs.writeFile(path.join(assetsDir, 'my_midjourney_render.jpg'), Buffer.from('hand'));
    // Invalid files (should be ignored)
    await fs.writeFile(path.join(assetsDir, 'notes.txt'), Buffer.from('notes'));
    await fs.writeFile(path.join(assetsDir, '.DS_Store'), Buffer.from('ds'));

    const result = await listLocalAssets(dir);
    expect(result).toHaveLength(3);
    // __default.png must be first (sorted)
    expect(result[0].filename).toBe('list_test__default.png');
    // All have valid extensions
    for (const entry of result) {
      expect(VALID_ASSET_EXTENSIONS).toContain(path.extname(entry.filename).toLowerCase());
    }
    // Hand-dropped file is included
    expect(result.map(r => r.filename)).toContain('my_midjourney_render.jpg');
  });

  it('sorts __default.png first, then by mtime newest-first', async () => {
    const dir = await mkEntityDir('sort_test');
    const assetsDir = path.join(dir, 'assets');
    await fs.writeFile(path.join(assetsDir, 'sort_test__default.png'), Buffer.from('def'));
    await fs.writeFile(path.join(assetsDir, 'sort_test__2026-07-15T01-30-00.png'), Buffer.from('old'));
    const newerPath = path.join(assetsDir, 'sort_test__2026-07-15T02-30-00.png');
    await fs.writeFile(newerPath, Buffer.from('new'));
    // Set newer mtime
    const future = new Date(Date.now() + 10000);
    await fs.utimes(newerPath, future, future);

    const result = await listLocalAssets(dir);
    expect(result[0].filename).toBe('sort_test__default.png');
    expect(result[1].filename).toBe('sort_test__2026-07-15T02-30-00.png');
  });
});

describe('generateLocalDrafts', () => {
  it('writes flat PNGs into assets/ with correct naming', async () => {
    const dir = await mkEntityDir('gen_test');
    const item = mkItem('gen_test');
    const files = await generateLocalDrafts(item, dir, 3);

    expect(files).toHaveLength(3);
    for (const f of files) {
      expect(f).toMatch(/^gen_test__\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/);
      const fullPath = path.join(dir, 'assets', f);
      const stat = await fs.stat(fullPath);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it('does NOT create sub-folders (flat layout)', async () => {
    const dir = await mkEntityDir('flat_test');
    const item = mkItem('flat_test');
    await generateLocalDrafts(item, dir, 2);

    const entries = await fs.readdir(path.join(dir, 'assets'), { withFileTypes: true });
    for (const e of entries) {
      expect(e.isFile()).toBe(true); // no directories
    }
  });
});

describe('parsePromptFile', () => {
  it('extracts type, dimensions, prompt, and negative prompt', async () => {
    const dir = await mkEntityDir('parse_test');
    const parsed = await parsePromptFile(path.join(dir, 'parse_test.prompt.md'));
    expect(parsed.assetType).toBe('portrait');
    expect(parsed.width).toBe(832);
    expect(parsed.height).toBe(1248);
    expect(parsed.prompt).toContain('cyberpunk bartender');
    expect(parsed.negativePrompt).toContain('no robots');
  });
});

describe('chooseDraft', () => {
  it('throws if the draft file does not exist', async () => {
    const dir = await mkEntityDir('choose_missing');
    const item = mkItem('choose_missing');
    await expect(chooseDraft(item, dir, 'nonexistent.png', TMP_BASE)).rejects.toThrow();
  });

  it('succeeds if the file exists and writes asset_paths to YAML', async () => {
    const slug = 'choose_ok';
    const dir = await mkEntityDir(slug);
    const item = mkItem(slug);
    (item.fields as any).asset_paths = { portrait: `${slug}__custom.png` };
    await fs.writeFile(path.join(dir, 'assets', `${slug}__custom.png`), Buffer.from('img'));

    await chooseDraft(item, dir, `${slug}__custom.png`, TMP_BASE);

    // Verify the YAML was written
    const yamlPath = path.join(TMP_BASE, 'characters', slug, `char_${slug}.yaml`);
    const content = await fs.readFile(yamlPath, 'utf-8');
    expect(content).toContain('asset_paths:');
    expect(content).toContain(`${slug}__custom.png`);
  });
});

describe('helper functions', () => {
  it('resolveEntityRootDir returns content/<type>/<slug>', () => {
    const item = mkItem('helper_test');
    const root = resolveEntityRootDir(item, '/content');
    expect(root).toBe(path.join('/content', 'characters', 'helper_test'));
  });

  it('findNeedByPromptType finds the matching need', () => {
    const item = mkItem('find_test');
    const need = findNeedByPromptType(item, 'portrait');
    expect(need).toBeDefined();
    expect(need?.promptType).toBe('portrait');
  });

  it('findNeedByPromptType returns undefined for unknown type', () => {
    const item = mkItem('find_test2');
    expect(findNeedByPromptType(item, 'nonexistent')).toBeUndefined();
  });

  it('getAssetFieldName extracts the field name from targetField', () => {
    const need = { promptType: 'portrait', targetField: 'asset_paths.portrait', status: 'pending' as const };
    expect(getAssetFieldName(need)).toBe('portrait');
  });
});
