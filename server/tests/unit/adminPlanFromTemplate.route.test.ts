// ============================================================
// admin-story-builder-plans /plans/from-template — unit tests (M43)
//
// Mocks @las-flores/infra (queryOLTP) and AdminEventEmitter so no real
// DB/Redis is touched (AGENTS.md rule 7), then drives the router with
// supertest to cover the success and rejected paths of the scoped
// template endpoint.
// ============================================================

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(),
  oltpPool: { connect: jest.fn() },
  getCache: jest.fn(async () => null),
  setCache: jest.fn(async () => true),
  deleteCache: jest.fn(async () => true),
}));

const mockEmit = jest.fn();
jest.mock('../../src/services/AdminEventEmitter.js', () => ({
  emitAdminEvent: (...args: any[]) => mockEmit(...args),
}));

import { queryOLTP } from '@las-flores/infra';
import { adminStoryBuilderPlansRouter } from '../../src/routes/admin-story-builder-plans.js';

const queryMock = queryOLTP as jest.MockedFunction<any>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', adminStoryBuilderPlansRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /plans/from-template', () => {
  test('creates a proposed plan from the mission template', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'b4300000-0000-4000-8000-000000000001' }], rowCount: 1 });
    const res = await request(makeApp())
      .post('/plans/from-template')
      .send({ templateId: 'mission', name: 'Van Der Meer Tapes', slug: 'van_der_meer_tapes' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.planId).toBe('b4300000-0000-4000-8000-000000000001');
    expect(res.body.data.plan.status).toBe('proposed');
    expect(res.body.data.plan.items[0].type).toBe('mission');
    // persisted as proposed (status is a SQL literal; created_by is the last param)
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("'proposed'");
    expect(params).toHaveLength(3);
    expect(mockEmit).toHaveBeenCalledWith('plan_created', expect.objectContaining({ templateId: 'mission' }), expect.any(String), undefined);
  });

  test('creates a proposed plan from the location template', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'b4300000-0000-4000-8000-000000000002' }], rowCount: 1 });
    const res = await request(makeApp())
      .post('/plans/from-template')
      .send({ templateId: 'location', name: 'Acuario Annex', slug: 'acuario_annex', district: 'San Felipe' });
    expect(res.status).toBe(200);
    expect(res.body.data.plan.items[0].type).toBe('location');
    expect(res.body.data.plan.items[0].fields.district).toBe('San Felipe');
  });

  test('rejects an unknown templateId with 400', async () => {
    const res = await request(makeApp())
      .post('/plans/from-template')
      .send({ templateId: 'wizard', name: 'X', slug: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown plan template "wizard"/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('requires templateId, name and slug', async () => {
    const noTemplate = await request(makeApp()).post('/plans/from-template').send({});
    expect(noTemplate.status).toBe(400);
    const noSlug = await request(makeApp()).post('/plans/from-template').send({ templateId: 'mission', name: 'X' });
    expect(noSlug.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('rejects invalid slugs with 400 without touching the DB', async () => {
    const res = await request(makeApp())
      .post('/plans/from-template')
      .send({ templateId: 'mission', name: 'Bad Slug', slug: 'Bad Slug!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid template params/);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
