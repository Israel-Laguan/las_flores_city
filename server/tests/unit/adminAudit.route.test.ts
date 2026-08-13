// ============================================================
// adminAudit.route — unit tests for the M24 audit API (patches/claims)
//
// Mocks the RevisionService / ClaimsService and the admin auth
// middleware, then drives the router with supertest to verify request
// validation, service invocation, and error mapping (404/400/500).
// ============================================================

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => next(),
}));

const mockRevision = {
  createPatch: jest.fn(),
  getPatch: jest.fn(),
  listPatchesForPlan: jest.fn(),
  listRevisions: jest.fn(),
  rejectPatch: jest.fn(),
  rollbackPatch: jest.fn(),
};
const mockClaims = {
  listClaims: jest.fn(),
  getClaimDetail: jest.fn(),
  recordEvidence: jest.fn(),
  transitionClaim: jest.fn(),
};

jest.mock('../../src/services/RevisionService.js', () => mockRevision);
jest.mock('../../src/services/ClaimsService.js', () => mockClaims);

import { adminAuditRouter } from '../../src/routes/admin-audit.js';
import { PatchNotFoundError } from '../../src/services/errors.js';

// Route-boundary validation only accepts UUID path params, so fixtures must use
// real UUIDs rather than the short ids used in mocked service return values.
const UUID_PARAM = 'b0000000-0000-4000-8000-000000000001';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', adminAuditRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /patches', () => {
  test('creates a proposed patch with a valid payload', async () => {
    (mockRevision.createPatch as jest.Mock).mockResolvedValue('p-1');
    const res = await request(makeApp())
      .post('/patches')
      .send({ planId: 'a0000000-0000-4000-8000-000000000001', title: 'Add lore', patchJson: { ops: [] } });
    expect(res.status).toBe(200);
    expect(res.body.data.patchId).toBe('p-1');
    expect(mockRevision.createPatch).toHaveBeenCalledTimes(1);
  });

  test('rejects an invalid payload', async () => {
    const res = await request(makeApp())
      .post('/patches')
      .send({ title: '', patchJson: { ops: [] } });
    expect(res.status).toBe(400);
    expect(mockRevision.createPatch).not.toHaveBeenCalled();
  });
});

describe('GET /patches', () => {
  test('requires plan_id', async () => {
    const res = await request(makeApp()).get('/patches');
    expect(res.status).toBe(400);
  });

  test('lists patches for a plan', async () => {
    (mockRevision.listPatchesForPlan as jest.Mock).mockResolvedValue([{ id: 'p-1', status: 'applied' }]);
    const res = await request(makeApp()).get('/patches?plan_id=a0000000-0000-4000-8000-000000000001');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /patches/:id/reject', () => {
  test('rejects a patch', async () => {
    (mockRevision.rejectPatch as jest.Mock).mockResolvedValue(undefined);
    const res = await request(makeApp()).post(`/patches/${UUID_PARAM}/reject`).send({ conflictReason: 'nope' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
  });

  test('maps PatchNotFoundError to 404', async () => {
    (mockRevision.rejectPatch as jest.Mock).mockRejectedValue(new PatchNotFoundError('x'));
    const res = await request(makeApp()).post(`/patches/${UUID_PARAM}/reject`).send({ conflictReason: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('POST /patches/:id/rollback', () => {
  test('rolls back a patch and returns the restored entities', async () => {
    (mockRevision.rollbackPatch as jest.Mock).mockResolvedValue({ patchId: UUID_PARAM, restored: [] });
    const res = await request(makeApp()).post(`/patches/${UUID_PARAM}/rollback`);
    expect(res.status).toBe(200);
    expect(res.body.data.restored).toEqual([]);
  });
});

describe('claims endpoints', () => {
  test('GET /claims lists with status filter', async () => {
    (mockClaims.listClaims as jest.Mock).mockResolvedValue([{ id: 'c-1', status: 'proposed' }]);
    const res = await request(makeApp()).get('/claims?plan_id=a0000000-0000-4000-8000-000000000001&status=proposed');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockClaims.listClaims).toHaveBeenCalledWith(expect.objectContaining({ status: 'proposed' }));
  });

  test('GET /claims/:id returns detail', async () => {
    (mockClaims.getClaimDetail as jest.Mock).mockResolvedValue({ claim: { id: UUID_PARAM }, evidence: [], transitions: [] });
    const res = await request(makeApp()).get(`/claims/${UUID_PARAM}`);
    expect(res.status).toBe(200);
    expect(res.body.data.claim.id).toBe(UUID_PARAM);
  });

  test('POST /claims/:id/transition maps invalid transition to 400', async () => {
    const { ClaimTransitionError } = await import('../../src/services/errors.js');
    (mockClaims.transitionClaim as jest.Mock).mockRejectedValue(new ClaimTransitionError('bad edge'));
    const res = await request(makeApp())
      .post(`/claims/${UUID_PARAM}/transition`)
      .send({ to: 'merged', conflictReason: 'x' });
    expect(res.status).toBe(400);
  });

  test('POST /claims/:id/evidence appends evidence', async () => {
    (mockClaims.recordEvidence as jest.Mock).mockResolvedValue({ id: 'e-1', claimId: UUID_PARAM });
    const res = await request(makeApp())
      .post(`/claims/${UUID_PARAM}/evidence`)
      .send({ evidenceText: 'found in chapter 5' });
    expect(res.status).toBe(200);
    expect(res.body.data.claimId).toBe(UUID_PARAM);
  });
});