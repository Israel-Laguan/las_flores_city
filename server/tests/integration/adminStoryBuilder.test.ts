import { describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const MOCK_PLAN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const MOCK_ITEM_ID = '11111111-2222-3333-4444-555555555555';
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

const MOCK_PLAN = {
  id: MOCK_PLAN_ID,
  description: 'Test plan for lore regeneration',
  status: 'approved',
  items: [
    {
      id: MOCK_ITEM_ID,
      type: 'character',
      action: 'create',
      name: 'Diego',
      slug: 'diego',
      fields: {
        title: 'Bartender',
        description: 'A friendly bartender',
        lore_path: 'docs/lore/figures/diego/diego.md',
      },
      assetNeeds: [],
      dependsOn: [],
    },
  ],
  links: [],
};

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(async () => undefined),
  writeFile: jest.fn(async () => undefined),
}));

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [] })),
}));

jest.mock('../../src/database/redis.js', () => ({
  getCache: jest.fn(async () => null),
  setCache: jest.fn(async () => true),
  deleteCache: jest.fn(async () => true),
  invalidatePattern: jest.fn(async () => true),
}));

jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req, _res, next) => {
    _req.userId = MOCK_USER_ID;
    next();
  },
}));

jest.mock('../../src/services/ContentPlanService.js', () => ({
  contentPlanService: {
    parseDescription: jest.fn(async (description) => ({
      id: MOCK_PLAN_ID,
      description,
      status: 'draft',
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
    })),
    gatherContext: jest.fn(async () => ({})),
    provider: {
      generateLore: jest.fn(async () => '# Diego\n\nA friendly bartender.'),
    },
  },
}));

jest.mock('../../src/services/StoryBuilderOrchestrator.js', () => ({
  executePlan: jest.fn(async (_plan) => ({
    success: true,
    createdFiles: ['characters/char_diego.yaml'],
    validationErrors: [],
    migrationResult: { filesProcessed: 1, filesSkipped: 0, filesFailed: 0 },
    assetTasks: [],
  })),
}));

import { adminStoryBuilderRouter } from '../../src/routes/admin-story-builder.js';
import { contentPlanService } from '../../src/services/ContentPlanService.js';
import { executePlan } from '../../src/services/StoryBuilderOrchestrator.js';
import { queryOLTP } from '../../src/database/connection.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/story-builder', adminStoryBuilderRouter);
  return app;
}

describe('POST /admin/story-builder/plan', () => {
  const app = makeApp();

  test('returns 400 for empty description', async () => {
    const res = await request(app)
      .post('/admin/story-builder/plan')
      .send({ description: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/description/i);
  });

  test('returns 400 for missing description', async () => {
    const res = await request(app)
      .post('/admin/story-builder/plan')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns a plan for a valid description', async () => {
    const res = await request(app)
      .post('/admin/story-builder/plan')
      .send({ description: 'Add a bartender named Diego' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plan.items.length).toBeGreaterThan(0);
    expect(res.body.data.plan.items[0].name).toBe('Diego');
  });
});

describe('POST /admin/story-builder/execute', () => {
  const app = makeApp();

  test('returns 400 for missing plan', async () => {
    const res = await request(app)
      .post('/admin/story-builder/execute')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/plan/i);
  });

  test('executes a plan and returns result', async () => {
    const res = await request(app)
      .post('/admin/story-builder/execute')
      .send({
        plan: {
          id: MOCK_PLAN_ID,
          description: 'Test plan',
          status: 'approved',
          items: [
            {
              id: MOCK_ITEM_ID,
              type: 'character',
              action: 'create',
              name: 'Diego',
              slug: 'diego',
              fields: { title: 'Bartender' },
              assetNeeds: [],
              dependsOn: [],
            },
          ],
          links: [],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.createdFiles).toContain('characters/char_diego.yaml');
  });
});

describe('POST /admin/story-builder/plans/:id/items/:itemId/lore', () => {
  const app = makeApp();

  test('returns 404 for non-existent plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${MOCK_PLAN_ID}/items/${MOCK_ITEM_ID}/lore`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/plan not found/i);
  });

  test('returns 404 for non-existent item', async () => {
    const planWithoutItem = {
      ...MOCK_PLAN,
      items: [{ id: '22222222-3333-4444-5555-666666666666', type: 'character', action: 'create', name: 'Other', slug: 'other', fields: { title: 'Other', description: 'Another character', lore_path: 'docs/lore/figures/other/other.md' }, assetNeeds: [], dependsOn: [] }],
    };
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ plan_json: planWithoutItem, status: 'approved' }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${MOCK_PLAN_ID}/items/${MOCK_ITEM_ID}/lore`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/item not found/i);
  });

  test('generates lore for a valid item', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ plan_json: MOCK_PLAN, status: 'approved' }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${MOCK_PLAN_ID}/items/${MOCK_ITEM_ID}/lore`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.lorePath).toBe('docs/lore/figures/diego/diego.md');
    expect(res.body.data.content).toContain('# Diego');
  });
});
