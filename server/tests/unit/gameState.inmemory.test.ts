import { InMemoryGameFlagRepository, InMemoryGameRepository, InMemoryResolutionRepository } from '@las-flores/api-runtime';
import { gameStateContract } from '../helpers/gameStateContract.js';

// SC-501: the shared player-state contract over the in-memory repositories. Players are random
// UUIDs per case, so nothing here can collide with another suite.
gameStateContract('in-memory', () => {
  const games = new InMemoryGameRepository();
  return { games, flags: new InMemoryGameFlagRepository(games), resolutions: new InMemoryResolutionRepository(games) };
});
