/**
 * Integration tests for POST /admin/story-builder/plans/:id/approve-and-solidify
 * (Milestone 04 — single-click "Approve & Ship").
 *
 * The orchestrator `approveAndSolidifyPlan` is mocked so the route maintains
 * its contract: 200 on success, 200 with a failed body on a logical
 * failure (the route returns 200 so adminFetch can parse the JSON), 404 when
 * the plan is absent, 400 when the plan status is invalid, 500 on a throw.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
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
    _req.userId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));

jest.mock('../../src/services/StoryBuilderOrchestrator.js');

import { adminStoryBuilderActionsRouter } from '../../src/routes/admin-story-builder-actions.js';
import { queryOLTP } from '../../src/database/connection.js';
import { approveAndSolidifyPlan } from '../../src/services/StoryBuilderOrchestrator.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;
const mockApprove = approveAndSolidifyPlan as jest.MockedFunction<typeof approveAndSolidifyPlan>;

const TEST_PLAN_ID = '11111111-1111-1111-1111-111111111111';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/story-builder', adminStoryBuilderActionsRouter);
  return app;
}

describe('POST /admin/story-builder/plans/:id/approve-and-solidify', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 for a non-existent plan', async () => {
    mockApprove.mockRejectedValueOnce(new Error(`Plan not found: ${TEST_PLAN_ID}`));

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/approve-and-solidify`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 and the solidify result on success', async () => {
    mockApprove.mockResolvedValueOnce({
      success: true,
      status: 'verified',
      stage: { success: true, createdFiles: ['characters/char_diego.yaml'] },
      publish: { success: true, published: [], errors: [] },
      migration: { success: true, migrationResult: { filesProcessed: 1 } },
      verificationReport: { success: true, passed: true, checks: [], errors: [] },
    });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/approve-and-solidify`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('verified');
    expect(mockApprove.mock.calls[0][0]).toBe(TEST_PLAN_ID);
  });

  it('returns 200 with a failed body when the solidify result fails', async () => {
    mockApprove.mockResolvedValueOnce({
      success: false,
      status: 'failed',
      stage: { success: true, createdFiles: [] },
      publish: { success: false, published: [], errors: ['upload failed'] },
      migration: { success: false, migrationResult: null, error: 'migration error' },
      error: 'Asset publish failed',
    });

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/approve-and-solidify`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.data.error).toBe('Asset publish failed');
  });

  it('returns 400 when the plan status is not proposed/approved', async () => {
    mockApprove.mockRejectedValueOnce(
      new Error("Plan must be 'proposed' or 'approved' to approve. Current: migrated"),
    );

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/approve-and-solidify`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 500 on an unexpected error', async () => {
    mockApprove.mockRejectedValueOnce(new Error('ECONNREFUSED db'));

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/approve-and-solidify`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('ECONNREFUSED db');
  });
});
