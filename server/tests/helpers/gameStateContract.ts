import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import {
  GameNotFoundError,
  type GameFlagRepository,
  type GameRepository,
  type ResolutionRepository,
} from '@las-flores/api-runtime';

/**
 * Shared behavioural contract for runtime player state (SC-501): games, write-once flags and the
 * per-game resolution row. Run against the in-memory repositories (unit), the Postgres adapters
 * over the app pool, and the same adapters over a connection logged in as the `runtime` role.
 *
 * Isolation: every case creates its own players (random UUIDs; there is no users-table FK) and
 * games, so suites never collide with each other or with real data. `cleanup(playerIds)` removes
 * this suite's rows (the runtime role cannot DELETE flags, so Postgres suites clean up through
 * the owner connection); it is called with every player id the contract created.
 */
export interface GameStateContext {
  games: GameRepository;
  flags: GameFlagRepository;
  resolutions: ResolutionRepository;
}

export function gameStateContract(
  name: string,
  make: () => GameStateContext,
  opts: { cleanup?: (playerIds: string[]) => Promise<void> } = {},
): void {
  describe(`Game state contract: ${name}`, () => {
    let ctx: GameStateContext;
    const players: string[] = [];
    const newPlayer = (): string => {
      const id = randomUUID();
      players.push(id);
      return id;
    };
    const ART_1 = 'a'.repeat(64);
    const ART_2 = 'b'.repeat(64);

    beforeEach(() => {
      ctx = make();
    });

    // Runs after every test so a failing case still cleans up.
    afterEach(async () => {
      const ids = players.splice(0);
      if (ids.length) await opts.cleanup?.(ids);
    });

    test('startGame generates a distinct server-side id per call and getGame reads it back', async () => {
      const p = newPlayer();
      const a = await ctx.games.startGame(p);
      const b = await ctx.games.startGame(p);
      expect(a.gameId).not.toBe(b.gameId);
      const game = await ctx.games.getGame(p, a.gameId);
      expect(game?.gameId).toBe(a.gameId);
      expect(game?.playerId).toBe(p);
    });

    test('unknown game / wrong player: getGame is undefined, flags empty, resolution undefined', async () => {
      const p = newPlayer();
      const other = newPlayer();
      const { gameId } = await ctx.games.startGame(p);
      expect(await ctx.games.getGame(p, randomUUID())).toBeUndefined();
      expect(await ctx.games.getGame(other, gameId)).toBeUndefined();
      expect((await ctx.flags.getTrueFlags(other, gameId)).size).toBe(0);
      expect((await ctx.flags.getTrueFlags(p, randomUUID())).size).toBe(0);
      expect(await ctx.resolutions.get(other, gameId)).toBeUndefined();
      expect(await ctx.resolutions.get(p, gameId)).toBeUndefined();
    });

    test('setFlag then getTrueFlags returns exactly the flags set', async () => {
      const p = newPlayer();
      const { gameId } = await ctx.games.startGame(p);
      expect(await ctx.flags.setFlag(p, gameId, 'met_vera')).toBe('set');
      expect(await ctx.flags.setFlag(p, gameId, 'took_deal')).toBe('set');
      expect([...(await ctx.flags.getTrueFlags(p, gameId))].sort()).toEqual(['met_vera', 'took_deal']);
    });

    test('flags are isolated per game: the same slug set in game A is not set in game B', async () => {
      const p = newPlayer();
      const a = await ctx.games.startGame(p);
      const b = await ctx.games.startGame(p);
      await ctx.flags.setFlag(p, a.gameId, 'met_vera');
      expect((await ctx.flags.getTrueFlags(p, b.gameId)).size).toBe(0);
      expect(await ctx.flags.setFlag(p, b.gameId, 'met_vera')).toBe('set');
    });

    test('flags are isolated per player', async () => {
      const p1 = newPlayer();
      const p2 = newPlayer();
      const g1 = await ctx.games.startGame(p1);
      const g2 = await ctx.games.startGame(p2);
      await ctx.flags.setFlag(p1, g1.gameId, 'met_vera');
      expect((await ctx.flags.getTrueFlags(p2, g2.gameId)).size).toBe(0);
      // p2 cannot read or write p1's game by guessing its id
      expect((await ctx.flags.getTrueFlags(p2, g1.gameId)).size).toBe(0);
      await expect(ctx.flags.setFlag(p2, g1.gameId, 'sneaky')).rejects.toBeInstanceOf(GameNotFoundError);
      expect([...(await ctx.flags.getTrueFlags(p1, g1.gameId))]).toEqual(['met_vera']);
    });

    test('setting a flag twice reports already_set and the flag stays set (silent no-op)', async () => {
      const p = newPlayer();
      const { gameId } = await ctx.games.startGame(p);
      expect(await ctx.flags.setFlag(p, gameId, 'met_vera')).toBe('set');
      expect(await ctx.flags.setFlag(p, gameId, 'met_vera')).toBe('already_set');
      expect([...(await ctx.flags.getTrueFlags(p, gameId))]).toEqual(['met_vera']);
    });

    test('flags are permanent: the repository exposes no way to unset one', () => {
      const methods = new Set([...Object.getOwnPropertyNames(Object.getPrototypeOf(ctx.flags)), ...Object.keys(ctx.flags)]);
      for (const m of methods) expect(m).not.toMatch(/clear|unset|delete|remove|reset|update/i);
    });

    test('a new game for the same player starts empty while the old game keeps its flags', async () => {
      const p = newPlayer();
      const old = await ctx.games.startGame(p);
      await ctx.flags.setFlag(p, old.gameId, 'met_vera');
      const fresh = await ctx.games.startGame(p);
      expect((await ctx.flags.getTrueFlags(p, fresh.gameId)).size).toBe(0);
      expect([...(await ctx.flags.getTrueFlags(p, old.gameId))]).toEqual(['met_vera']);
    });

    test('setFlag on an unknown game rejects with GameNotFoundError and writes nothing', async () => {
      const p = newPlayer();
      const ghost = randomUUID();
      await expect(ctx.flags.setFlag(p, ghost, 'met_vera')).rejects.toBeInstanceOf(GameNotFoundError);
      expect((await ctx.flags.getTrueFlags(p, ghost)).size).toBe(0);
    });

    test.each(['', '1bad', 'has space', 'semi;colon', 'x'.repeat(257)])('an invalid slug %j is rejected', async (slug) => {
      const p = newPlayer();
      const { gameId } = await ctx.games.startGame(p);
      await expect(ctx.flags.setFlag(p, gameId, slug)).rejects.toBeDefined();
      expect((await ctx.flags.getTrueFlags(p, gameId)).size).toBe(0);
    });

    test('Object.prototype-looking slugs are ordinary flags', async () => {
      const p = newPlayer();
      const { gameId } = await ctx.games.startGame(p);
      expect(await ctx.flags.setFlag(p, gameId, 'constructor')).toBe('set');
      expect(await ctx.flags.setFlag(p, gameId, '__proto__')).toBe('set');
      expect([...(await ctx.flags.getTrueFlags(p, gameId))].sort()).toEqual(['__proto__', 'constructor']);
    });

    test('concurrent setFlag of the same flag yields exactly one set and N-1 already_set', async () => {
      const p = newPlayer();
      const { gameId } = await ctx.games.startGame(p);
      const results = await Promise.all(Array.from({ length: 12 }, () => ctx.flags.setFlag(p, gameId, 'race_flag')));
      expect(results.filter((r) => r === 'set')).toHaveLength(1);
      expect(results.filter((r) => r === 'already_set')).toHaveLength(11);
      expect([...(await ctx.flags.getTrueFlags(p, gameId))]).toEqual(['race_flag']);
    });

    test('resolution: upsert stores scene, artifact_id and revision_id; a second upsert replaces it', async () => {
      const p = newPlayer();
      const { gameId } = await ctx.games.startGame(p);
      const rev1 = randomUUID();
      const rev2 = randomUUID();
      await ctx.resolutions.upsert({ playerId: p, gameId, sceneSlug: 'lobby', artifactId: ART_1, revisionId: rev1 });
      const first = await ctx.resolutions.get(p, gameId);
      expect(first).toMatchObject({ playerId: p, gameId, sceneSlug: 'lobby', artifactId: ART_1, revisionId: rev1 });
      expect(first?.resolvedAt).toBeInstanceOf(Date);
      await ctx.resolutions.upsert({ playerId: p, gameId, sceneSlug: 'rooftop', artifactId: ART_2, revisionId: rev2 });
      expect(await ctx.resolutions.get(p, gameId)).toMatchObject({ sceneSlug: 'rooftop', artifactId: ART_2, revisionId: rev2 });
    });

    test('resolution is per game: two games of one player hold independent rows', async () => {
      const p = newPlayer();
      const a = await ctx.games.startGame(p);
      const b = await ctx.games.startGame(p);
      await ctx.resolutions.upsert({ playerId: p, gameId: a.gameId, sceneSlug: 'lobby', artifactId: ART_1, revisionId: randomUUID() });
      expect(await ctx.resolutions.get(p, b.gameId)).toBeUndefined();
    });

    test('resolution upsert on an unknown game rejects with GameNotFoundError', async () => {
      const p = newPlayer();
      await expect(
        ctx.resolutions.upsert({ playerId: p, gameId: randomUUID(), sceneSlug: 'lobby', artifactId: ART_1, revisionId: randomUUID() }),
      ).rejects.toBeInstanceOf(GameNotFoundError);
    });

    test('an unreferenced (missing) revision id is accepted: no foreign key, no fallback to the pointer', async () => {
      const p = newPlayer();
      const { gameId } = await ctx.games.startGame(p);
      const missing = randomUUID();
      await ctx.resolutions.upsert({ playerId: p, gameId, sceneSlug: 'lobby', artifactId: ART_1, revisionId: missing });
      expect((await ctx.resolutions.get(p, gameId))?.revisionId).toBe(missing);
    });
  });
}
