import { describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

// ── Module mocks (hoisted by Jest) ──────────────────────────

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
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => {
    _req.userId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));

jest.mock('../../src/services/ContentPlanService.js', () => ({
  contentPlanService: {
    parseDescription: jest.fn(async (description: string) => ({
      id: uuidv4(),
      description,
      status: 'draft',
      items: [
        {
          id: uuidv4(),
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
  },
}));

jest.mock('../../src/services/StoryBuilderOrchestrator.js', () => ({
  executePlan: jest.fn(async (_plan: any) => ({
    success: true,
    createdFiles: ['characters/char_diego.yaml'],
    validationErrors: [],
    migrationResult: { filesProcessed: 1, filesSkipped: 0, filesFailed: 0 },
    assetTasks: [],
  })),
}));

// ── Imports (after mocks) ────────────────────────────────────

import { adminStoryBuilderRouter } from '../../src/routes/admin-story-builder.js';
import { contentPlanService } from '../../src/services/ContentPlanService.js';
import { executePlan } from '../../src/services/StoryBuilderOrchestrator.js';

// ── App fixture ──────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/story-builder', adminStoryBuilderRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────

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
    const planId = uuidv4();
    const itemId = uuidv4();
    const res = await request(app)
      .post('/admin/story-builder/execute')
      .send({
        plan: {
          id: planId,
          description: 'Test plan',
          status: 'approved',
          items: [
            {
              id: itemId,
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
