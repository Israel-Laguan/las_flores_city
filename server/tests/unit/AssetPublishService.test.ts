/**
 * Unit tests for AssetPublishService.publishChosenDrafts (Milestone 04).
 *
 * Mocks: StorageService.uploadToMinio (records the object key + preserves the
 * local filename) and queryOLTP (loads/updates plan_json). Uses a temp
 * `content/` tree with a staged YAML that publishChosenDrafts reads back to
 * append the `label:'dev'` cascade entry.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import yaml from 'js-yaml';

const mockUploadToMinio = jest.fn().mockImplementation(async (buf: Buffer, key: string) => {
  return `https://minio.test/${key}`;
});
const mockQueryOLTP = jest.fn();

jest.doMock('../../src/services/StorageService.js', () => ({
  uploadToMinio: mockUploadToMinio,
  default: { uploadToMinio: mockUploadToMinio },
}));
jest.doMock('../../src/database/connection.js', () => ({
  queryOLTP: (...args: any[]) => mockQueryOLTP(...args),
}));

let publishChosenDrafts: typeof import('../../src/services/AssetPublishService.js').publishChosenDrafts;

const TEST_PLAN_ID = '00000000-0000-0000-0000-000000000001';

function makePlan(): any {
  return {
    id: TEST_PLAN_ID,
    description: 'Add Diego',
    items: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        type: 'character',
        action: 'create',
        name: 'Diego',
        slug: 'diego',
        description: 'Bartender',
        fields: { asset_paths: { portrait: 'diego__chosen.png' } },
        assetNeeds: [
          {
            promptType: 'portrait',
            targetField: 'portrait_urls[0].url',
            status: 'chosen',
          },
        ],
        dependsOn: [],
        links: [],
      },
    ],
    links: [],
    status: 'approved',
  };
}

describe('AssetPublishService', () => {
  let tmpDir: string;

  beforeAll(async () => {
    const mod = await import('../../src/services/AssetPublishService.js');
    publishChosenDrafts = mod.publishChosenDrafts;
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-publish-test-'));
    jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const entityDir = path.join(tmpDir, 'content', 'characters', 'diego');
    await fs.mkdir(path.join(entityDir, 'assets'), { recursive: true });
    await fs.writeFile(path.join(entityDir, 'assets', 'diego__chosen.png'), 'PNGDATA');
    // Staged YAML as stagePlan() would have written it.
    await fs.writeFile(
      path.join(entityDir, 'char_diego.yaml'),
      yaml.dump({
        id: 'item-00000000-0000-0000-0000-000000000002',
        name: 'Diego',
        title: 'Bartender',
        description: 'Bartender',
        asset_paths: { portrait: 'diego__chosen.png' },
        lore_path: 'diego.md',
      }),
      'utf-8',
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    mockUploadToMinio.mockClear();
    mockQueryOLTP.mockReset();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uploads each chosen draft to MinIO with the local filename preserved in the key', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ plan_json: makePlan() }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });

    const result = await publishChosenDrafts(TEST_PLAN_ID);

    expect(result.success).toBe(true);
    expect(result.published).toHaveLength(1);
    expect(mockUploadToMinio).toHaveBeenCalledTimes(1);
    // Object key preserves the local filename; no `.dev` suffix.
    expect(mockUploadToMinio).toHaveBeenCalledWith(expect.any(Buffer), 'portrait/diego__chosen.png', 'image/png');
    expect(result.published[0].url).toBe('https://minio.test/portrait/diego__chosen.png');
  });

  it('appends a label:"dev" entry to the staged YAML portrait_urls', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ plan_json: makePlan() }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });

    await publishChosenDrafts(TEST_PLAN_ID);

    const yamlPath = path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml');
    const data = yaml.load(await fs.readFile(yamlPath, 'utf-8')) as any;
    expect(Array.isArray(data.portrait_urls)).toBe(true);
    expect(data.portrait_urls).toEqual([
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'dev' },
    ]);
    // The local filename is NOT rewritten into the YAML's asset_paths.
    expect(data.asset_paths.portrait).toBe('diego__chosen.png');
  });

  it('marks the AssetNeed status as published in the persisted plan_json', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ plan_json: makePlan() }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
    });

    await publishChosenDrafts(TEST_PLAN_ID);

    // eslint-disable-next-line no-console
    console.log('SQLS', JSON.stringify(mockQueryOLTP.mock.calls.map((c: any[]) => String(c[0]))));
    const updateCalls = mockQueryOLTP.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE'));
    expect(updateCalls.length).toBeGreaterThan(0);
    // The doMock wrapper passes (sql, [params]) so call[1] is the params array.
    const persistedPlan = (updateCalls[0][1] as any[])[0] as any;
    expect(persistedPlan.items[0].assetNeeds[0].status).toBe('published');
  });

  it('collects errors instead of throwing when the local file is missing', async () => {
    const plan = makePlan();
    plan.items[0].fields.asset_paths = { portrait: 'does-not-exist.png' } as any;

    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ plan_json: plan }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });

    const result = await publishChosenDrafts(TEST_PLAN_ID);

    expect(result.success).toBe(false);
    expect(result.published).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─── Promotion methods (Milestone 06) ───────────────────────────────────────

import {
  promoteToStaging,
  promoteToProduction,
  rollbackFromStaging,
  listPromotionStatus,
} from '../../src/services/AssetPublishService.js';

describe('promotion methods', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-promotion-test-'));
    jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const entityDir = path.join(tmpDir, 'content', 'characters', 'diego');
    await fs.mkdir(path.join(entityDir, 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(entityDir, 'char_diego.yaml'),
      yaml.dump({
        id: 'item-00000000-0000-0000-0000-000000000002',
        name: 'Diego',
        portrait_urls: [
          { url: 'https://minio.test/portrait/diego__chosen.png', label: 'dev' },
        ],
      }),
      'utf-8',
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    mockUploadToMinio.mockClear();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('promoteToStaging reuses the dev URL and appends a label:staging entry', async () => {
    const result = await promoteToStaging('characters/diego/char_diego.yaml');
    expect(result.stage).toBe('staging');
    expect(result.url).toBe('https://minio.test/portrait/diego__chosen.png');
    expect(result.createdObject).toBe(false);
    expect(mockUploadToMinio).not.toHaveBeenCalled();

    const yamlPath = path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml');
    const data = yaml.load(await fs.readFile(yamlPath, 'utf-8')) as any;
    expect(data.portrait_urls).toEqual([
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'dev' },
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'staging' },
    ]);
  });

  it('promoteToProduction appends a label:production entry', async () => {
    await promoteToStaging('characters/diego/char_diego.yaml');
    const result = await promoteToProduction('characters/diego/char_diego.yaml');
    expect(result.stage).toBe('production');
    expect(result.url).toBe('https://minio.test/portrait/diego__chosen.png');

    const yamlPath = path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml');
    const data = yaml.load(await fs.readFile(yamlPath, 'utf-8')) as any;
    expect(data.portrait_urls).toEqual([
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'dev' },
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'staging' },
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'production' },
    ]);
  });

  it('rollbackFromStaging removes the staging entry', async () => {
    await promoteToStaging('characters/diego/char_diego.yaml');
    await promoteToProduction('characters/diego/char_diego.yaml');
    const result = await rollbackFromStaging('characters/diego/char_diego.yaml');
    expect(result.removed).toBe(true);

    const yamlPath = path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml');
    const data = yaml.load(await fs.readFile(yamlPath, 'utf-8')) as any;
    expect(data.portrait_urls).toEqual([
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'dev' },
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'production' },
    ]);
  });

  it('promoteToStaging is idempotent — replaces existing staging entry', async () => {
    await promoteToStaging('characters/diego/char_diego.yaml');
    const result = await promoteToStaging('characters/diego/char_diego.yaml');
    expect(result.stage).toBe('staging');

    const yamlPath = path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml');
    const data = yaml.load(await fs.readFile(yamlPath, 'utf-8')) as any;
    expect(data.portrait_urls.filter((p: any) => p.label === 'staging').length).toBe(1);
  });

  it('throws when promoting without a dev entry', async () => {
    const entityDir = path.join(tmpDir, 'content', 'characters', 'diego');
    await fs.writeFile(
      path.join(entityDir, 'char_diego.yaml'),
      yaml.dump({
        id: 'item-00000000-0000-0000-0000-000000000002',
        name: 'Diego',
        portrait_urls: [],
      }),
      'utf-8',
    );
    await expect(promoteToStaging('characters/diego/char_diego.yaml')).rejects.toThrow('No dev entry');
  });

  it('listPromotionStatus scans characters and returns stage maps', async () => {
    const statuses = await listPromotionStatus();
    const diego = statuses.find(s => s.slug === 'diego');
    expect(diego).toBeDefined();
    expect(diego!.stages.dev).toBeDefined();
    expect(diego!.stages.staging).toBeUndefined();
  });

  it('rollbackFromStaging returns removed:false when no staging entry exists', async () => {
    const result = await rollbackFromStaging('characters/diego/char_diego.yaml');
    expect(result.removed).toBe(false);
  });
});
