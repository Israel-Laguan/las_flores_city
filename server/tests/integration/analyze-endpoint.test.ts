/**
 * Integration tests for the M26 AI-critique routes:
 * - POST /admin/story-builder/plans/:id/analyze
 * - GET  /admin/story-builder/plans/:id/annotations
 * - PATCH /admin/story-builder/plans/:id/annotations/:annotationId
 *
 * `aiCritiqueService` is mocked so the routes maintain their contract without a
 * real DB or LLM. Mirrors verify-plan.test.ts.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
  queryOLAP: jest.fn(async () => ({ rows: [] })),
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

jest.mock('../../src/services/AICritiqueService.js', () => ({
  aiCritiqueService: {
    runCritique: jest.fn(),
    getAnnotations: jest.fn(async () => []),
    setAnnotationStatus: jest.fn(async () => {}),
  },
}));

import { adminStoryBuilderActionsRouter } from '../../src/routes/admin-story-builder-actions.js';
import { aiCritiqueService } from '../../src/services/AICritiqueService.js';

const mocked = aiCritiqueService as jest.Mocked<typeof aiCritiqueService>;

const TEST_PLAN_ID = '11111111-1111-1111-1111-111111111111';
const TEST_ANNOTATION_ID = '22222222-2222-2222-2222-222222222222';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/story-builder', adminStoryBuilderActionsRouter);
  return app;
}

describe('POST /admin/story-builder/plans/:id/analyze', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mocked.runCritique.mockResolvedValue({
      annotations: [],
      cached: false,
      model: 'mock',
    } as any);
  });

  it('rejects an invalid scope with 400', async () => {
    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/analyze`)
      .send({ scope: 'bogus' });
    expect(res.status).toBe(400);
    expect(mocked.runCritique).not.toHaveBeenCalled();
  });

  it('returns 404 when the plan is not found', async () => {
    mocked.runCritique.mockRejectedValueOnce(new Error(`Plan not found: ${TEST_PLAN_ID}`));
    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/analyze`)
      .send({ scope: 'entity' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 with annotations on a successful entity run', async () => {
    const annotation = {
      id: TEST_ANNOTATION_ID,
      type: 'conflict',
      severity: 'error',
      description: 'Duplicate name against canon',
      evidence: [{ nodeType: 'character', nodeId: 'item-1', slug: 'marcus', excerpt: 'A bartender' }],
      relatedEntities: [],
      scope: 'entity',
      aiModel: 'mock',
      inputHash: 'hash',
      status: 'open',
      planId: TEST_PLAN_ID,
      itemIds: ['item-1'],
      createdAt: new Date().toISOString(),
    };
    mocked.runCritique.mockResolvedValueOnce({ annotations: [annotation], cached: false, model: 'mock' } as any);

    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/analyze`)
      .send({ scope: 'entity' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.annotations).toHaveLength(1);
    expect(res.body.data.cached).toBe(false);
    expect(mocked.runCritique).toHaveBeenCalledWith(TEST_PLAN_ID, 'entity', { forceReanalyze: false });
  });

  it('defaults scope to entity when omitted', async () => {
    mocked.runCritique.mockResolvedValueOnce({ annotations: [], cached: true, model: 'mock' } as any);
    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/analyze`)
      .send({});
    expect(res.status).toBe(200);
    expect(mocked.runCritique).toHaveBeenCalledWith(TEST_PLAN_ID, 'entity', { forceReanalyze: false });
  });

  it('honors force=true by passing forceReanalyze', async () => {
    mocked.runCritique.mockResolvedValueOnce({ annotations: [], cached: false, model: 'mock' } as any);
    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/analyze`)
      .send({ scope: 'cross_entity', force: true });
    expect(res.status).toBe(200);
    expect(mocked.runCritique).toHaveBeenCalledWith(TEST_PLAN_ID, 'cross_entity', { forceReanalyze: true });
  });

  it('returns 500 on unexpected error', async () => {
    mocked.runCritique.mockRejectedValueOnce(new Error('ECONNREFUSED db'));
    const res = await request(app)
      .post(`/admin/story-builder/plans/${TEST_PLAN_ID}/analyze`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /admin/story-builder/plans/:id/annotations', () => {
  const app = makeApp();

  beforeEach(() => jest.clearAllMocks());

  it('returns stored annotations', async () => {
    mocked.getAnnotations.mockResolvedValueOnce([
      { id: TEST_ANNOTATION_ID, type: 'suggestion', severity: 'info', description: 'Consider a review', evidence: [], relatedEntities: [], scope: 'entity', aiModel: 'mock', inputHash: 'h', status: 'open', planId: TEST_PLAN_ID, itemIds: [], createdAt: new Date().toISOString() },
    ] as any);

    const res = await request(app)
      .get(`/admin/story-builder/plans/${TEST_PLAN_ID}/annotations`);
    expect(res.status).toBe(200);
    expect(res.body.data.annotations).toHaveLength(1);
    expect(mocked.getAnnotations).toHaveBeenCalledWith(TEST_PLAN_ID);
  });
});

describe('PATCH /admin/story-builder/plans/:id/annotations/:annotationId', () => {
  const app = makeApp();

  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid status with 400', async () => {
    const res = await request(app)
      .patch(`/admin/story-builder/plans/${TEST_PLAN_ID}/annotations/${TEST_ANNOTATION_ID}`)
      .send({ status: 'invalid-status' });
    expect(res.status).toBe(400);
    expect(mocked.setAnnotationStatus).not.toHaveBeenCalled();
  });

  it('applies a dismiss override', async () => {
    const res = await request(app)
      .patch(`/admin/story-builder/plans/${TEST_PLAN_ID}/annotations/${TEST_ANNOTATION_ID}`)
      .send({ status: 'dismissed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('dismissed');
    expect(mocked.setAnnotationStatus).toHaveBeenCalledWith(TEST_ANNOTATION_ID, 'dismissed');
  });

  it('returns 404 when the annotation is not found', async () => {
    mocked.setAnnotationStatus.mockRejectedValueOnce(new Error(`Annotation not found: ${TEST_ANNOTATION_ID}`));
    const res = await request(app)
      .patch(`/admin/story-builder/plans/${TEST_PLAN_ID}/annotations/${TEST_ANNOTATION_ID}`)
      .send({ status: 'addressed' });
    expect(res.status).toBe(404);
  });
});

