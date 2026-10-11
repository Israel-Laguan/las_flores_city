// api/runtime/src/state/ports.ts
// SC-501: ports for durable player state, keyed by player AND game. DB-free: persistence is
// injected (Postgres adapters live in server/src/runtime/).
//
// Flags are permanent. There is deliberately NO clear/unset/delete method on any port here:
// the only way to "revert" is a new game.

/** Thrown when a write names a game that does not exist for that player. */
export class GameNotFoundError extends Error {
  constructor(
    readonly playerId: string,
    readonly gameId: string,
  ) {
    super(`no game ${gameId} for player ${playerId}`);
    this.name = 'GameNotFoundError';
  }
}

export interface Game {
  gameId: string;
  playerId: string;
  createdAt: Date;
}

export interface GameRepository {
  /** "New game": the server generates the game id. Old games are kept. */
  startGame(playerId: string): Promise<{ gameId: string }>;
  getGame(playerId: string, gameId: string): Promise<Game | undefined>;
}

export type SetFlagResult = 'set' | 'already_set';

export interface GameFlagRepository {
  /**
   * Sets a flag for a (player, game). Setting an already-set flag is a silent no-op that reports
   * 'already_set'. Throws GameNotFoundError for an unknown game and rejects invalid slugs.
   */
  setFlag(playerId: string, gameId: string, flagSlug: string): Promise<SetFlagResult>;
  /** Every flag set in the game. Unknown player/game = empty set. */
  getTrueFlags(playerId: string, gameId: string): Promise<Set<string>>;
}

/** The current resolution of a game: which scene artifact, from which revision. */
export interface GameResolution {
  playerId: string;
  gameId: string;
  sceneSlug: string;
  artifactId: string;
  revisionId: string;
  resolvedAt: Date;
}

export type GameResolutionInput = Omit<GameResolution, 'resolvedAt'>;

export interface ResolutionRepository {
  /** One row per game: a second write replaces the first. Throws GameNotFoundError for an unknown game. */
  upsert(input: GameResolutionInput): Promise<void>;
  get(playerId: string, gameId: string): Promise<GameResolution | undefined>;
}
