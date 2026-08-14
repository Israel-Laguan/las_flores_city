// ============================================================
// StoryBuilderMigration — unit tests for partial-migration audit gap
//
// Verifies that a partially-failed `migrateStagedPlan` still records an
// applied patch + per-entity canon revisions for the files that DID succeed
// (M24 audit coverage for partial canon changes).
//
// DB + content + revision layers are mocked; we exercise the real
// `migrateStagedPlan` transition logic.
// ============================================================

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// ── Module mocks (hoisted) ──────────────────────────────────
jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(),
  withOLTPTransaction: jest.fn(),
  queryOLAP: jest.fn(),
  getCache: jest.fn(),
  setCache: jest.fn(),
  deleteCache: jest.fn(),
}));

jest.mock('../../src/content/migrate.js', () => ({
  migrateContent: jest.fn(),
}));

jest.mock('../../src/services/RevisionService.js', () => ({
  recordMigrationCanon: jest.fn(async () => 'patch-partial-00000000-0000-4000-8000-000000000001'),
}));

jest.mock('../../src/services/StoryBuilderLore.js', () => ({
  resolveContentDir: jest.fn(() => '/tmp/content'),
}));

jest.mock('../../src/services/PlanVerificationService.js', () => ({
  verifyPlanCrossReferences: jest.fn(),
}));

import { migrateStagedPlan } from '../../src/services/StoryBuilderMigration.js';
import { queryOLTP } from '@las-flores/infra';
import { migrateContent } from '../../src/content/migrate.js';
import { recordMigrationCanon } from '../../src/services/RevisionService.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;
const mockMigrateContent = migrateContent as jest.MockedFunction<typeof migrateContent>;
const mockRecord = recordMigrationCanon as jest.MockedFunction<typeof recordMigrationCanon>;

// Dedicated synthetic UUIDs (collision-avoidance per AGENTS.md).
const PLAN_ID = 'b1f2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c7e';
const USER_ID = 'b9f2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c7f';
const CHAR_ID = 'b1a2b3c4-0000-4000-8000-0000000000aa';
const SCENE_ID = 'b1a2b3c4-0000-4000-8000-0000000000bb';

const PLAN_ROW = { plan_json: { id: PLAN_ID, status: 'staged' }, status: 'staged' };

function selectPlanRow() {
  mockQueryOLTP.mockResolvedValueOnce({ rows: [PLAN_ROW], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
}
function claimRow() {
  mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });
}
function updateStatus(status: string) {
  mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] });
  // status is referenced so the helper reads meaningfully; the rowCount is what matters.
  void status;
}

beforeEach(() => {
  mockQueryOLTP.mockReset();
  mockMigrateContent.mockReset();
  mockRecord.mockReset();
  mockRecord.mockResolvedValue('patch-partial-00000000-0000-4000-8000-000000000001');
});

describe('migrateStagedPlan — partial-failure audit coverage', () => {
  test('records canon for succeeded files when migration partially fails', async () => {
    selectPlanRow();
    claimRow();
    // migrateContent fails after committing the first file to canon.
    mockMigrateContent.mockResolvedValueOnce({
      success: false,
      filesProcessed: 1,
      filesSkipped: 0,
      filesFailed: 1,
      errors: ['Failed to migrate characters/bad.yaml: checksum mismatch'],
      appliedMigrations: [
        { filePath: 'characters/char_good.yaml', contentType: 'character', contentId: CHAR_ID, action: 'created' },
        { filePath: 'scenes/scene_good.yaml', contentType: 'scene', contentId: SCENE_ID, action: 'updated' },
      ],
    });
    updateStatus('failed');

    const result = await migrateStagedPlan(PLAN_ID, undefined, undefined, USER_ID);

    // 1) The failure result + error message are unchanged.
    expect(result.success).toBe(false);
    expect(result.error).toContain('checksum mismatch');

    // 2) recordMigrationCanon is called despite the failure.
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const callArg = mockRecord.mock.calls[0][0];
    expect(callArg.planId).toBe(PLAN_ID);
    expect(callArg.userId).toBe(USER_ID);
    // Applied only includes created/updated, not skipped.
    expect(callArg.appliedMigrations).toHaveLength(2);
    expect(callArg.appliedMigrations).toEqual(
      expect.arrayContaining([
        { contentType: 'character', contentId: CHAR_ID, action: 'created' },
        { contentType: 'scene', contentId: SCENE_ID, action: 'updated' },
      ]),
    );
  });

  test('does NOT record canon when all applied migrations were skipped', async () => {
    selectPlanRow();
    claimRow();
    mockMigrateContent.mockResolvedValueOnce({
      success: false,
      filesProcessed: 0,
      filesSkipped: 2,
      filesFailed: 1,
      errors: ['Failed to migrate characters/bad.yaml'],
      appliedMigrations: [
        { filePath: 'characters/char_skip.yaml', contentType: 'character', contentId: CHAR_ID, action: 'skipped' },
      ],
    });
    updateStatus('failed');

    const result = await migrateStagedPlan(PLAN_ID, undefined, undefined, USER_ID);

    expect(result.success).toBe(false);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test('canon recording failure does not mask the original migration error', async () => {
    selectPlanRow();
    claimRow();
    mockMigrateContent.mockResolvedValueOnce({
      success: false,
      filesProcessed: 1,
      filesSkipped: 0,
      filesFailed: 1,
      errors: ['original migration error'],
      appliedMigrations: [
        { filePath: 'characters/char_good.yaml', contentType: 'character', contentId: CHAR_ID, action: 'created' },
      ],
    });
    updateStatus('failed');
    mockRecord.mockRejectedValueOnce(new Error('canon record exploded'));

    const result = await migrateStagedPlan(PLAN_ID, undefined, undefined, USER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain('original migration error');
    expect(result.error).not.toContain('canon record exploded');
  });

  test('does not re-record canon on the success branch change of behavior (still records once)', async () => {
    selectPlanRow();
    claimRow();
    mockMigrateContent.mockResolvedValueOnce({
      success: true,
      filesProcessed: 1,
      filesSkipped: 0,
      filesFailed: 0,
      errors: [],
      appliedMigrations: [
        { filePath: 'characters/char_good.yaml', contentType: 'character', contentId: CHAR_ID, action: 'created' },
      ],
    });
    updateStatus('migrated');

    const result = await migrateStagedPlan(PLAN_ID, undefined, undefined, USER_ID);

    expect(result.success).toBe(true);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  test('preserves PlanNotFoundError re-throw for permanent failures', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    await expect(migrateStagedPlan(PLAN_ID, undefined, undefined, USER_ID)).rejects.toMatchObject({ name: 'PlanNotFoundError' });
  });

  test('preserves PlanStatusError re-throw for permanent failures', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ plan_json: PLAN_ROW, status: 'migrated' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    await expect(migrateStagedPlan(PLAN_ID, undefined, undefined, USER_ID)).rejects.toMatchObject({ name: 'PlanStatusError' });
  });
});
