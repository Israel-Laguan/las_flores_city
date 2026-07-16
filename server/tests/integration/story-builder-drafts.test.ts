import { describe, test, expect, jest, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Collision-avoidance: dedicated UUIDs for test fixtures
const TEST_PLAN_ID = 'd4c3b2a1-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_ITEM_ID = '22222222-3333-4444-5555-666666666666';

/** Deep-clone the plan so each test gets a fresh copy (no cross-test mutation). */
function freshPlan(): any {
  return JSON.parse(JSON.stringify({
    id: TEST_PLAN_ID,
    description: 'Test plan for drafts',
    status: 'proposed',
    items: [
      {
        id: MOCK_ITEM_ID,
        type: 'character',
        action: 'create',
        name: 'Test Char',
        slug: 'test_draft_char',
        fields: { title: 'Test', description: 'A test character' },
        assetNeeds: [
          { promptType: 'portrait', targetField: 'asset_paths.portrait', status: 'pending' },
        ],
        dependsOn: [],
      },
    ],
    links: [],
  }));
}

const mockGenerateLocalDrafts = jest.fn(async () => ['test_draft_char__2026-07-15T01-30-00.png']);
const mockListLocalAssets = jest.fn(async () => [
  { filename: 'test_draft_char__default.png', fullPath: '/tmp/assets/test_draft_char__default.png', sizeBytes: 100, mtime: new Date('2026-07-15T01:00:00Z') },
  { filename: 'test_draft_char__2026-07-15T01-30-00.png', fullPath: '/tmp/assets/test_draft_char__2026-07-15T01-30-00.png', sizeBytes: 200, mtime: new Date('2026-07-15T01:30:00Z') },
]);
const mockChooseDraft = jest.fn(async () => {});
const mockGeneratePromptFiles = jest.fn(async () => []);

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(),
}));

jest.mock('../../src/database/redis.js', () => ({
  getCache: jest.fn(async () => null),
  setCache: jest.fn(async () => true),
  deleteCache: jest.fn(async () => true),
  invalidatePattern: jest.fn(async () => true),
}));

jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => {
    _req.userId = TEST_USER_ID;
    next();
  },
}));

jest.mock('../../src/services/LocalDraftService.js', () => ({
  generateLocalDrafts: mockGenerateLocalDrafts,
  listLocalAssets: mockListLocalAssets,
  chooseDraft: mockChooseDraft,
  resolveEntityRootDir: jest.fn((_item: any, contentDir: string) => `${contentDir}/characters/test_draft_char`),
  findNeedByPromptType: jest.fn((item: any, pt: string) => item.assetNeeds.find((n: any) => n.promptType === pt)),
  getAssetFieldName: jest.fn((need: any) => need.targetField.split('.').pop()),
}));

jest.mock('../../src/services/PromptFileGenerator.js', () => ({
  generatePromptFiles: mockGeneratePromptFiles,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  jest.clearAllMocks();
});

import { adminStoryBuilderRouter } from '../../src/routes/admin-story-builder.js';
import { queryOLTP } from '../../src/database/connection.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/story-builder', adminStoryBuilderRouter);
  return app;
}

/** Find the LAST UPDATE content_plans call (avoids matching prior tests). */
function lastUpdateCall(): any[] | undefined {
  const calls = mockQueryOLTP.mock.calls.filter(c => c[0]?.toString().includes('UPDATE content_plans'));
  return calls[calls.length - 1];
}

describe('POST /admin/story-builder/plans/:id/generate-drafts', () => {
  const app = makeApp();

  test('returns 404 for non-existent plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

    const res = await request(app).post(`/admin/story-builder/plans/${TEST_PLAN_ID}/generate-drafts`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 if plan status is not proposed or approved', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ status: 'draft' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const res = await request(app).post(`/admin/story-builder/plans/${TEST_PLAN_ID}/generate-drafts`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/proposed or approved/);
  });

  test('generates drafts, transitions to drafted, and persists plan_json', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ status: 'proposed' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ plan_json: freshPlan(), status: 'proposed' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: TEST_PLAN_ID }], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });

    const res = await request(app).post(`/admin/story-builder/plans/${TEST_PLAN_ID}/generate-drafts?count=2`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.generated).toHaveLength(1);
    expect(res.body.data.generated[0].files).toHaveLength(1);
    expect(mockGenerateLocalDrafts).toHaveBeenCalled();
    expect(mockGeneratePromptFiles).toHaveBeenCalled();

    const updateCall = lastUpdateCall();
    expect(updateCall).toBeDefined();
    const savedPlan = updateCall![1][0];
    expect(savedPlan.items[0].assetNeeds[0].status).toBe('drafted');
  });

  test('does NOT insert into asset_bases (no MinIO, no DB row)', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ status: 'proposed' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ plan_json: freshPlan(), status: 'proposed' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: TEST_PLAN_ID }], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });

    await request(app).post(`/admin/story-builder/plans/${TEST_PLAN_ID}/generate-drafts`);

    const insertCall = mockQueryOLTP.mock.calls.find(c => c[0]?.toString().includes('INSERT INTO asset_bases'));
    expect(insertCall).toBeUndefined();
  });
});

describe('GET /admin/story-builder/plans/:id/drafts', () => {
  const app = makeApp();

  test('lists all valid files including hand-dropped and pre-selects default', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ plan_json: freshPlan(), status: 'proposed' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: TEST_PLAN_ID }], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });

    const res = await request(app).get(`/admin/story-builder/plans/${TEST_PLAN_ID}/drafts`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].assets).toHaveLength(2);
    expect(res.body.data.items[0].preSelected).toBe('test_draft_char__default.png');
  });

  test('auto-chooses __default.png and transitions pending needs to chosen', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ plan_json: freshPlan(), status: 'proposed' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: TEST_PLAN_ID }], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });

    await request(app).get(`/admin/story-builder/plans/${TEST_PLAN_ID}/drafts`);

    const updateCall = lastUpdateCall();
    expect(updateCall).toBeDefined();
    const savedPlan = updateCall![1][0];
    expect(savedPlan.items[0].assetNeeds[0].status).toBe('chosen');
    expect(savedPlan.items[0].fields.asset_paths.portrait).toBe('test_draft_char__default.png');
  });
});

describe('POST /admin/story-builder/plans/:id/choose-draft', () => {
  const app = makeApp();

  test('returns 400 for missing itemId', async () => {
    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/choose-draft`)
      .send({ promptType: 'portrait', filename: 'test.png' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('chooses a draft, updates asset_paths, and transitions to chosen', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ plan_json: freshPlan(), status: 'proposed' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: TEST_PLAN_ID }], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/choose-draft`)
      .send({ itemId: MOCK_ITEM_ID, promptType: 'portrait', filename: 'test_draft_char__2026-07-15T01-30-00.png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('chosen');
    expect(mockChooseDraft).toHaveBeenCalled();

    const updateCall = lastUpdateCall();
    expect(updateCall).toBeDefined();
    const savedPlan = updateCall![1][0];
    expect(savedPlan.items[0].assetNeeds[0].status).toBe('chosen');
    expect(savedPlan.items[0].fields.asset_paths.portrait).toBe('test_draft_char__2026-07-15T01-30-00.png');
  });

  test('returns 404 for unknown item in plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ plan_json: freshPlan(), status: 'proposed' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/choose-draft`)
      .send({ itemId: 'unknown-item-id', promptType: 'portrait', filename: 'test.png' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
