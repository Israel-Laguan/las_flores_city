/**
 * Seed Load Test Users
 *
 * Generates N test users for K6 load testing. Each user has:
 * - UUID with predictable pattern for K6 script correlation
 * - Pre-hashed password for login authentication
 * - Initial time_blocks and credits for gameplay
 *
 * Run: npx tsx server/scripts/seed_load_test_users.ts
 * Clean: npx tsx server/scripts/seed_load_test_users.ts --cleanup
 */

import path from 'node:path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { queryOLTP, closeConnections } from '../src/database/connection.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const TEST_USER_COUNT = 500;
const TEST_PASSWORD = 'password123';
const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

function generateUserId(index: number): string {
  // Collision-avoidance: load test users use a dedicated UUID range
  // Pattern: a0000000-0000-4000-8000-{12-hex-chars}
  // Uses 'a' prefix to distinguish from test fixtures (which use '0000...' or 'c000...'/'f111...' prefixes)
  const hex = index.toString(16).padStart(12, '0');
  return `a0000000-0000-4000-8000-${hex}`;
}

async function seedUsers(): Promise<void> {
  console.log(`Seeding ${TEST_USER_COUNT} load test users...`);

  for (let i = 1; i <= TEST_USER_COUNT; i++) {
    const userId = generateUserId(i);
    const email = `loadtest_${i}@lasflores.com`;
    const username = `loadtest_${i}`;
    const displayName = `Load Test ${i}`;

    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         username = EXCLUDED.username,
         display_name = EXCLUDED.display_name,
         password_hash = EXCLUDED.password_hash,
         updated_at = NOW()`,
      [userId, email, username, displayName, passwordHash]
    );

    await queryOLTP(
      `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
       VALUES ($1, '550e8400-e29b-41d4-a716-446655440002', 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
       ON CONFLICT (user_id) DO UPDATE SET
         current_location_id = EXCLUDED.current_location_id,
         time_blocks = 48,
         credits = 100,
         alignment = 'neutral'`,
      [userId]
    );

    await queryOLTP(
      `INSERT INTO user_entitlements (user_id, is_nsfw_unlocked, patreon_tier)
       VALUES ($1, FALSE, 'none')
       ON CONFLICT (user_id) DO UPDATE SET
         is_nsfw_unlocked = EXCLUDED.is_nsfw_unlocked,
         patreon_tier = EXCLUDED.patreon_tier`,
      [userId]
    );

    if (i % 50 === 0) {
      console.log(`  ... seeded ${i} users`);
    }
  }

  console.log(`✅ Seeded ${TEST_USER_COUNT} load test users`);
}

async function cleanupUsers(): Promise<void> {
  console.log(`Cleaning up ${TEST_USER_COUNT} load test users...`);

  for (let i = 1; i <= TEST_USER_COUNT; i++) {
    const userId = generateUserId(i);

    await queryOLTP(`DELETE FROM player_vault WHERE user_id = $1`, [userId]);
    await queryOLTP(`DELETE FROM player_states WHERE user_id = $1`, [userId]);
    await queryOLTP(`DELETE FROM user_entitlements WHERE user_id = $1`, [userId]);
    await queryOLTP(`DELETE FROM users WHERE id = $1`, [userId]);
  }

  console.log(`✅ Cleaned up ${TEST_USER_COUNT} load test users`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cleanup = args.includes('--cleanup');

  try {
    if (cleanup) {
      await cleanupUsers();
    } else {
      await seedUsers();
    }
  } catch (error) {
    console.error('Seed script error:', error);
    process.exit(1);
  } finally {
    await closeConnections();
  }
}

main();