/**
 * Seed E2E Test Data
 *
 * Seeds vault items (player_vault) and NPC SMS threads (player_sms_threads)
 * for known fixed UUIDs used by dev-login tests.
 *
 * Run:   npx tsx server/scripts/seed_e2e_test_data.ts
 * Clean: npx tsx server/scripts/seed_e2e_test_data.ts --cleanup
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { queryOLTP, closeConnections } from '../src/database/connection.js';
import { VAULT_ITEM_IDS, ARIA_CHARACTER_ID, SMS_CHAT_HISTORY } from '../src/database/seedFixtures.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// E2E test user UUIDs — must match dev-login defaults
const E2E_USER_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '660e8400-e29b-41d4-a716-446655440099',
];

async function seedE2EData(): Promise<void> {
  console.log(`Seeding E2E test data for ${E2E_USER_IDS.length} users...`);

  for (const userId of E2E_USER_IDS) {
    // Ensure user exists (dev-login also does this, but the seed script
    // is standalone so it must be self-contained)
    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `e2e-${userId}@example.com`, `e2e_${userId.slice(0, 8)}`, 'E2E Test User']
    );

    // Ensure player_states row exists
    await queryOLTP(
      `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, current_day, story_beat, flags, alignment)
       VALUES ($1, '550e8400-e29b-41d4-a716-446655440002', 48, 100, 1, 'prologue', '{}'::jsonb, 'neutral')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Seed vault items — idempotent (PK is (user_id, item_id))
    for (const itemId of VAULT_ITEM_IDS) {
      await queryOLTP(
        `INSERT INTO player_vault (user_id, item_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, item_id) DO NOTHING`,
        [userId, itemId]
      );
    }

    // Seed SMS thread — idempotent via ON CONFLICT DO UPDATE
    // Uses UNIQUE(user_id, character_id) constraint
    await queryOLTP(
      `INSERT INTO player_sms_threads
         (user_id, character_id, current_node_id, chat_history, unread, last_npc_message_at)
       VALUES ($1, $2, $3, $4::jsonb, TRUE, NOW())
       ON CONFLICT (user_id, character_id) DO UPDATE SET
         current_node_id = EXCLUDED.current_node_id,
         chat_history = EXCLUDED.chat_history,
         unread = TRUE,
         last_npc_message_at = NOW()`,
      [userId, ARIA_CHARACTER_ID, 'msg_1', JSON.stringify(SMS_CHAT_HISTORY)]
    );

    console.log(`  ✅ Seeded user ${userId}`);
  }

  console.log('✅ E2E test data seeded');
}

async function cleanupE2EData(): Promise<void> {
  console.log('Cleaning up E2E test data...');

  for (const userId of E2E_USER_IDS) {
    await queryOLTP(`DELETE FROM player_vault WHERE user_id = $1`, [userId]);
    await queryOLTP(`DELETE FROM player_sms_threads WHERE user_id = $1`, [userId]);
    console.log(`  ✅ Cleaned up user ${userId}`);
  }

  console.log('✅ E2E test data cleaned up');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cleanup = args.includes('--cleanup');

  try {
    if (cleanup) {
      await cleanupE2EData();
    } else {
      await seedE2EData();
    }
  } catch (error) {
    console.error('Seed script error:', error);
    process.exit(1);
  } finally {
    await closeConnections();
  }
}

main();
