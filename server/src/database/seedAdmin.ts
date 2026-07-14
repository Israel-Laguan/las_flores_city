import dotenv from 'dotenv';
import path from 'path';
import { queryOLTP } from './connection.js';
import bcrypt from 'bcryptjs';

// Load env the same way the server does (cwd is the server workspace, .env lives at repo root).
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const DEV_START_LOCATION = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

/**
 * Seeds a local development admin user.
 *
 * Credentials are supplied via environment variables (ADMIN_EMAIL,
 * ADMIN_PASSWORD, ADMIN_USER_ID) so the password is never committed to
 * source control. This is a dev-only convenience seed:
 *   - It refuses to run when NODE_ENV === 'production'.
 *   - It is a no-op when ADMIN_EMAIL / ADMIN_PASSWORD are not set.
 *   - It never overwrites an existing user (idempotent first-time seed).
 *
 * Following the codebase convention (see migrations/043_user_roles.sql), this
 * lives outside the always-run migration path and is invoked explicitly via
 * `npm run seed:dev` as part of the local dev setup.
 *
 * Run with: npm run seed:dev
 */
export async function seedDevAdmin(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed dev admin in production (NODE_ENV=production).');
  }

  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const userId =
    process.env.ADMIN_USER_ID?.trim() || '00000000-0000-0000-0000-000000000001';

  if (!email || !password) {
    console.log(
      '[seed:dev] Skipping: set ADMIN_EMAIL and ADMIN_PASSWORD in your .env to seed a dev admin.'
    );
    return;
  }

  const existing = await queryOLTP(
    'SELECT id FROM users WHERE id = $1 OR email = $2 LIMIT 1',
    [userId, email]
  );
  if (existing && existing.rows.length > 0) {
    console.log('[seed:dev] Admin user already exists — skipping.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const username = email.split('@')[0] || 'admin';

  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name, role, password_hash)
     VALUES ($1, $2, $3, $4, 'admin', $5)`,
    [userId, email, username, 'Dev Admin', passwordHash]
  );

  await queryOLTP(
    `INSERT INTO player_states (
       user_id, current_location_id, current_node_id,
       flags, time_blocks, credits, gold_credits, current_day, story_beat, alignment
     )
     VALUES ($1, $2, NULL, '{}'::jsonb, 48, 100, 0, 1, 'prologue', 'neutral')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, DEV_START_LOCATION]
  );

  console.log(`[seed:dev] ✓ Seeded dev admin: ${email}`);
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith(path.join('src', 'database', 'seedAdmin.ts'));

if (isCli) {
  seedDevAdmin()
    .then(() => {
      console.log('[seed:dev] Done');
      process.exit(0);
    })
    .catch((err: any) => {
      console.error('[seed:dev] Failed:', err?.message || err);
      process.exit(1);
    });
}
