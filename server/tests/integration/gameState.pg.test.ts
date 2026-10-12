import { afterAll, beforeAll } from '@jest/globals';
import pg from 'pg';
import {
  PgGameFlagRepository,
  PgGameRepository,
  PgResolutionRepository,
} from '../../src/runtime/PgGameStateRepositories.js';
import { gameStateContract } from '../helpers/gameStateContract.js';

// SC-501: the shared player-state contract against runtime.* on Postgres, twice:
//   1. through the app pool (the production path today: oltpPool, privileged `las_flores`);
//   2. through a connection logged in as the `runtime` role, which has SELECT+INSERT on games and
//      game_flags and SELECT+INSERT+UPDATE on game_resolution, nothing more. Passing there proves
//      the adapters need no privilege beyond those grants.
//
// Collision avoidance: every case uses its own random-UUID players (no users-table rows; there is
// no FK), so no other suite can touch these rows. Cleanup runs per test through the OWNER
// connection (runtime cannot DELETE flags) and is keyed by exactly the player ids created.
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';
const OWNER_URL = process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores';

let runtime: pg.Client;
let owner: pg.Client;

beforeAll(async () => {
  runtime = new pg.Client({ connectionString: RUNTIME_URL, connectionTimeoutMillis: 5000 });
  owner = new pg.Client({ connectionString: OWNER_URL, connectionTimeoutMillis: 5000 });
  await Promise.all([runtime.connect(), owner.connect()]);
});
afterAll(async () => {
  await Promise.allSettled([runtime?.end(), owner?.end()]);
});

// Child rows first (FKs), through the owner. The owner has no privileges by grant but owns the tables.
const cleanup = async (playerIds: string[]): Promise<void> => {
  for (const t of ['game_flags', 'game_resolution', 'games']) {
    await owner.query(`DELETE FROM runtime.${t} WHERE player_id = ANY($1::uuid[])`, [playerIds]);
  }
};

gameStateContract(
  'Postgres via the app pool',
  () => ({ games: new PgGameRepository(), flags: new PgGameFlagRepository(), resolutions: new PgResolutionRepository() }),
  { cleanup },
);

gameStateContract(
  'Postgres as the runtime role',
  () => {
    const query = (text: string, params?: any[]) => runtime.query(text, params);
    return { games: new PgGameRepository(query), flags: new PgGameFlagRepository(query), resolutions: new PgResolutionRepository(query) };
  },
  { cleanup },
);
