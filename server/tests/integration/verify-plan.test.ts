/**
 * Integration tests for:
 * - POST /admin/story-builder/plans/:id/verify
 * - GET /admin/story-builder/plans/:id/verification
 *
 * The orchestrator `verifyPlan` is mocked so the routes maintain their contract.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

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
    _req.userId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));

jest.mock('../../src/services/StoryBuilderOrchestrator.js');

import { adminStoryBuilderActionsRouter } from '../../src/routes/admin-story-builder-actions.js';
import { queryOLTP } from '../../src/database/connection.js';
import { verifyPlan } from '../../src/services/StoryBuilderOrchestrator.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;
const mockVerifyPlan = verifyPlan as jest.MockedFunction<typeof verifyPlan>;

const TEST_PLAN_ID = '11111111-1111-1111-1111-111111111111';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/story-builder', adminStoryBuilderActionsRouter);
  return app;
}

describe('POST /admin/story-builder/plans/:id/verify', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 for a non-existent plan', async () => {
    mockVerifyPlan.mockRejectedValueOnce(new Error(`Plan not found: ${TEST_PLAN_ID}`));

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/verify`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when plan is not migrated', async () => {
    mockVerifyPlan.mockRejectedValueOnce(
      new Error('Plan must be migrated before verification. Current status: staged'),
    );

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/verify`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 with verification report on success', async () => {
    const mockReport = {
      planId: TEST_PLAN_ID,
      checkedAt: new Date().toISOString(),
      passed: true,
      checks: [{ name: 'lore-path-resolution', description: 'test', status: 'pass' }],
      errors: [],
      warnings: [],
    };
    mockVerifyPlan.mockResolvedValueOnce(mockReport as any);

    mockQueryOLTP.mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
      command: 'UPDATE',
      oid: 0,
      fields: [],
    } as any);

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/verify`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.passed).toBe(true);
    expect(mockVerifyPlan).toHaveBeenCalledWith(TEST_PLAN_ID);
  });

  it('returns 500 on unexpected error', async () => {
    mockVerifyPlan.mockRejectedValueOnce(new Error('ECONNREFUSED db'));

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/verify`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /admin/story-builder/plans/:id/verification', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 for a non-existent plan', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const res = await request(app)
      .get(`/admin/story-builder/plans/${TEST_PLAN_ID}/verification`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns verification_report from DB', async () => {
    const mockReport = {
      planId: TEST_PLAN_ID,
      checkedAt: '2025-01-01T00:00:00.000Z',
      passed: true,
      checks: [],
      errors: [],
      warnings: [],
    };

    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ verification_report: mockReport }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const res = await request(app)
      .get(`/admin/story-builder/plans/${TEST_PLAN_ID}/verification`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verification_report).toEqual(mockReport);
  });

  it('returns null verification_report when not yet verified', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ verification_report: null }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const res = await request(app)
      .get(`/admin/story-builder/plans/${TEST_PLAN_ID}/verification`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verification_report).toBeNull();
  });

  it('returns 500 on unexpected error', async () => {
    mockQueryOLTP.mockRejectedValueOnce(new Error('ECONNREFUSED db'));

    const res = await request(app)
      .get(`/admin/story-builder/plans/${TEST_PLAN_ID}/verification`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
