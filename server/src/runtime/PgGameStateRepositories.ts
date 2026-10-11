// SC-M3 T3 (SC-501): Postgres adapters for runtime player state (migration 108), keyed by
// player AND game. Same style as PgArtifactReader: they default to the existing oltpPool via
// queryOLTP (no new pool, AGENTS hard constraint) and take an injectable query function so the one
// shared contract suite can also run them over a connection logged in as the `runtime` role.
//
// Flags are write-once: setFlag is a single INSERT ... ON CONFLICT DO NOTHING. There is no UPDATE
// or DELETE here, and the `runtime` role is not granted either, so the guarantee is a grant.

import { queryOLTP } from '@las-flores/infra';
import { isUuid, validateFlagSlug } from '@las-flores/api-contracts';
import {
  GameNotFoundError,
  type Game,
  type GameFlagRepository,
  type GameRepository,
  type GameResolution,
  type GameResolutionInput,
  type ResolutionRepository,
  type SetFlagResult,
} from '@las-flores/api-runtime';
import type { QueryFn } from '../planning/PgArtifactStore.js';

const FOREIGN_KEY_VIOLATION = '23503';

const isFkViolation = (err: unknown): boolean => (err as { code?: string } | null)?.code === FOREIGN_KEY_VIOLATION;

// player_id / game_id are UUID columns (migration 108): a malformed id would make Postgres raise
// 22P02 before any row lookup, rejecting with a raw database error. Reads must answer "not found"
// and writes must throw GameNotFoundError, matching the in-memory adapters' port contract.
const hasValidKey = (playerId: string, gameId: string): boolean => isUuid(playerId) && isUuid(gameId);

export class PgGameRepository implements GameRepository {
  constructor(private readonly query: QueryFn = queryOLTP) {}

  async startGame(playerId: string): Promise<{ gameId: string }> {
    const { rows } = await this.query('INSERT INTO runtime.games (player_id) VALUES ($1) RETURNING game_id', [playerId]);
    return { gameId: rows[0].game_id as string };
  }

  async getGame(playerId: string, gameId: string): Promise<Game | undefined> {
    if (!hasValidKey(playerId, gameId)) return undefined;
    const { rows } = await this.query(
      'SELECT game_id, player_id, created_at FROM runtime.games WHERE player_id = $1 AND game_id = $2',
      [playerId, gameId],
    );
    const row = rows[0];
    return row === undefined ? undefined : { gameId: row.game_id, playerId: row.player_id, createdAt: row.created_at };
  }
}

export class PgGameFlagRepository implements GameFlagRepository {
  constructor(private readonly query: QueryFn = queryOLTP) {}

  async setFlag(playerId: string, gameId: string, flagSlug: string): Promise<SetFlagResult> {
    validateFlagSlug(flagSlug);
    if (!hasValidKey(playerId, gameId)) throw new GameNotFoundError(playerId, gameId);
    try {
      const { rows } = await this.query(
        `INSERT INTO runtime.game_flags (player_id, game_id, flag_slug) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, game_id, flag_slug) DO NOTHING RETURNING flag_slug`,
        [playerId, gameId, flagSlug],
      );
      return rows.length === 1 ? 'set' : 'already_set';
    } catch (err) {
      if (isFkViolation(err)) throw new GameNotFoundError(playerId, gameId);
      throw err;
    }
  }

  async getTrueFlags(playerId: string, gameId: string): Promise<Set<string>> {
    if (!hasValidKey(playerId, gameId)) return new Set<string>();
    const { rows } = await this.query('SELECT flag_slug FROM runtime.game_flags WHERE player_id = $1 AND game_id = $2', [
      playerId,
      gameId,
    ]);
    return new Set(rows.map((r) => r.flag_slug as string));
  }
}

export class PgResolutionRepository implements ResolutionRepository {
  constructor(private readonly query: QueryFn = queryOLTP) {}

  async upsert(input: GameResolutionInput): Promise<void> {
    if (!hasValidKey(input.playerId, input.gameId)) throw new GameNotFoundError(input.playerId, input.gameId);
    try {
      await this.query(
        `INSERT INTO runtime.game_resolution (player_id, game_id, scene_slug, artifact_id, revision_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id, game_id) DO UPDATE
           SET scene_slug = EXCLUDED.scene_slug, artifact_id = EXCLUDED.artifact_id,
               revision_id = EXCLUDED.revision_id, resolved_at = NOW()`,
        [input.playerId, input.gameId, input.sceneSlug, input.artifactId, input.revisionId],
      );
    } catch (err) {
      if (isFkViolation(err)) throw new GameNotFoundError(input.playerId, input.gameId);
      throw err;
    }
  }

  async get(playerId: string, gameId: string): Promise<GameResolution | undefined> {
    if (!hasValidKey(playerId, gameId)) return undefined;
    const { rows } = await this.query(
      `SELECT player_id, game_id, scene_slug, artifact_id, revision_id, resolved_at
         FROM runtime.game_resolution WHERE player_id = $1 AND game_id = $2`,
      [playerId, gameId],
    );
    const row = rows[0];
    return row === undefined
      ? undefined
      : {
          playerId: row.player_id,
          gameId: row.game_id,
          sceneSlug: row.scene_slug,
          artifactId: row.artifact_id,
          revisionId: row.revision_id,
          resolvedAt: row.resolved_at,
        };
  }
}
