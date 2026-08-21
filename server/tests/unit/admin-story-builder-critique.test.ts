/**
 * GAP 6 (M34) — story-builder action route validation (refactored equivalent).
 *
 * The pre-graph-db `admin-story-builder-actions.ts:25-47` handler that rejected
 * `itemIds: []` / `['']` with 400 was removed during the graph-db integration
 * (PR #109). The current equivalent validation boundary is the critique route
 * `POST /admin/story-builder/plans/:id/analyze`, which schema-validates an
 * inbound `plan_json` (ContentPlanSchema) and a `scope` enum, returning 400 on
 * malformed input before any DB/LLM work.
 *
 * This suite asserts the 400 contract for invalid request bodies (the modern
 * analogue of the old itemIds validation).
 *
 * Per AGENTS.md rule 7, DB/Redis and the heavy services are mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(),
  queryContent: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  deleteCache: jest.fn(async () => true),
  setCache: jest.fn(async () => true),
  getCache: jest.fn(async () => null),
  closeConnections: jest.fn(),
  closeRedis: jest.fn(),
}));

const mockUpdatePlanJson = jest.fn(async () => undefined);
const mockRunCritique = jest.fn(async () => ({ annotations: [], cached: false }));
const mockGetDeltasForPlan = jest.fn(async () => []);

jest.mock('../../src/services/ContentPlanService.js', () => ({
  ContentPlanService: { updatePlanJson: mockUpdatePlanJson },
}));

jest.mock('../../src/services/AICritiqueService.js', () => ({
  aiCritiqueService: {
    runCritique: mockRunCritique,
  },
}));

jest.mock('../../src/services/GraphDeltaService.js', () => ({
  getDeltasForPlan: mockGetDeltasForPlan,
}));

jest.mock('../../src/services/AdminEventEmitter.js', () => ({
  emitAdminEvent: jest.fn(),
}));

import { adminStoryBuilderCritiqueRouter } from '../../src/routes/admin-story-builder-critique.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = 'test-admin-user';
    next();
  });
  app.use(adminStoryBuilderCritiqueRouter);
  return app;
}

describe('POST /plans/:id/analyze — request validation (GAP 6)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  it('rejects an invalid scope enum with 400', async () => {
    const res = await request(app)
      .post('/plans/11111111-1111-4111-8111-111111111111/analyze')
      .send({ scope: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockGetDeltasForPlan).not.toHaveBeenCalled();
    expect(mockUpdatePlanJson).not.toHaveBeenCalled();
    expect(mockRunCritique).not.toHaveBeenCalled();
  });

  it('rejects a non-object plan_json with 400', async () => {
    const res = await request(app)
      .post('/plans/11111111-1111-4111-8111-111111111111/analyze')
      .send({ scope: 'entity', plan_json: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockUpdatePlanJson).not.toHaveBeenCalled();
    expect(mockRunCritique).not.toHaveBeenCalled();
  });

  it('rejects a malformed plan_json (missing required fields) with 400', async () => {
    const res = await request(app)
      .post('/plans/11111111-1111-4111-8111-111111111111/analyze')
      .send({ scope: 'entity', plan_json: { items: 'not-an-array' } });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockUpdatePlanJson).not.toHaveBeenCalled();
    expect(mockRunCritique).not.toHaveBeenCalled();
  });
});
