import { describe, test, expect, jest, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Collision-avoidance: dedicated UUID for test plan
const TEST_PLAN_ID = 'f1e2d3c4-b5a6-4798-8d9e-0f1a2b3c4d5e';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_ITEM_ID = '11111111-2222-3333-4444-555555555555';

const MOCK_PLAN = {
  id: TEST_PLAN_ID,
  description: 'Test plan for integration',
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
  queryOLAP: jest.fn(async () => ({ rows: [] })),
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
      plan: { ...MOCK_PLAN, description },
      usage: null,
    })),
    refinePlan: jest.fn(async (_planId: string, feedback: string) => ({
      plan: {
        ...MOCK_PLAN,
        description: `${MOCK_PLAN.description} [Refined: ${feedback}]`,
        status: 'proposed',
      },
      usage: null,
    })),
    getLastUsage: jest.fn(() => null),
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
}));

jest.mock('../../src/services/AdminEventEmitter.js', () => ({
  emitAdminEvent: jest.fn(),
}));

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

describe('POST /admin/story-builder/plans', () => {
  const app = makeApp();

  test('returns 400 for missing description', async () => {
    const res = await request(app)
      .post('/admin/story-builder/plans')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/description/i);
  });

  test('creates a plan from description', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: TEST_PLAN_ID }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const res = await request(app)
      .post('/admin/story-builder/plans')
      .send({ description: 'Add a bartender named Diego' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.planId).toBe(TEST_PLAN_ID);
    expect(res.body.data.plan.items.length).toBeGreaterThan(0);
  });

  test('creates a plan with pre-built plan object', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: TEST_PLAN_ID }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const res = await request(app)
      .post('/admin/story-builder/plans')
      .send({ description: 'Test plan', plan: MOCK_PLAN });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /admin/story-builder/plans', () => {
  const app = makeApp();

  test('lists plans with pagination', async () => {
    mockQueryOLTP
      .mockResolvedValueOnce({
        rows: [{ id: TEST_PLAN_ID, description: 'Test', status: 'proposed', item_count: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const res = await request(app)
      .get('/admin/story-builder/plans')
      .query({ limit: '10', offset: '0' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plans.length).toBe(1);
    expect(res.body.data.total).toBe(1);
  });
});

describe('GET /admin/story-builder/plans/:id', () => {
  const app = makeApp();

  test('returns 404 for non-existent plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

    const res = await request(app)
      .get(`/admin/story-builder/plans/${TEST_PLAN_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns plan details', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ id: TEST_PLAN_ID, description: 'Test', plan_json: MOCK_PLAN, status: 'proposed', feedback_log: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });

    const res = await request(app)
      .get(`/admin/story-builder/plans/${TEST_PLAN_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(TEST_PLAN_ID);
  });
});

describe('PUT /admin/story-builder/plans/:id', () => {
  const app = makeApp();

  test('returns 400 for missing plan', async () => {
    const res = await request(app)
      .put(`/admin/story-builder/plans/${TEST_PLAN_ID}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('updates a plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ id: TEST_PLAN_ID }],
      rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
    });

    const res = await request(app)
      .put(`/admin/story-builder/plans/${TEST_PLAN_ID}`)
      .send({ plan: MOCK_PLAN, status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('approved');
  });

  test('approves a plan and returns updated status', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ id: TEST_PLAN_ID, plan_json: MOCK_PLAN }],
      rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
    });

    const res = await request(app)
      .put(`/admin/story-builder/plans/${TEST_PLAN_ID}`)
      .send({ plan: MOCK_PLAN, status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('approved');
  });
});

describe('DELETE /admin/story-builder/plans/:id', () => {
  const app = makeApp();

  test('returns 404 for non-existent plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'DELETE', oid: 0, fields: [] });

    const res = await request(app)
      .delete(`/admin/story-builder/plans/${TEST_PLAN_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('deletes a plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: TEST_PLAN_ID }], rowCount: 1, command: 'DELETE', oid: 0, fields: [] });

    const res = await request(app)
      .delete(`/admin/story-builder/plans/${TEST_PLAN_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);
  });
});

describe('POST /admin/story-builder/plans/:id/refine', () => {
  const app = makeApp();

  test('returns 400 for missing feedback', async () => {
    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/refine`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/feedback/i);
  });

  test('refines a plan with feedback', async () => {
    mockQueryOLTP
      .mockResolvedValueOnce({
        rows: [{ plan_json: MOCK_PLAN, description: 'Test' }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/refine`)
      .send({ feedback: 'Make Diego more cynical' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plan).toBeDefined();
  });
});
