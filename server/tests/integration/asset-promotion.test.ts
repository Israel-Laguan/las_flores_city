/**
 * Integration tests for asset promotion routes (Milestone 06).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import yaml from 'js-yaml';

const mockUploadToMinio = jest.fn().mockImplementation(async (buf: Buffer, key: string) => {
  return `https://minio.test/${key}`;
});

jest.doMock('../../src/services/StorageService.js', () => ({
  uploadToMinio: mockUploadToMinio,
  default: { uploadToMinio: mockUploadToMinio },
}));

jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => {
    _req.userId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));

let adminContentAssetRouter: typeof import('../../src/routes/admin-content-asset.js').adminContentAssetRouter;

describe('Asset promotion routes', () => {
  let tmpDir: string;
  let app: express.Application;

  beforeAll(async () => {
    const mod = await import('../../src/routes/admin-content-asset.js');
    adminContentAssetRouter = mod.adminContentAssetRouter;
  });

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

    app = express();
    app.use(express.json());
    app.use('/admin/content', adminContentAssetRouter);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    mockUploadToMinio.mockClear();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('GET /assets/promotion-status returns Diego with dev stage', async () => {
    const res = await request(app).get('/admin/content/assets/promotion-status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const diego = res.body.data.find((s: any) => s.slug === 'diego');
    expect(diego).toBeDefined();
    expect(diego.stages.dev).toBeDefined();
    expect(diego.stages.staging).toBeUndefined();
  });

  it('POST /assets/promote-staging adds a staging entry', async () => {
    const res = await request(app)
      .post('/admin/content/assets/promote-staging')
      .send({ contentPath: 'characters/diego/char_diego.yaml' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stage).toBe('staging');
    expect(mockUploadToMinio).not.toHaveBeenCalled();

    const yamlPath = path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml');
    const data = yaml.load(await fs.readFile(yamlPath, 'utf-8')) as any;
    expect(data.portrait_urls).toEqual([
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'dev' },
      { url: 'https://minio.test/portrait/diego__chosen.png', label: 'staging' },
    ]);
  });

  it('POST /assets/promote-production adds a production entry', async () => {
    await request(app)
      .post('/admin/content/assets/promote-staging')
      .send({ contentPath: 'characters/diego/char_diego.yaml' });

    const res = await request(app)
      .post('/admin/content/assets/promote-production')
      .send({ contentPath: 'characters/diego/char_diego.yaml' });
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe('production');

    const yamlPath = path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml');
    const data = yaml.load(await fs.readFile(yamlPath, 'utf-8')) as any;
    expect(data.portrait_urls).toHaveLength(3);
  });

  it('POST /assets/rollback-staging removes staging entry', async () => {
    await request(app)
      .post('/admin/content/assets/promote-staging')
      .send({ contentPath: 'characters/diego/char_diego.yaml' });
    await request(app)
      .post('/admin/content/assets/promote-production')
      .send({ contentPath: 'characters/diego/char_diego.yaml' });

    const res = await request(app)
      .post('/admin/content/assets/rollback-staging')
      .send({ contentPath: 'characters/diego/char_diego.yaml' });
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);

    const yamlPath = path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml');
    const data = yaml.load(await fs.readFile(yamlPath, 'utf-8')) as any;
    const labels = data.portrait_urls.map((p: any) => p.label);
    expect(labels).toEqual(['dev', 'production']);
  });

  it('POST /assets/promote-staging returns 400 without dev entry', async () => {
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

    const res = await request(app)
      .post('/admin/content/assets/promote-staging')
      .send({ contentPath: 'characters/diego/char_diego.yaml' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});