// api/runtime/src/state/in-memory.ts
// SC-501: in-memory player-state repositories for unit tests and the shared contract suite. They
// mirror the Postgres adapters (same errors, same write-once flag semantics).

import { randomUUID } from 'node:crypto';
import { validateFlagSlug } from '@las-flores/api-contracts';
import type { FlagStateRepository } from '../flags.js';
import {
  GameNotFoundError,
  type Game,
  type GameFlagRepository,
  type GameRepository,
  type GameResolution,
  type GameResolutionInput,
  type ResolutionRepository,
  type SetFlagResult,
} from './ports.js';

const key = (playerId: string, gameId: string): string => `${playerId}\u0000${gameId}`;

export class InMemoryGameRepository implements GameRepository {
  private games = new Map<string, Game>();

  async startGame(playerId: string): Promise<{ gameId: string }> {
    const gameId = randomUUID();
    this.games.set(key(playerId, gameId), { gameId, playerId, createdAt: new Date() });
    return { gameId };
  }

  async getGame(playerId: string, gameId: string): Promise<Game | undefined> {
    const game = this.games.get(key(playerId, gameId));
    return game === undefined ? undefined : { ...game };
  }
}

export class InMemoryGameFlagRepository implements GameFlagRepository {
  private flags = new Map<string, Set<string>>();

  constructor(private readonly games: GameRepository) {}

  async setFlag(playerId: string, gameId: string, flagSlug: string): Promise<SetFlagResult> {
    validateFlagSlug(flagSlug);
    if ((await this.games.getGame(playerId, gameId)) === undefined) throw new GameNotFoundError(playerId, gameId);
    const k = key(playerId, gameId);
    const set = this.flags.get(k) ?? new Set<string>();
    if (set.has(flagSlug)) return 'already_set';
    set.add(flagSlug);
    this.flags.set(k, set);
    return 'set';
  }

  async getTrueFlags(playerId: string, gameId: string): Promise<Set<string>> {
    return new Set(this.flags.get(key(playerId, gameId)));
  }
}

export class InMemoryResolutionRepository implements ResolutionRepository {
  private rows = new Map<string, GameResolution>();

  constructor(private readonly games: GameRepository) {}

  async upsert(input: GameResolutionInput): Promise<void> {
    if ((await this.games.getGame(input.playerId, input.gameId)) === undefined) {
      throw new GameNotFoundError(input.playerId, input.gameId);
    }
    this.rows.set(key(input.playerId, input.gameId), { ...input, resolvedAt: new Date() });
  }

  async get(playerId: string, gameId: string): Promise<GameResolution | undefined> {
    const row = this.rows.get(key(playerId, gameId));
    return row === undefined ? undefined : { ...row };
  }
}

/**
 * Feeds `resolvePlayerScene` from a game-scoped repository: binds the game id so the existing
 * `getTrueFlags(playerId)` shape keeps working. A thin adapter, chosen over changing
 * FlagStateRepository (whose snapshot model serves the planning-written runtime.flag_state).
 */
export function flagsForGame(flags: GameFlagRepository, gameId: string): Pick<FlagStateRepository, 'getTrueFlags'> {
  return { getTrueFlags: (playerId) => flags.getTrueFlags(playerId, gameId) };
}
