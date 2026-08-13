// ============================================================
// ClaimsService — unit tests for the claims/evidence lifecycle (M24)
//
// Verifies the claim state machine and append-only journal:
//   * createClaim → proposed + initial transition journal row
//   * transitionClaim → validates the allowed edges (proposed/accepted/
//     rejected/merged) and records an append-only transition
//   * recordEvidence → appends immutable evidence to a claim
//   * listClaims / getClaimDetail → mapping + filtering
//   * rejectClaimsForPatch → rejects a patch's proposed/merged claims
//
// DB is mocked via @las-flores/infra (queryOLTP + withOLTPTransaction).
// ============================================================

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(),
  withOLTPTransaction: jest.fn(async (cb: (client: any) => Promise<any>) => {
    // Invoke the transaction callback with a fake client whose `.query`
    // delegates to the same queryOLTP mock used by non-transactional calls.
    return cb({ query: queryOLTPMock });
  }),
}));

const { queryOLTP } = jest.requireMock('@las-flores/infra') as { queryOLTP: jest.Mock };
const queryOLTPMock = queryOLTP;

import {
  createClaim,
  transitionClaim,
  recordEvidence,
  listClaims,
  getClaimDetail,
  rejectClaimsForPatch,
} from '../../src/services/ClaimsService.js';
import { ClaimNotFoundError, ClaimTransitionError } from '../../src/services/errors.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<any>;

function resetQueue(rows: any[][]) {
  mockQueryOLTP.mockReset();
  let i = 0;
  mockQueryOLTP.mockImplementation(async () => {
    if (i < rows.length) return { rows: rows[i++] };
    return { rows: [] };
  });
}

const CLAIM_ID = 'c1111111-1111-4111-8111-111111111111';

function claimRow(overrides: Record<string, any> = {}) {
  return {
    id: CLAIM_ID,
    plan_id: null,
    patch_id: null,
    source_span: 'line 12',
    source_ref: 'character:hansel',
    confidence: 0.8,
    status: 'proposed',
    conflict_reason: null,
    claim_text: 'Hansel is a gravedigger',
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQueryOLTP.mockReset();
});

describe('createClaim', () => {
  test('creates a proposed claim and an initial transition journal row', async () => {
    resetQueue([[{ id: CLAIM_ID }]]);
    const id = await createClaim(
      { planId: 'plan-1', claimText: 'Hansel is a gravedigger', confidence: 0.8, sourceSpan: 'line 12' },
      'u-1',
    );
    expect(id).toBe(CLAIM_ID);
    const insert = mockQueryOLTP.mock.calls[0][0] as string;
    expect(insert).toContain('INSERT INTO claims');
    const transition = mockQueryOLTP.mock.calls[1][0] as string;
    expect(transition).toContain('INSERT INTO claim_transitions');
  });
});

describe('transitionClaim', () => {
  test('accepted -> rejected is a valid transition', async () => {
    resetQueue([
      [claimRow({ status: 'accepted' })],
      [{ rowCount: 1, rows: [] }],
      [{ rowCount: 1, rows: [] }],
      [claimRow({ status: 'rejected', conflict_reason: 'balance' })],
    ]);
    const updated = await transitionClaim(CLAIM_ID, 'rejected', 'balance', 'u-1');
    expect(updated.status).toBe('rejected');
    const transition = mockQueryOLTP.mock.calls[1][0] as string;
    expect(transition).toContain('INSERT INTO claim_transitions');
  });

  test('accepts the edge: accepted -> merged', async () => {
    resetQueue([
      [claimRow({ status: 'accepted' })],
      [{ rowCount: 1, rows: [] }],
      [{ rowCount: 1, rows: [] }],
      [claimRow({ status: 'merged', conflict_reason: 'resolved' })],
    ]);
    const updated = await transitionClaim(CLAIM_ID, 'merged', 'resolved', 'u-1');
    expect(updated.status).toBe('merged');
  });

  test('rejects an invalid edge: merged -> anything', async () => {
    resetQueue([[claimRow({ status: 'merged' })]]);
    await expect(transitionClaim(CLAIM_ID, 'accepted', 'x', 'u-1')).rejects.toBeInstanceOf(ClaimTransitionError);
  });

  test('throws ClaimNotFoundError for a missing claim', async () => {
    resetQueue([[]]);
    await expect(transitionClaim('c999', 'accepted')).rejects.toBeInstanceOf(ClaimNotFoundError);
  });
describe('recordEvidence', () => {
  test('appends immutable evidence to a claim', async () => {
    resetQueue([
      [claimRow()],
      [{
        id: 'e1111111-1111-4111-8111-111111111111',
        claim_id: CLAIM_ID,
        source_span: 'line 12',
        source_ref: null,
        evidence_text: 'The novel describes him with a spade',
        created_by: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
      }],
    ]);
    const ev = await recordEvidence(CLAIM_ID, { sourceSpan: 'line 12', evidenceText: 'The novel describes him with a spade' }, 'u-1');
    expect(ev.claimId).toBe(CLAIM_ID);
    expect(mockQueryOLTP.mock.calls[1][0]).toContain('INSERT INTO evidence');
  });

  test('throws ClaimNotFoundError when the claim is missing', async () => {
    resetQueue([[]]);
    await expect(recordEvidence('c999', { evidenceText: 'x' })).rejects.toBeInstanceOf(ClaimNotFoundError);
  });
});

describe('listClaims / getClaimDetail', () => {
  test('listClaims passes a status filter clause', async () => {
    resetQueue([[claimRow()]]);
    const claims = await listClaims({ planId: 'plan-1', status: 'proposed' });
    expect(claims).toHaveLength(1);
    expect(claims[0].status).toBe('proposed');
    const sql = mockQueryOLTP.mock.calls[0][0] as string;
    expect(sql).toContain('status = $2');
  });

  test('getClaimDetail maps evidence + transitions', async () => {
    resetQueue([
      [claimRow()],
      [{
        id: 'e0000000-0000-4000-8000-000000000001', claim_id: CLAIM_ID, source_span: null, source_ref: null,
        evidence_text: 'ev', created_by: null, created_at: new Date('2026-01-01T00:00:00Z'),
      }],
      [{
        id: 'e0000000-0000-4000-8000-000000000002', claim_id: CLAIM_ID, from_status: null, to_status: 'proposed',
        conflict_reason: null, created_by: null, created_at: new Date('2026-01-01T00:00:00Z'),
      }],
    ]);
    const detail = await getClaimDetail(CLAIM_ID);
    expect(detail.evidence).toHaveLength(1);
    expect(detail.transitions).toHaveLength(1);
    expect(detail.transitions[0].toStatus).toBe('proposed');
  });
});

describe('rejectClaimsForPatch', () => {
  test("rejects a patch's proposed claims", async () => {
    resetQueue([
      [claimRow()], // listClaims(patch) → proposed claim
      [claimRow({ status: 'proposed' })], // transition read
      [{ rowCount: 1, rows: [] }],        // transition insert
      [{ rowCount: 1, rows: [] }],        // transition update
      [claimRow({ status: 'rejected' })], // transition re-read
    ]);
    const count = await rejectClaimsForPatch('p-1', 'patch rejected');
    expect(count).toBe(1);
  });
});
});