import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// IronGateValidator Property-Based Tests
//
// Feature: runtime-rewrite-dialogue-chunks
//
// Properties under test:
//   Property 3: Free leaf allows seamless transition
//   Property 4: Guarded leaf enforces all reasons
//   Property 5: TB deduction is atomic
//
// Validates: Requirements 3.3, 3.4, 3.5, 3.10
//
// Mocking strategy:
//   - withOLTPTransaction is mocked to run the callback with a
//     fake pg.PoolClient, keeping tests DB-free.
//   - PlayerStateRepository.spendTimeBlocks is mocked per test to
//     simulate sufficient / insufficient TB balance.
//   - Other repository calls (mergeFlags, setStoryBeat, client.query)
//     are mocked to no-ops so irrelevant guards don't interfere.
// ============================================================

// ── Module mocks ──────────────────────────────────────────────

// Mock withOLTPTransaction to run the callback immediately with a
// fake client. This prevents any real DB connection.
jest.mock('../../src/database/connection.js', () => ({
  withOLTPTransaction: jest.fn(
    async (cb: (client: unknown) => Promise<unknown>) => {
      return cb(fakePgClient);
    }
  ),
}));

jest.mock('../../src/database/repositories/PlayerStateRepository.js', () => ({
  PlayerStateRepository: {
    spendTimeBlocks: jest.fn(),
    mergeFlags: jest.fn(async () => undefined),
    setStoryBeat: jest.fn(async () => undefined),
  },
}));

// mystery_solve guard calls client.query directly — mock returns
// no rows by default (player NOT INVESTIGATING).
const fakePgClient = {
  query: jest.fn(async () => ({ rows: [] })),
} as unknown as import('pg').PoolClient;

// ── Imports (after mocks) ─────────────────────────────────────

import { IronGateValidator } from '../../src/services/IronGateValidator.js';
import { PlayerStateRepository } from '../../src/database/repositories/PlayerStateRepository.js';
import { closeRedis } from '../../src/database/redis.js';
import type { FreeLeaf, GuardedLeaf, BoundaryReason } from '@las-flores/shared';

// ── Arbitraries ───────────────────────────────────────────────

/** Generates a valid FREE leaf. */
const freeLeafArb = (): fc.Arbitrary<FreeLeaf> =>
  fc
    .string({ minLength: 1, maxLength: 40 })
    .map((target_chunk) => ({ type: 'FREE' as const, target_chunk }));

/** Generates a valid userId string (UUID-like). */
const userIdArb = (): fc.Arbitrary<string> =>
  fc.uuid();

/** Generates a valid tb_cost in 1..24. */
const tbCostArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 24 });

/** Generates a GUARDED leaf with only non-DB-dependent reasons
 *  (conditional, overlay_gate, relationship_change, vault_unlock).
 *  Used to test Property 4's pass path without needing live DB mocks. */
const simpleGuardedLeafArb = (): fc.Arbitrary<GuardedLeaf> =>
  fc
    .subarray(
      ['conditional', 'overlay_gate', 'relationship_change', 'vault_unlock'] as BoundaryReason[],
      { minLength: 1 }
    )
    .chain((reasons) =>
      fc.string({ minLength: 1, maxLength: 40 }).map((target_chunk) => ({
        type: 'GUARDED' as const,
        target_chunk,
        reasons,
      }))
    );

/** Generates a GUARDED leaf with a time_block_cost reason and explicit tb_cost. */
const tbGuardedLeafArb = (): fc.Arbitrary<GuardedLeaf & { tb_cost: number }> =>
  fc
    .record({
      target_chunk: fc.string({ minLength: 1, maxLength: 40 }),
      tb_cost: tbCostArb(),
    })
    .map(({ target_chunk, tb_cost }) => ({
      type: 'GUARDED' as const,
      target_chunk,
      reasons: ['time_block_cost' as BoundaryReason],
      tb_cost,
    }));

// ── Test setup ────────────────────────────────────────────────

afterAll(async () => {
  await closeRedis();
});

beforeEach(() => {
  jest.clearAllMocks();

  // Reset fakePgClient.query to return no rows (mystery guard = not eligible).
  (fakePgClient.query as jest.Mock).mockResolvedValue({ rows: [] });
});

// ── Free leaf allows seamless transition ─────────────────────
//
// For ANY FREE leaf and ANY userId/chunkId/choiceId, validateChoice
// MUST return { success: true } immediately, without invoking any
// guard validation or database calls.
//
// Validates: Requirement 3.3
// ─────────────────────────────────────────────────────────────

describe('Free leaf allows seamless transition', () => {
  it('returns success:true for any FREE leaf without touching the DB', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb(),
        fc.uuid(),    // chunkId
        fc.string({ minLength: 1, maxLength: 40 }), // choiceId
        freeLeafArb(),
        async (userId, chunkId, choiceId, leaf) => {
          const result = await IronGateValidator.validateChoice(
            userId,
            chunkId,
            choiceId,
            leaf
          );

          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();

          // No DB or transaction should be touched for a FREE leaf.
          const { withOLTPTransaction } = await import('../../src/database/connection.js');
          expect(withOLTPTransaction).not.toHaveBeenCalled();
          expect(PlayerStateRepository.spendTimeBlocks).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });
});

// ── Guarded leaf enforces all reasons ────────────────────────
//
// Sub-property 4a: When ALL guard conditions are satisfiable
// (no TB cost, no mystery_solve, no effects — only pass-through
// reasons like conditional/overlay_gate/relationship_change/
// vault_unlock), validateChoice MUST return { success: true }.
//
// Sub-property 4b: When a GUARDED leaf has 'time_block_cost' and
// the player's TB balance is INSUFFICIENT, validateChoice MUST
// return { success: false, error: 'insufficient_time_blocks' }.
//
// Sub-property 4c: When a GUARDED leaf has 'mystery_solve' and
// the player has NO INVESTIGATING mystery, validateChoice MUST
// return { success: false, error: 'mystery_not_eligible' }.
//
// Validates: Requirements 3.4, 3.10
// ─────────────────────────────────────────────────────────────

describe('Guarded leaf enforces all reasons', () => {
  it('4a — returns success:true when all guard reasons pass (no DB-blocking reasons)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 40 }),
        simpleGuardedLeafArb(),
        async (userId, chunkId, choiceId, leaf) => {
          const result = await IronGateValidator.validateChoice(
            userId,
            chunkId,
            choiceId,
            leaf
          );

          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('4b — returns insufficient_time_blocks when TB balance is too low', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 40 }),
        tbGuardedLeafArb(),
        async (userId, chunkId, choiceId, leaf) => {
          // Reset per-iteration.
          jest.clearAllMocks();
          (fakePgClient.query as jest.Mock).mockResolvedValue({ rows: [] });

          // Simulate player having zero TB — always insufficient.
          (PlayerStateRepository.spendTimeBlocks as jest.Mock).mockResolvedValueOnce({
            success: false,
          });

          const result = await IronGateValidator.validateChoice(
            userId,
            chunkId,
            choiceId,
            leaf
          );

          expect(result.success).toBe(false);
          expect(result.error).toBe('insufficient_time_blocks');
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('4c — returns mystery_not_eligible when player has no INVESTIGATING mystery', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.string({ minLength: 1, maxLength: 40 }), // target_chunk
        async (userId, chunkId, choiceId, target_chunk) => {
          // Reset per-iteration.
          jest.clearAllMocks();
          // fakePgClient.query returns no rows — player NOT INVESTIGATING.
          (fakePgClient.query as jest.Mock).mockResolvedValue({ rows: [] });

          const leaf: GuardedLeaf = {
            type: 'GUARDED',
            target_chunk,
            reasons: ['mystery_solve'],
          };

          const result = await IronGateValidator.validateChoice(
            userId,
            chunkId,
            choiceId,
            leaf
          );

          expect(result.success).toBe(false);
          expect(result.error).toBe('mystery_not_eligible');
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('4d — fails on first failing reason and does not apply subsequent guards', async () => {
    // A leaf with time_block_cost first, then mystery_solve.
    // If TB fails, mystery_solve should never be checked.
    await fc.assert(
      fc.asyncProperty(
        userIdArb(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 40 }),
        tbCostArb(),
        fc.string({ minLength: 1, maxLength: 40 }),
        async (userId, chunkId, choiceId, tbCost, target_chunk) => {
          // Reset per-iteration.
          jest.clearAllMocks();

          (PlayerStateRepository.spendTimeBlocks as jest.Mock).mockResolvedValueOnce({
            success: false,
          });
          // Provide INVESTIGATING mystery so mystery_solve would pass if reached.
          (fakePgClient.query as jest.Mock).mockResolvedValueOnce({
            rows: [{ mystery_id: 'mystery-abc' }],
          });

          const leaf: GuardedLeaf = {
            type: 'GUARDED',
            target_chunk,
            reasons: ['time_block_cost', 'mystery_solve'],
            tb_cost: tbCost,
          };

          const result = await IronGateValidator.validateChoice(
            userId,
            chunkId,
            choiceId,
            leaf
          );

          // TB failed — must short-circuit.
          expect(result.success).toBe(false);
          expect(result.error).toBe('insufficient_time_blocks');

          // mystery query must NOT have been called (short-circuit).
          expect(fakePgClient.query).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });
});

// ── TB deduction is atomic ───────────────────────────────────
//
// For any GUARDED leaf with 'time_block_cost' and a player whose
// TB balance is SUFFICIENT:
//   a) validateChoice MUST return { success: true }.
//   b) spendTimeBlocks MUST be called exactly once with the exact
//      tb_cost from the leaf — no more, no less.
//   c) spendTimeBlocks MUST be called INSIDE the withOLTPTransaction
//      callback (i.e., it receives the same client as the transaction).
//   d) result.tbDeducted MUST equal leaf.tb_cost exactly.
//
// Validates: Requirements 3.5, 3.10
// ─────────────────────────────────────────────────────────────

describe('TB deduction is atomic', () => {
  it('deducts exactly tb_cost and reports it in tbDeducted when balance is sufficient', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 40 }),
        tbGuardedLeafArb(),
        fc.integer({ min: 0, max: 1000 }), // remaining balance after deduction
        async (userId, chunkId, choiceId, leaf, remaining) => {
          // Reset per-iteration so call counts are isolated across fast-check runs.
          jest.clearAllMocks();
          (fakePgClient.query as jest.Mock).mockResolvedValue({ rows: [] });

          // Simulate sufficient TB — spendTimeBlocks succeeds.
          (PlayerStateRepository.spendTimeBlocks as jest.Mock).mockResolvedValueOnce({
            success: true,
            remaining,
          });

          const result = await IronGateValidator.validateChoice(
            userId,
            chunkId,
            choiceId,
            leaf
          );

          // 5a — must succeed.
          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();

          // 5b — spendTimeBlocks called exactly once.
          expect(PlayerStateRepository.spendTimeBlocks).toHaveBeenCalledTimes(1);

          // 5b — called with the exact cost from the leaf, not more or less.
          const [clientArg, userIdArg, amountArg] =
            (PlayerStateRepository.spendTimeBlocks as jest.Mock).mock.calls[0];
          expect(userIdArg).toBe(userId);
          expect(amountArg).toBe(leaf.tb_cost);

          // 5c — called with the fake client (proof it runs inside the transaction).
          expect(clientArg).toBe(fakePgClient);

          // 5d — tbDeducted in result equals the leaf's tb_cost exactly.
          expect(result.tbDeducted).toBe(leaf.tb_cost);
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('does not call spendTimeBlocks when leaf has no tb_cost field', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 40 }),
        simpleGuardedLeafArb(), // no time_block_cost reason
        async (userId, chunkId, choiceId, leaf) => {
          // Reset per-iteration.
          jest.clearAllMocks();
          (fakePgClient.query as jest.Mock).mockResolvedValue({ rows: [] });
          const result = await IronGateValidator.validateChoice(
            userId,
            chunkId,
            choiceId,
            leaf
          );

          // No TB reason → spendTimeBlocks never touched.
          expect(PlayerStateRepository.spendTimeBlocks).not.toHaveBeenCalled();
          // And the guard should succeed.
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });
});
