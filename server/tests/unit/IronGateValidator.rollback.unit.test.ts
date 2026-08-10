import { describe, it, expect, jest as jestGlobals, beforeEach, afterAll } from '@jest/globals';

// ============================================================
// IronGateValidator — guard-failure rollback
//
// Regression test for the critical fix: choice-level effects are
// applied BEFORE the boundary guards run (to mirror the intra-chunk
// processChoice order), but a guard failure must NOT commit those
// effects. withOLTPTransaction commits on a normal return and rolls
// back only on a thrown error, so the validator now throws a
// GuardFailureError on rejection. This mock models those semantics:
//   - callback returns normally  -> commit
//   - callback throws            -> rollback (and re-throw)
//
// If the validator wrongly returned `{ success: false }` instead of
// throwing, the transaction would "commit" and the already-applied
// choice effects would persist — exactly the bug this test guards.
//
// Mocking mirrors IronGateValidator.property.test.ts (AGENTS.md rule 7):
// no real DB/Redis connections.
// ============================================================

// Transaction outcome tracker — set by the mocked withOLTPTransaction.
const tx = { commitCalled: false, rollbackCalled: false };

const fakePgClient = {
  query: jestGlobals.fn(async () => ({ rows: [] })),
} as unknown as import('pg').PoolClient;

// Mock withOLTPTransaction to model real commit/rollback semantics.
jestGlobals.mock('@las-flores/infra', () => ({
  withOLTPTransaction: jestGlobals.fn(async (cb: (client: unknown) => Promise<unknown>) => {
    try {
      const result = await cb(fakePgClient);
      tx.commitCalled = true;
      return result;
    } catch (err) {
      tx.rollbackCalled = true;
      throw err;
    }
  }),
  queryOLTP: jestGlobals.fn(),
  getCache: jestGlobals.fn(async () => null),
  setCache: jestGlobals.fn(async () => undefined),
  deleteCache: jestGlobals.fn(async () => true),
  invalidatePattern: jestGlobals.fn(async () => 0),
  getRedis: jestGlobals.fn(),
  closeRedis: jestGlobals.fn(async () => undefined),
}));

jestGlobals.mock('../../src/database/repositories/PlayerStateRepository.js', () => ({
  PlayerStateRepository: {
    spendTimeBlocks: jestGlobals.fn(),
    modifyBalance: jestGlobals.fn(async () => undefined),
    mergeFlags: jestGlobals.fn(async () => undefined),
    setStoryBeat: jestGlobals.fn(async () => undefined),
  },
}));

jestGlobals.mock('../../src/routes/dialogue-breakthrough-helpers.js', () => ({
  processBreakthroughSolve: jestGlobals.fn(async () => ({ result: undefined, status: undefined })),
}));

// _validateEffects -> applyEffects. This is where choice_effects (stat/flag/
// state mutations) are written before the guards are evaluated.
jestGlobals.mock('../../src/routes/dialogue-helpers.js', () => ({
  applyEffects: jestGlobals.fn(async () => undefined),
}));

import { IronGateValidator } from '../../src/services/IronGateValidator.js';
import { PlayerStateRepository } from '../../src/database/repositories/PlayerStateRepository.js';
import { applyEffects } from '../../src/routes/dialogue-helpers.js';
import { closeRedis } from '@las-flores/infra';

beforeEach(() => {
  jestGlobals.clearAllMocks();
  tx.commitCalled = false;
  tx.rollbackCalled = false;
  (fakePgClient.query as jest.Mock<any>).mockResolvedValue({ rows: [] });
  (applyEffects as unknown as jest.Mock<any>).mockResolvedValue(undefined);
});

afterAll(async () => {
  await closeRedis();
});

describe('IronGateValidator — guard failure must not commit choice effects', () => {
  it('applies choice effects first, then ROLLS BACK when time_block_cost rejects the choice', async () => {
    const leaf = {
      type: 'GUARDED',
      target_chunk: 'chunk-2',
      reasons: ['time_block_cost'],
      tb_cost: 5,
      // Choice-level effects are carried into the GUARDED leaf and applied
      // before the guards run (mirrors processChoice). They must be undone
      // if a later guard rejects the choice.
      choice_effects: { flag_set: { test_flag: true } },
    } as any;

    // Insufficient TB -> time_block_cost guard fails.
    (PlayerStateRepository.spendTimeBlocks as jest.Mock<any>).mockResolvedValueOnce({ success: false });

    const result = await IronGateValidator.validateChoice('user-1', 'chunk-1', 'choice-1', leaf);

    // The choice is rejected...
    expect(result.success).toBe(false);
    expect(result.error).toBe('insufficient_time_blocks');

    // ...and choice effects WERE applied (proving ordering), but the
    // transaction was ROLLED BACK, so they are NOT committed.
    expect(applyEffects).toHaveBeenCalled();
    expect(tx.rollbackCalled).toBe(true);
    expect(tx.commitCalled).toBe(false);
  });

  it('commits when all guards pass (choice effects retained)', async () => {
    const leaf = {
      type: 'GUARDED',
      target_chunk: 'chunk-2',
      reasons: ['time_block_cost'],
      tb_cost: 5,
      choice_effects: { flag_set: { test_flag: true } },
    } as any;

    // Sufficient TB -> all guards pass.
    (PlayerStateRepository.spendTimeBlocks as jest.Mock<any>).mockResolvedValueOnce({ success: true, remaining: 100 });

    const result = await IronGateValidator.validateChoice('user-1', 'chunk-1', 'choice-1', leaf);

    expect(result.success).toBe(true);
    expect(applyEffects).toHaveBeenCalled();
    expect(tx.commitCalled).toBe(true);
    expect(tx.rollbackCalled).toBe(false);
  });
});
