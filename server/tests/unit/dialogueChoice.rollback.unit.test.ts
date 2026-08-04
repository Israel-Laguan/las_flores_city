import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ============================================================
// processChoiceInTransaction — rejected choices must not commit
//
// Regression test for the vault/time-block leak: processChoice
// inserts the vault item BEFORE the time_block_cost guard runs, so a
// `{ success: false }` return from inside withOLTPTransaction used to
// COMMIT the insert — the player kept a gated item without paying the
// TB cost. The failure paths now throw ChoiceFailureError, which makes
// withOLTPTransaction roll back, and processChoiceInTransaction maps
// the error back to a `{ success: false, error }` result.
//
// Mirrors IronGateValidator.rollback.unit.test.ts (the chunk-boundary
// equivalent) and mocks all DB/Redis-bearing modules (AGENTS.md rule 7).
// ============================================================

const VALID_ITEM_ID = '550e8400-e29b-41d4-a716-446655440000';
const MISSING_ITEM_ID = '11111111-2222-3333-4444-555555555555';

// Transaction outcome tracker — set by the mocked withOLTPTransaction.
const tx = { commitCalled: false, rollbackCalled: false };

// Records every statement the transaction attempted, so a test can prove
// the vault insert really was issued before the guard rejected the choice
// (i.e. only the ROLLBACK protects the player's balance).
const statements: Array<{ sql: string; params: any[] }> = [];

const fakePgClient = {
  query: jest.fn(),
} as any;

const defaultQueryImpl = async (sql: string, params: any[] = []) => {
  statements.push({ sql, params });
  if (sql.includes('FROM vault_items')) {
    return params[0] === VALID_ITEM_ID
      ? { rows: [{ id: VALID_ITEM_ID, title: 'Sealed Dossier' }] }
      : { rows: [] };
  }
  return { rows: [] };
};

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [] })),
  // Model real transaction semantics: commit on normal return,
  // rollback + rethrow on a thrown error.
  withOLTPTransaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => {
    try {
      const result = await cb(fakePgClient);
      tx.commitCalled = true;
      return result;
    } catch (err) {
      tx.rollbackCalled = true;
      throw err;
    }
  }),
}));

jest.mock('../../src/services/DialogueResolver.js', () => ({
  DialogueResolver: { resolveTreeForUser: jest.fn(), resolveChunkForUser: jest.fn() },
}));

jest.mock('../../src/routes/dialogue-breakthrough-helpers.js', () => ({
  processBreakthroughSolve: jest.fn(async () => ({ result: undefined, status: undefined })),
}));

const spendTimeBlocksMock = jest.fn<any>();
jest.mock('../../src/database/repositories/PlayerStateRepository.js', () => ({
  PlayerStateRepository: {
    spendTimeBlocks: spendTimeBlocksMock,
    clearDialogueAndSimulation: jest.fn(async () => undefined),
    getDialogueCursor: jest.fn(async () => null),
    setDialogueCursor: jest.fn(async () => undefined),
    setAlignment: jest.fn(async () => undefined),
    mergeFlags: jest.fn(async () => undefined),
    mergeState: jest.fn(async () => undefined),
    mergeStatsClamped: jest.fn(async () => undefined),
    setStoryBeat: jest.fn(async () => undefined),
    modifyBalance: jest.fn(async () => undefined),
  },
}));

import { processChoiceInTransaction } from '../../src/routes/dialogue-helpers.js';

const NODES = {
  'node-2': { id: 'node-2', text: 'You take the dossier.', is_end: true, choices: [] },
};

function makeChoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'choice-1',
    text: 'Take the sealed dossier',
    next_node_id: 'node-2',
    ...overrides,
  } as any;
}

function vaultInserts() {
  return statements.filter((s) => s.sql.includes('INSERT INTO player_vault'));
}

function relationshipChanges() {
  return statements.filter((s) => s.sql.includes('upsert_user_relationship'));
}

beforeEach(() => {
  tx.commitCalled = false;
  tx.rollbackCalled = false;
  statements.length = 0;
  spendTimeBlocksMock.mockReset();
  fakePgClient.query.mockImplementation(defaultQueryImpl);
});

describe('processChoiceInTransaction — rejected choice rolls back partial mutations', () => {
  it('does NOT commit the vault unlock when the time_block_cost guard rejects the choice', async () => {
    // Player cannot afford the choice.
    spendTimeBlocksMock.mockResolvedValue({ success: false });

    const result = await processChoiceInTransaction(
      'user-1',
      'dialogue-1',
      0,
      makeChoice({
        vault_unlock: VALID_ITEM_ID,
        time_block_cost: { amount: 5 },
      }),
      'node-1',
      NODES
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('insufficient_time_blocks');

    // The vault insert WAS issued (proving the ordering) ...
    expect(vaultInserts()).toHaveLength(1);
    // ... but the transaction rolled back, so the player keeps nothing.
    expect(tx.rollbackCalled).toBe(true);
    expect(tx.commitCalled).toBe(false);
  });

  it('commits the vault unlock together with the TB deduction when the player can pay', async () => {
    spendTimeBlocksMock.mockResolvedValue({ success: true, remaining: 10 });

    const result = await processChoiceInTransaction(
      'user-1',
      'dialogue-1',
      0,
      makeChoice({
        vault_unlock: VALID_ITEM_ID,
        time_block_cost: { amount: 5 },
      }),
      'node-1',
      NODES
    );

    expect(result.success).toBe(true);
    expect(result.timeBlocksSpent).toBe(5);
    expect(result.unlockedVaultItem).toEqual({ id: VALID_ITEM_ID, title: 'Sealed Dossier' });
    expect(vaultInserts()).toHaveLength(1);
    expect(tx.commitCalled).toBe(true);
    expect(tx.rollbackCalled).toBe(false);
  });

  it('deducts time blocks on the SAME client as the vault insert (one atomic unit)', async () => {
    spendTimeBlocksMock.mockResolvedValue({ success: true, remaining: 10 });

    await processChoiceInTransaction(
      'user-1',
      'dialogue-1',
      0,
      makeChoice({ vault_unlock: VALID_ITEM_ID, time_block_cost: { amount: 3 } }),
      'node-1',
      NODES
    );

    // A separate pooled connection would commit the deduction
    // independently of this transaction and survive a rollback.
    expect(spendTimeBlocksMock).toHaveBeenCalledWith(fakePgClient, 'user-1', 3);
  });

  it('rolls back and never charges time blocks when the vault reference is stale', async () => {
    spendTimeBlocksMock.mockResolvedValue({ success: true, remaining: 10 });

    const result = await processChoiceInTransaction(
      'user-1',
      'dialogue-1',
      0,
      makeChoice({ vault_unlock: MISSING_ITEM_ID, time_block_cost: { amount: 5 } }),
      'node-1',
      NODES
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_vault_item');
    expect(spendTimeBlocksMock).not.toHaveBeenCalled();
    expect(vaultInserts()).toHaveLength(0);
    expect(tx.rollbackCalled).toBe(true);
    expect(tx.commitCalled).toBe(false);
  });

  it('rolls back an unresolvable next node instead of committing choice mutations', async () => {
    const result = await processChoiceInTransaction(
      'user-1',
      'dialogue-1',
      0,
      makeChoice({ next_node_id: 'does-not-exist', vault_unlock: VALID_ITEM_ID }),
      'node-1',
      NODES
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_next_node');
    expect(vaultInserts()).toHaveLength(0);
    expect(tx.rollbackCalled).toBe(true);
    expect(tx.commitCalled).toBe(false);
  });

  it('does NOT commit relationship changes when the time_block_cost guard rejects the choice', async () => {
    // Player cannot afford the choice.
    spendTimeBlocksMock.mockResolvedValue({ success: false });

    const nodesWithSpeaker = {
      'node-2': { id: 'node-2', text: 'You take the dossier.', speaker_id: 'speaker-1', is_end: true, choices: [] },
    };

    const result = await processChoiceInTransaction(
      'user-1',
      'dialogue-1',
      0,
      makeChoice({
        relationship_change: { stat: 'friendship', amount: 5 },
        time_block_cost: { amount: 5 },
      }),
      'node-1',
      nodesWithSpeaker
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('insufficient_time_blocks');

    // Flow order: vault unlock (success) -> time-block cost guard throws -> relationship processing is never reached
    expect(relationshipChanges()).toHaveLength(0);
    expect(tx.rollbackCalled).toBe(true);
    expect(tx.commitCalled).toBe(false);
  });

  it('commits relationship changes together with other mutations when the player can pay', async () => {
    spendTimeBlocksMock.mockResolvedValue({ success: true, remaining: 10 });

    const nodesWithSpeaker = {
      'node-2': { id: 'node-2', text: 'You take the dossier.', speaker_id: 'speaker-1', is_end: true, choices: [] },
    };

    const result = await processChoiceInTransaction(
      'user-1',
      'dialogue-1',
      0,
      makeChoice({
        relationship_change: { stat: 'friendship', amount: 5 },
        time_block_cost: { amount: 5 },
      }),
      'node-1',
      nodesWithSpeaker
    );

    expect(result.success).toBe(true);
    expect(relationshipChanges()).toHaveLength(1);
    expect(relationshipChanges()[0]).toEqual({
      sql: 'SELECT upsert_user_relationship($1, $2, $3, $4)',
      params: ['user-1', 'speaker-1', 5, 0],
    });
    expect(tx.commitCalled).toBe(true);
    expect(tx.rollbackCalled).toBe(false);
  });

  it('rolls back relationship changes if a subsequent database query throws an error', async () => {
    spendTimeBlocksMock.mockResolvedValue({ success: true, remaining: 10 });

    const nodesWithSpeaker = {
      'node-2': { id: 'node-2', text: 'You take the dossier.', speaker_id: 'speaker-1', is_end: true, choices: [] },
    };

    // Make the subsequent database query fail (e.g. during player_dialogue_states insert)
    fakePgClient.query.mockImplementation(async (sql: string, params: any[] = []) => {
      statements.push({ sql, params });
      if (sql.includes('FROM vault_items')) {
        return { rows: [] };
      }
      if (sql.includes('player_dialogue_states')) {
        throw new Error('Database connection lost');
      }
      return { rows: [] };
    });

    await expect(
      processChoiceInTransaction(
        'user-1',
        'dialogue-1',
        0,
        makeChoice({
          relationship_change: { stat: 'friendship', amount: 5 },
          time_block_cost: { amount: 5 },
        }),
        'node-1',
        nodesWithSpeaker
      )
    ).rejects.toThrow('Database connection lost');

    // The relationship query was actually issued...
    expect(relationshipChanges()).toHaveLength(1);
    expect(relationshipChanges()[0]).toEqual({
      sql: 'SELECT upsert_user_relationship($1, $2, $3, $4)',
      params: ['user-1', 'speaker-1', 5, 0],
    });

    // ...but the transaction rolled back!
    expect(tx.rollbackCalled).toBe(true);
    expect(tx.commitCalled).toBe(false);
  });
});
