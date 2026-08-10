import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import { adminStoryBuilderActionsRouter } from '../../src/routes/admin-story-builder-actions.js';
import { contentPlanService } from '../../src/services/ContentPlanService.js';

// Mock DB/Redis per AGENTS.md unit-test rule 7
jest.mock('@las-flores/infra', () => ({ ...(() => ({
  queryOLTP: jest.fn(),
}))(), ...(() => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
  deleteCache: jest.fn(),
  invalidatePattern: jest.fn(),
}))() }));

jest.mock('../../src/services/StoryBuilderOrchestrator.js', () => ({
  previewPlan: jest.fn(),
  migrateStagedPlan: jest.fn(),
  approveAndSolidifyPlan: jest.fn(),
  verifyPlan: jest.fn(),
  getSolidifyJobStatus: jest.fn(),
}));

jest.mock('../../src/services/ContentPlanService.js', () => ({
  contentPlanService: {
    refinePlan: jest.fn().mockResolvedValue({
      plan: { id: 'p1', items: [], links: [], status: 'draft', description: '' },
      usage: null,
    }),
    refinePlanItems: jest.fn().mockResolvedValue({
      plan: { id: 'p1', items: [], links: [], status: 'draft', description: '' },
      usage: null,
    }),
  },
}));

jest.mock('../../src/services/AdminEventEmitter.js', () => ({
  emitAdminEvent: jest.fn(),
}));

describe('POST /plans/:id/refine itemIds validation (GAP 6)', () => {
  const app = express();
  app.use(express.json());
  app.use(adminStoryBuilderActionsRouter);

  let server: ReturnType<typeof app.listen>;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((err: Error | undefined) => (err ? reject(err) : resolve()))
      );
    }
  });

  it('rejects empty feedback with 400', async () => {
    const res = await fetch(`http://localhost:${port}/plans/plan-1/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: '', itemIds: ['i1'] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects itemIds: [] with 400', async () => {
    const res = await fetch(`http://localhost:${port}/plans/plan-1/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'change it', itemIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects itemIds: [""] with 400', async () => {
    const res = await fetch(`http://localhost:${port}/plans/plan-1/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'change it', itemIds: [''] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects itemIds: [123] (non-string) with 400', async () => {
    const res = await fetch(`http://localhost:${port}/plans/plan-1/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'change it', itemIds: [123] }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts valid itemIds and calls refinePlanItems', async () => {
    const res = await fetch(`http://localhost:${port}/plans/plan-1/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'make it darker', itemIds: ['abc-123'] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // The scoped path must forward plan id, trimmed feedback, and itemIds to
    // refinePlanItems — and must NOT fall back to the unscoped refinePlan.
    expect(contentPlanService.refinePlanItems).toHaveBeenCalledWith(
      'plan-1',
      'make it darker',
      ['abc-123'],
    );
    expect(contentPlanService.refinePlan).not.toHaveBeenCalled();
  });
});
