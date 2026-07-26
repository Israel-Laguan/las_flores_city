import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { queryOLTP } from './connection.js';

// Load env the same way the server does (cwd is the server workspace, .env lives at repo root).
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

/**
 * Seeds two permanent player accounts for manual testing and development.
 *
 * These are NOT admin accounts — they have the 'player' role and can only
 * access client-facing endpoints. They are available in all environments
 * (dev, staging, etc.) but NOT in production.
 *
 *   - Player 1: Fresh start (prologue, day 1, Welcome Center)
 *   - Player 2: Onboarding finished (act1, day 5, Central Plaza)
 *
 * This is a dev-only convenience seed:
 *   - It refuses to run when NODE_ENV === 'production'.
 *   - It never overwrites existing users (idempotent first-time seed).
 *
 * Run with: npm run seed:players
 */
export async function seedPlayers(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed players in production (NODE_ENV=production).');
  }

  const sqlPath = path.resolve(process.cwd(), 'scripts', 'seed_players.sql');
  if (!fs.existsSync(sqlPath)) {
    console.log(`[seed:players] SQL file not found at ${sqlPath} — skipping.`);
    return;
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // Execute the full SQL (pg supports multi-statement queries)
  await queryOLTP(sql);

  console.log('[seed:players] ✓ Seeded player accounts (player1, player2)');
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith(path.join('src', 'database', 'seedPlayers.ts'));

if (isCli) {
  seedPlayers()
    .then(() => {
      console.log('[seed:players] Done');
      process.exit(0);
    })
    .catch((err: any) => {
      console.error('[seed:players] Failed:', err?.message || err);
      process.exit(1);
    });
}