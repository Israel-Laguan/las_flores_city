import { describe, test, expect } from '@jest/globals';
import { flagsForGame, InMemoryGameFlagRepository, InMemoryGameRepository } from './in-memory.js';

describe('flagsForGame', () => {
  test('binds the game so resolvePlayerScene-style getTrueFlags(playerId) reads that game only', async () => {
    const games = new InMemoryGameRepository();
    const flags = new InMemoryGameFlagRepository(games);
    const a = await games.startGame('p1');
    const b = await games.startGame('p1');
    await flags.setFlag('p1', a.gameId, 'met_vera');
    expect([...(await flagsForGame(flags, a.gameId).getTrueFlags('p1'))]).toEqual(['met_vera']);
    expect((await flagsForGame(flags, b.gameId).getTrueFlags('p1')).size).toBe(0);
  });
});
