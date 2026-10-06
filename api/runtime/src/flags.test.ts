// api/runtime/src/flags.test.ts
// Runtime flag reads (SC-202/SC-206 runtime half): read state, evaluate a condition.

import { describe, test, expect } from '@jest/globals';
import { and, evaluate, flag, not } from '@las-flores/api-contracts';
import {
  createFlagStateRepository,
  getPlayerFlagState,
  InMemoryFlagStateRepository,
  isPlayerFlagSet,
} from './flags.js';

const NOW = '2026-01-01T00:00:00.000Z';

function seeded(): InMemoryFlagStateRepository {
  const repo = new InMemoryFlagStateRepository();
  repo.setPlayerState('p1', { updatedAt: NOW, flags: { met_vera: true, alarm: false } });
  return repo;
}

describe('InMemoryFlagStateRepository', () => {
  test('reads a stored definition of player state', async () => {
    const state = await seeded().getPlayerState('p1');
    expect(state).toEqual({ playerId: 'p1', updatedAt: NOW, flags: { met_vera: true, alarm: false } });
  });

  test('unknown player: undefined state, false flag, empty true-set', async () => {
    const repo = seeded();
    expect(await repo.getPlayerState('nobody')).toBeUndefined();
    expect(await repo.getFlagValue('nobody', 'met_vera')).toBe(false);
    expect((await repo.getTrueFlags('nobody')).size).toBe(0);
  });

  test('getFlagValue / getTrueFlags only report flags that are true', async () => {
    const repo = seeded();
    expect(await repo.getFlagValue('p1', 'met_vera')).toBe(true);
    expect(await repo.getFlagValue('p1', 'alarm')).toBe(false);
    expect([...(await repo.getTrueFlags('p1'))]).toEqual(['met_vera']);
  });

  test('Object.prototype names read as cleared, not as truthy functions', async () => {
    const repo = seeded();
    for (const slug of ['constructor', 'toString', '__proto__']) {
      expect(await repo.getFlagValue('p1', slug)).toBe(false);
    }
  });

  test('returned snapshots are copies: mutating one does not change later reads', async () => {
    const repo = seeded();
    const first = await repo.getPlayerState('p1');
    first!.flags.alarm = true;
    expect(await repo.getFlagValue('p1', 'alarm')).toBe(false);
  });

  test('clear removes all state', async () => {
    const repo = seeded();
    repo.clear();
    expect(await repo.getPlayerState('p1')).toBeUndefined();
  });
});

describe('player flag helpers', () => {
  test('getPlayerFlagState derives trueFlags from the same snapshot', async () => {
    const result = await getPlayerFlagState('p1', seeded());
    expect([...result!.trueFlags]).toEqual(['met_vera']);
    expect(result!.flagState.playerId).toBe('p1');
  });

  test('getPlayerFlagState is undefined for an unknown player', async () => {
    expect(await getPlayerFlagState('nobody', seeded())).toBeUndefined();
  });

  test('isPlayerFlagSet delegates to the repository', async () => {
    expect(await isPlayerFlagSet('p1', 'met_vera', seeded())).toBe(true);
  });

  test('evaluates a condition against a player snapshot', async () => {
    const result = await getPlayerFlagState('p1', seeded());
    expect(evaluate(and([flag('met_vera', true), not(flag('alarm', true))]), result!.trueFlags)).toBe(true);
    expect(evaluate(flag('alarm', true), result!.trueFlags)).toBe(false);
  });
});

describe('createFlagStateRepository', () => {
  test('in-memory flavour is usable', async () => {
    expect(await createFlagStateRepository(true).getPlayerState('p')).toBeUndefined();
  });

  test('database flavour fails loudly until the server provides it', async () => {
    await expect(createFlagStateRepository(false).getPlayerState('p')).rejects.toThrow(/Not implemented/);
  });
});
