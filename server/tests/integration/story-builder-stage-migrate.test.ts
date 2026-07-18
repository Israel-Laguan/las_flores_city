import { describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Collision-avoidance: dedicated UUIDs for test fixtures
const TEST_PLAN_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_ITEM_ID = '11111111-2222-3333-4444-555555555555';

const MOCK_PLAN = {
  id: TEST_PLAN_ID,
  description: 'Test plan for staging migration',
  status: 'proposed',
  items: [
    {
      id: MOCK_ITEM_ID,
      type: 'character',
      action: 'create',
      name: 'Diego',
      slug: 'diego',
      fields: { title: 'Bartender', description: 'A friendly bartender' },
      assetNeeds: [],
      dependsOn: [],
    },
  ],
  links: [],
};

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

jest.mock('../../src/services/ContentPlanService.js', () => ({
  contentPlanService: {
    parseDescription: jest.fn(async (description: string) => ({
      ...MOCK_PLAN,
      description,
    })),
    refinePlan: jest.fn(async (_planId: string, feedback: string) => ({
      ...MOCK_PLAN,
      description: `${MOCK_PLAN.description} [Refined: ${feedback}]`,
      status: 'proposed',
    })),
    gatherContext: jest.fn(async () => ({
      characters: [],
      scenes: [],
      dialogues: [],
      missions: [],
      stories: [],
      overlays: [],
      locations: [],
    })),
  },
}));

jest.mock('../../src/services/StoryBuilderOrchestrator.js', () => ({
  executePlan: jest.fn(async () => ({
    success: true,
    createdFiles: ['characters/char_diego.yaml'],
    validationErrors: [],
    migrationResult: { filesProcessed: 1, filesSkipped: 0, filesFailed: 0 },
    assetTasks: [],
  })),
  previewPlan: jest.fn(async () => ({
    items: [
      {
        name: 'Diego',
        type: 'character',
        action: 'create',
        filePath: 'characters/char_diego.yaml',
        yamlPreview: 'id: test\ntype: character\n',
        isNew: true,
      },
    ],
    links: [],
  })),
  stagePlan: jest.fn(async () => ({
    success: true,
    createdFiles: ['characters/char_diego.yaml'],
    updatedFiles: [],
    validationErrors: [],
    warnings: [],
  })),
  migrateStagedPlan: jest.fn(async () => ({
    success: true,
    migrationResult: { filesProcessed: 1, filesSkipped: 0, filesFailed: 0 },
  })),
}));

import { adminStoryBuilderRouter } from '../../src/routes/admin-story-builder.js';
import { queryOLTP } from '../../src/database/connection.js';
import { previewPlan, stagePlan, migrateStagedPlan } from '../../src/services/StoryBuilderOrchestrator.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;
const mockPreviewPlan = previewPlan as jest.MockedFunction<typeof previewPlan>;
const mockStagePlan = stagePlan as jest.MockedFunction<typeof stagePlan>;
const mockMigrateStagedPlan = migrateStagedPlan as jest.MockedFunction<typeof migrateStagedPlan>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/story-builder', adminStoryBuilderRouter);
  return app;
}

describe('POST /admin/story-builder/plans/:id/preview', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 404 for non-existent plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/preview`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns preview data for valid plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ plan_json: MOCK_PLAN }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/preview`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toBeDefined();
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(mockPreviewPlan).toHaveBeenCalled();
  });
});

describe('POST /admin/story-builder/plans/:id/stage', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 404 for non-existent plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/stage`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('rejects staging a draft plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ plan_json: MOCK_PLAN, status: 'draft' }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/stage`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/proposed or approved/);
  });

  test('stages a valid plan and updates status', async () => {
    mockQueryOLTP
      .mockResolvedValueOnce({
        rows: [{ plan_json: MOCK_PLAN, status: 'approved' }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/stage`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.createdFiles).toContain('characters/char_diego.yaml');
    expect(mockStagePlan).toHaveBeenCalled();
  });

  test('handles staging failure', async () => {
    mockStagePlan.mockResolvedValueOnce({
      success: false,
      createdFiles: [],
      updatedFiles: [],
      validationErrors: ['Invalid schema'],
      warnings: [],
    });

    mockQueryOLTP
      .mockResolvedValueOnce({
        rows: [{ plan_json: MOCK_PLAN, status: 'approved' }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/stage`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.data.validationErrors).toContain('Invalid schema');
  });
});

describe('POST /admin/story-builder/plans/:id/migrate', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('migrates a staged plan', async () => {
    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/migrate`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.migrationResult).toBeDefined();
    expect(mockMigrateStagedPlan).toHaveBeenCalledWith(TEST_PLAN_ID);
  });

  test('handles migration failure from non-staged plan', async () => {
    mockMigrateStagedPlan.mockResolvedValueOnce({
      success: false,
      migrationResult: null,
      error: 'Plan must be staged before migration. Current status: draft',
    });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/migrate`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data.error).toContain('staged');
  });
});
