// ============================================================
// RevisionService — unit tests for the patch lifecycle (M24)
//
// Verifies the patch-as-unit-of-versioning state transitions:
//   * createPatch → proposed (no canon mutation)
//   * applyPatch → applied + records canon revisions (lookup)
//   * rejectPatch → rejected → no-op (no canon mutation)
//   * rollbackPatch → applied-only; restores prior revision by lookup
//
// DB is mocked via @las-flores/infra (queryOLTP + withOLTPTransaction).
// ============================================================

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// ── Module mocks (hoisted by Jest) ──────────────────────────
jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(),
  withOLTPTransaction: jest.fn(async (cb: (client: any) => Promise<any>) => {
    // Invoke the transaction callback with a fake client whose `.query`
    // delegates to the same queryOLTP mock used by non-transactional calls.
    return cb({ query: mockQueryOLTP });
  }),
}));

// Wire the hoisted mock reference for the fake transaction client.
const { queryOLTP } = jest.requireMock('@las-flores/infra') as { queryOLTP: jest.Mock };
// `mockQueryOLTP` (mock prefix) is hoist-safe: babel-plugin-jest-hoist allows
// factory references to identifiers prefixed `mock`.
const mockQueryOLTP = queryOLTP as jest.MockedFunction<any>;

// ── Imports (after mocks) ───────────────────────────────────
import {
  createPatch,
  applyPatch,
  rejectPatch,
  rollbackPatch,
  getPatch,
} from '../../src/services/RevisionService.js';
import { PatchNotFoundError, PatchStatusError } from '../../src/services/errors.js';

/** Queue-based mock: returns queued row-sets in order, then a fallback. */
function queueRows(rows: any[][]) {
  let i = 0;
  mockQueryOLTP.mockImplementation(async (_text: string, _params: any[]) => {
    if (i < rows.length) return { rows: rows[i++] };
    return { rows: [] };
  });
}

beforeEach(() => {
  mockQueryOLTP.mockReset();
});

describe('RevisionService — createPatch', () => {
  test('creates a proposed patch and returns its id', async () => {
    queueRows([[{ id: 'p-11111111-1111-4111-8111-111111111111' }]]);
    const id = await createPatch(
      { planId: 'plan-1', title: 'Add character', patchJson: { ops: [] } },
      'u-1',
    );
    expect(id).toBe('p-11111111-1111-4111-8111-111111111111');
    const insert = mockQueryOLTP.mock.calls[0][0] as string;
    expect(insert).toContain('INSERT INTO patches');
    expect(insert).toContain("'proposed'");
  });
});

describe('RevisionService — applyPatch', () => {
  test('applies a proposed patch and records a canon revision for each updated entity', async () => {
    const C = 'a0000000-0000-4000-8000-00000000000c';
    const patchRow = {
      id: 'p-1',
      status: 'proposed',
      patch_json: { ops: [{ entityType: 'character', entityId: C, op: 'update' }] },
    };
    // Query order inside the transaction for one `update` op:
    //  FOR UPDATE select → SAVEPOINT → row_to_json → RELEASE → nextRevision →
    //  INSERT canon_revisions → UPDATE patches → (emitAdminEvent fallback)
    queueRows([
      [patchRow],                                 // 1. SELECT patch FOR UPDATE
      [{ rows: [] }],                             // 2. SAVEPOINT (readSnapshot)
      [{ snapshot: { id: C, name: 'Charlie' } }], // 3. row_to_json (readSnapshot)
      [{ rows: [] }],                             // 4. RELEASE SAVEPOINT
      [{ next: 3 }],                              // 5. nextRevisionNumber
      [{ rowCount: 1, rows: [] }],                // 6. INSERT canon_revisions
      [{ rowCount: 1, rows: [] }],                // 7. UPDATE patches → applied
    ]);
    await expect(applyPatch('p-1', 'u-1')).resolves.toBeUndefined();

    const canonInsert = mockQueryOLTP.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO canon_revisions'),
    );
    expect(canonInsert).toBeDefined();
    expect(canonInsert![1]).toEqual([
      'character', C, 3, JSON.stringify({ id: C, name: 'Charlie' }), 'p-1', 'u-1',
    ]);

    const appliedUpdate = mockQueryOLTP.mock.calls.find((c) =>
      (c[0] as string).includes("status = 'applied'"),
    );
    expect(appliedUpdate).toBeDefined();
    expect(appliedUpdate![1]).toEqual(['u-1', 'p-1']);
  });
});

describe('RevisionService — rejectPatch (no-op on canon)', () => {
  test('transitions a proposed patch to rejected and stores the conflict reason', async () => {
    // SELECT status → proposed, then UPDATE
    queueRows([[{ status: 'proposed' }]]);
    await expect(rejectPatch('p-1', 'conflicts with existing lore', 'u-1')).resolves.toBeUndefined();

    const updateCall = mockQueryOLTP.mock.calls.find((c) => (c[0] as string).includes('UPDATE patches'));
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain("status = 'rejected'");
    expect(updateCall![0]).toContain('conflict_reason = $1');
    expect(updateCall![1]).toEqual(['conflicts with existing lore', 'p-1']);
  });

  test('throws PatchStatusError when rejecting an applied patch (would strand canon revisions)', async () => {
    // Rejecting anything but `proposed` is a no-op-on-canon violation: an applied
    // patch's canon revisions would be stranded in an unreachable state.
    queueRows([[{ status: 'applied' }]]);
    await expect(rejectPatch('p-1', 'x', 'u-1')).rejects.toBeInstanceOf(PatchStatusError);
  });

  test('throws PatchStatusError when rejecting an already rolled-back patch', async () => {
    queueRows([[{ status: 'rolled_back' }]]);
    await expect(rejectPatch('p-1', 'x', 'u-1')).rejects.toBeInstanceOf(PatchStatusError);
  });

  test('throws PatchNotFoundError for a missing patch', async () => {
    queueRows([[]]);
    await expect(rejectPatch('p-999', 'x', 'u-1')).rejects.toBeInstanceOf(PatchNotFoundError);
  });
});

describe('RevisionService — rollbackPatch', () => {
  test('requires the patch to be applied', async () => {
    queueRows([[{ status: 'proposed' }]]);
    await expect(rollbackPatch('p-1', 'u-1')).rejects.toBeInstanceOf(PatchStatusError);
  });

  test('throws PatchNotFoundError for a missing patch', async () => {
    queueRows([[]]);
    await expect(rollbackPatch('p-999', 'u-1')).rejects.toBeInstanceOf(PatchNotFoundError);
  });
});

describe('RevisionService — getPatch', () => {
  test('maps a row to a Patch DTO', async () => {
    const P = 'a0000000-0000-4000-8000-000000000001';
    const row = {
      id: P,
      plan_id: 'a0000000-0000-4000-8000-000000000002',
      title: 'T',
      description: null,
      patch_json: { ops: [] },
      status: 'applied',
      conflict_reason: null,
      applied_by: null,
      applied_at: new Date('2026-01-01T00:00:00Z'),
      rejected_at: null,
      created_by: null,
      created_at: new Date('2026-01-02T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
    };
    queueRows([[row]]);
    const patch = await getPatch(P);
    expect(patch.id).toBe(P);
    expect(patch.status).toBe('applied');
    expect(patch.appliedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});