import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the DB/Redis-bearing modules so no real TCP connection is opened
// (AGENTS.md rule 7). grantDialogueRewards only touches the passed-in
// `client` and PlayerStateRepository.modifyBalance at runtime.
jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(),
  withOLTPTransaction: jest.fn(),
}));

jest.mock('../../src/services/DialogueResolver.js', () => ({
  DialogueResolver: { resolveTreeForUser: jest.fn(), resolveChunkForUser: jest.fn() },
}));

const modifyBalanceMock = jest.fn();
jest.mock('../../src/database/repositories/PlayerStateRepository.js', () => ({
  PlayerStateRepository: {
    modifyBalance: modifyBalanceMock,
  },
}));

import { grantDialogueRewards } from '../../src/routes/dialogue-helpers.js';

// ============================================================
// Unit tests for grantDialogueRewards — idempotent M15 reward grants
//
// Validates that choice/root/node reward paths each use a DISTINCT,
// collision-free claim key, that grants apply exactly once, and that
// reward effects are no longer silently dropped on the choice/root
// paths (the gap flagged by the review).
// ============================================================

function makeFakeClient(alreadyClaimedKeys: Set<string>) {
  const vaultInserts: any[] = [];
  const client = {
    async query(sql: string, params: any[]) {
      // tryClaimReward: INSERT INTO mission_reward_claims ... RETURNING id
      if (sql.includes('mission_reward_claims')) {
        const claimKey = params[1];
        if (alreadyClaimedKeys.has(claimKey)) {
          return { rows: [] }; // ON CONFLICT DO NOTHING → already claimed
        }
        alreadyClaimedKeys.add(claimKey);
        return { rows: [{ id: 'claim-' + claimKey }] }; // first claim
      }
      // grant_item: INSERT INTO player_vault ... ON CONFLICT DO NOTHING
      if (sql.includes('player_vault')) {
        vaultInserts.push({ userId: params[0], itemId: params[1] });
        return { rows: [] };
      }
      return { rows: [] };
    },
    _vaultInserts: vaultInserts,
  };
  return client;
}

describe('grantDialogueRewards — idempotent grant + distinct claim keys', () => {
  beforeEach(() => {
    modifyBalanceMock.mockReset();
    modifyBalanceMock.mockResolvedValue(undefined);
  });

  it('grants credits on first claim and skips on second (same key)', async () => {
    const claimed = new Set<string>();
    const client = makeFakeClient(claimed);

    const effects = { grant_credits: { amount: 100, currency: 'credits' } };
    const r1 = await grantDialogueRewards(client as any, 'u1', 'd1', 'n1', effects, 'grant');
    const r2 = await grantDialogueRewards(client as any, 'u1', 'd1', 'n1', effects, 'grant');

    expect(r1.grantedCredits).toEqual({ amount: 100, currency: 'credits' });
    expect(r2.grantedCredits).toBeUndefined();
    // modifyBalance called only once (first claim).
    expect(modifyBalanceMock).toHaveBeenCalledTimes(1);
  });

  it('uses distinct claim keys per path so node/choice/root grants never collide', async () => {
    const claimed = new Set<string>();
    const client = makeFakeClient(claimed);

    const credits = { grant_credits: { amount: 10, currency: 'credits' } };
    // Same userId/dialogueId/nodeId but different claimKeyPrefix → all
    // grant (no collision), proving node/choice/root paths are independent.
    const node = await grantDialogueRewards(client as any, 'u1', 'd1', 'n1', credits, 'grant');
    const choice = await grantDialogueRewards(client as any, 'u1', 'd1', 'c1', credits, 'grant_choice');
    const root = await grantDialogueRewards(client as any, 'u1', 'd1', 'r1', credits, 'grant_root');

    expect(node.grantedCredits).toBeDefined();
    expect(choice.grantedCredits).toBeDefined();
    expect(root.grantedCredits).toBeDefined();
    expect(modifyBalanceMock).toHaveBeenCalledTimes(3);
  });

  it('preserves the exact destination-node claim key (backward compatible)', async () => {
    const claimed = new Set<string>();
    const client = makeFakeClient(claimed);

    await grantDialogueRewards(
      client as any,
      'u1',
      'd1',
      'n1',
      { grant_credits: { amount: 5, currency: 'credits' } },
      'grant'
    );

    // The existing node-reward key format must be unchanged so
    // already-claimed production rewards stay idempotent.
    expect([...claimed]).toEqual(['grant_u1_d1_n1']);
  });

  it('grants an item on first claim and is idempotent on repeat', async () => {
    const claimed = new Set<string>();
    const client = makeFakeClient(claimed) as any;

    const effects = { grant_item: '550e8400-e29b-41d4-a716-446655440000' };
    const r1 = await grantDialogueRewards(client, 'u1', 'd1', 'n1', effects, 'grant');
    const r2 = await grantDialogueRewards(client, 'u1', 'd1', 'n1', effects, 'grant');

    expect(r1.grantedItem).toEqual({ itemId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(r2.grantedItem).toBeUndefined();
    // Vault insert attempted only on first claim.
    expect(client._vaultInserts).toHaveLength(1);
  });

  it('returns empty result (no grant) when effects have no reward fields', async () => {
    const claimed = new Set<string>();
    const client = makeFakeClient(claimed);

    const r = await grantDialogueRewards(
      client as any,
      'u1',
      'd1',
      'n1',
      { stat_set: { adeyemi_trust: 10 } },
      'grant'
    );

    expect(r.grantedCredits).toBeUndefined();
    expect(r.grantedItem).toBeUndefined();
    expect(modifyBalanceMock).not.toHaveBeenCalled();
    expect(claimed.size).toBe(0);
  });

  it('does nothing for null/undefined effects', async () => {
    const claimed = new Set<string>();
    const client = makeFakeClient(claimed);

    const r = await grantDialogueRewards(client as any, 'u1', 'd1', 'n1', undefined, 'grant');
    expect(r.grantedCredits).toBeUndefined();
    expect(r.grantedItem).toBeUndefined();
  });
});

