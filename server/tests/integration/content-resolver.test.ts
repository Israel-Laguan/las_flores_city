/**
 * Integration tests for the admin content resolver routes (Plan 00).
 *
 * Verifies:
 * - GET /admin/content/by-id resolves by type + UUID
 * - 400/404 handling for unknown type / missing id / missing match
 * - cache behavior and cache invalidation on writes
 */
import { describe, it, expect, jest, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import * as yaml from 'js-yaml';

import { adminContentResolverRouter } from '../../src/routes/admin-content-resolver.js';

jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => {
    _req.userId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));

describe('Admin Content Resolver Routes', () => {
  let tmpDir: string;
  let app: express.Application;

  beforeAll(async () => {
    // Nothing to import beyond the static import above.
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-resolver-test-'));
    jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    // The resolver cache is module-scoped; clear it between tests so earlier
    // hits don't pollute filesystem-path/non-match cases.
    try {
      const mod = await import('../../src/routes/admin-content-resolver.js');
      mod.invalidateContentResolverCache?.();
    } catch {
      // noop
    }

    const charDir = path.join(tmpDir, 'content', 'characters', 'alice');
    const locDir = path.join(tmpDir, 'content', 'districts', 'downtown', 'locations', 'plaza');
    await fs.mkdir(path.join(charDir, 'assets'), { recursive: true });
    await fs.mkdir(path.join(locDir, 'assets'), { recursive: true });

    await fs.writeFile(
      path.join(charDir, 'char_alice.yaml'),
      yaml.dump({ id: 'a0000001-0000-4000-8000-000000000001', name: 'Alice', description: 'hero' }),
      'utf-8',
    );

    await fs.writeFile(
      path.join(locDir, 'location_plaza.yaml'),
      yaml.dump({ id: 'b0000002-0000-4000-8000-000000000002', type: 'location', name: 'Plaza', district: 'Downtown', description: 'central' }),
      'utf-8',
    );

    await fs.writeFile(
      path.join(charDir, 'char_bob.yaml'),
      yaml.dump({ id: 'c0000003-0000-4000-8000-000000000003', name: 'Bob' }),
      'utf-8',
    );

    app = express();
    app.use('/admin/content', adminContentResolverRouter);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('GET /by-id returns the character YAML path + parsed object', async () => {
    const res = await request(app)
      .get('/admin/content/by-id?type=character&id=a0000001-0000-4000-8000-000000000001');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.path).toBe('characters/alice/char_alice.yaml');
    expect(res.body.data.yaml).toEqual(expect.objectContaining({ id: 'a0000001-0000-4000-8000-000000000001', name: 'Alice' }));
  });

  it('GET /by-id returns the location YAML path + parsed object', async () => {
    const res = await request(app)
      .get('/admin/content/by-id?type=location&id=b0000002-0000-4000-8000-000000000002');
    expect(res.status).toBe(200);
    expect(res.body.data.path).toBe('districts/downtown/locations/plaza/location_plaza.yaml');
    expect(res.body.data.yaml).toEqual(expect.objectContaining({ name: 'Plaza' }));
  });

  it('GET /by-id returns 400 for unknown type', async () => {
    const res = await request(app).get('/admin/content/by-id?type=scene&id=anything');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/type must be one of/);
  });

  it('GET /by-id returns 400 for missing id', async () => {
    const res = await request(app).get('/admin/content/by-id?type=character');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('id must be a non-empty string');
  });

  it('GET /by-id returns 404 when no YAML matches the id', async () => {
    const res = await request(app)
      .get('/admin/content/by-id?type=character&id=00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No content file found for type 'character' with id/);
  });

  it('responds with 404 when content directory is missing', async () => {
    jest.spyOn(process, 'cwd').mockReturnValue('/nonexistent-dir-xyz');
    const res = await request(app)
      .get('/admin/content/by-id?type=character&id=a0000001-0000-4000-8000-000000000001');
    expect(res.status).toBe(404);
  });

  it('caches the result and invalidates on explicit cache clear', async () => {
    const { invalidateContentResolverCache } = await import('../../src/routes/admin-content-resolver.js');

    const first = await request(app)
      .get('/admin/content/by-id?type=character&id=a0000001-0000-4000-8000-000000000001');
    expect(first.status).toBe(200);

    invalidateContentResolverCache();

    const second = await request(app)
      .get('/admin/content/by-id?type=character&id=a0000001-0000-4000-8000-000000000001');
    expect(second.status).toBe(200);
    expect(second.body.data.yaml).toEqual(expect.objectContaining({ name: 'Alice' }));
  });
});
