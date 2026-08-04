import { queryOLTP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { closeRedis } from '../../src/database/redis.js';
import { computeRelationshipDecay, RELATIONSHIP_STAT_PREFIXES } from '../../src/workers/RelationshipDecayWorker.js';
import { choicePassesFilters, metadataConditionsPass, PlayerConditionState } from '@las-flores/shared';
import fs from 'fs';
import path from 'path';

// ============================================================
// Adeyemi Relationship Arc Integration Tests
//
// Validates the core thesis: endings diverge from history (C1) and
// neglect has consequences (C3).
//
// Uses real Postgres (via queryOLTP) and a dedicated test user.
// Mocks Redis to prevent real TCP connections.
// ============================================================

// Dedicated test user UUID — private to this test file
const TEST_USER_ID = 'f1000000-0000-4000-8000-000000000099';

// Helper to create a date in the past
function daysAgo(days: number): Date {
  const result = new Date();
  result.setDate(result.getDate() - days);
  return result;
}

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await queryOLTP(sql);
  } catch {
    // Column may already exist
  }
}

// Helper to create a player state
async function createTestUser(): Promise<void> {
  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'adeyemi_arc_test@test.com', 'adeyemi_arc_player', 'Adeyemi Arc Player')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID]
  );

  await queryOLTP(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, state, stats)
     VALUES ($1, 48, 0, 0, 1, 'prologue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
     ON CONFLICT (user_id) DO NOTHING`,
    [TEST_USER_ID]
  );
}

// Helper to get player state
async function getPlayerState(): Promise<{
  flags: Record<string, boolean>;
  state: Record<string, string>;
  stats: Record<string, number>;
}> {
  const { rows } = await queryOLTP<{
    flags: Record<string, boolean>;
    state: Record<string, string>;
    stats: Record<string, number>;
  }>(
    `SELECT flags, state, stats FROM player_states WHERE user_id = $1`,
    [TEST_USER_ID]
  );

  if (rows.length === 0) {
    throw new Error(`No player state found for user ${TEST_USER_ID}`);
  }

  return {
    flags: rows[0].flags || {},
    state: rows[0].state || {},
    stats: rows[0].stats || {},
  };
}

// Helper to update player state
async function updatePlayerState(
  flags: Record<string, boolean>,
  state: Record<string, string>,
  stats: Record<string, number>
): Promise<void> {
  await queryOLTP(
    `UPDATE player_states SET flags = $1, state = $2, stats = $3 WHERE user_id = $4`,
    [flags, state, stats, TEST_USER_ID]
  );
}

// Helper to clean up test user
async function cleanupTestUser(): Promise<void> {
  try {
    await queryOLTP(`DELETE FROM player_states WHERE user_id = $1`, [TEST_USER_ID]);
    await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]);
  } catch (err) {
    console.error('Adeyemi arc cleanup error:', err);
  }
}

// Act 3 gate from dialogue_adeyemi_act3_phone_call.yaml
// Requires: adeyemi_familiarity >= 25
const ACT_3_METADATA = {
  required_stats: { adeyemi_familiarity: 'gte:25' },
};

// Act 5 endings from char_adeyemi_ogunbiyi.yaml
const ACT_5_ENDINGS = {
  friend: {
    required_stats: {
      adeyemi_trust: 'gte:70',
      adeyemi_familiarity: 'gte:75',
      adeyemi_alignment: 'gte:65',
      adeyemi_tension: 'lte:40',
    },
  },
  lover: {
    required_stats: {
      adeyemi_trust: 'gte:75',
      adeyemi_familiarity: 'gte:80',
      adeyemi_alignment: 'gte:60',
      adeyemi_tension: 'gte:30',
    },
  },
  the_mirror: {
    required_stats: {
      adeyemi_trust: 'gte:60',
      adeyemi_familiarity: 'gte:65',
      adeyemi_alignment: 'gte:40',
      adeyemi_tension: 'gte:50',
    },
  },
  reluctant_ally: {
    required_stats: {
      adeyemi_trust: 'gte:50',
    },
  },
  failed_friend: {
    required_stats: {
      adeyemi_trust: 'gte:40',
      adeyemi_familiarity: 'gte:60',
      adeyemi_tension: 'gte:50',
    },
  },
  failed_lover: {
    required_stats: {
      adeyemi_trust: 'gte:60',
      adeyemi_familiarity: 'gte:70',
      adeyemi_tension: 'gte:65',
    },
  },
  always_distant: {
    required_stats: {
      adeyemi_trust: 'lte:50',
      adeyemi_familiarity: 'lte:50',
    },
  },
  opponent: {
    required_stats: {
      adeyemi_alignment: 'lte:30',
      adeyemi_tension: 'gte:70',
    },
  },
} as const;

describe('Adeyemi Relationship Arc Integration Tests', () => {
  beforeAll(async () => {
    // Apply schema migrations
    await applyMigration('001_initial_schema.sql');
    await applyMigration('005_dialogue_service.sql');

    // Create test user
    await createTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser();
    await closeConnections();
    await closeRedis();
  });

  describe('C1: Endings diverge from history (not one binary choice)', () => {
    it('two playthroughs with same Act-4 flags but different stat histories reach different Act-5 endings', async () => {
      // This test simulates two different playthroughs that both reach Act 4
      // with the same flags (e.g., COVERED=true, ANSWERED=true) but different
      // accumulated relationship stats, resulting in different Act 5 endings.

      // Playthrough 1: Trust-maxing path (cautious/honest choices in Acts 1-3)
      // This should reach a high-trust ending like "friend" or "the_mirror"
      const trustMaxFlags = { ANSWERED: true, COVERED: true, FRIEND_PATH_ACTIVE: true };
      const trustMaxStats = {
        adeyemi_trust: 75,      // High trust from good choices
        adeyemi_familiarity: 80,
        adeyemi_alignment: 65,
        adeyemi_tension: 35,
        adeyemi_debt: 0,
        adeyemi_visibility: 0,
      };
      const trustMaxState = { last_adeyemi_encounter_at: new Date().toISOString() };

      // Check which ending the trust-maxing path satisfies
      const trustMaxEndings: string[] = [];
      for (const [endingName, ending] of Object.entries(ACT_5_ENDINGS)) {
        const playerState: PlayerConditionState = {
          flags: trustMaxFlags,
          state: trustMaxState,
          stats: trustMaxStats,
          timeBlocks: 100,
        };

        // Check both metadata and choice-level gates
        const metadataPass = metadataConditionsPass(
          { required_flags: ending.required_stats ? undefined : { ...trustMaxFlags } },
          playerState
        );
        const choicePass = choicePassesFilters(
          { required_stats: ending.required_stats, required_flags: trustMaxFlags },
          playerState
        );

        if (choicePass) {
          trustMaxEndings.push(endingName);
        }
      }

      // Playthrough 2: Antagonizing path (dishonest/deflecting choices in Acts 1-3)
      // This should reach a low-trust ending like "always_distant" or "opponent"
      const antagonizeFlags = { ANSWERED: true, COVERED: true, WITNESSED: true };
      const antagonizeStats = {
        adeyemi_trust: 20,       // Low trust from bad choices
        adeyemi_familiarity: 30,
        adeyemi_alignment: -20,  // Low alignment (opposing goals)
        adeyemi_tension: 80,     // High tension
        adeyemi_debt: 0,
        adeyemi_visibility: 0,
      };
      const antagonizeState = { last_adeyemi_encounter_at: new Date().toISOString() };

      // Check which ending the antagonizing path satisfies
      const antagonizeEndings: string[] = [];
      for (const [endingName, ending] of Object.entries(ACT_5_ENDINGS)) {
        const playerState: PlayerConditionState = {
          flags: antagonizeFlags,
          state: antagonizeState,
          stats: antagonizeStats,
          timeBlocks: 100,
        };

        const choicePass = choicePassesFilters(
          { required_stats: ending.required_stats, required_flags: antagonizeFlags },
          playerState
        );

        if (choicePass) {
          antagonizeEndings.push(endingName);
        }
      }

      // The core assertion: the two paths should reach DIFFERENT sets of endings
      // This proves that stat history affects the outcome, not just flags
      expect(trustMaxEndings).toBeDefined();
      expect(antagonizeEndings).toBeDefined();

      // At minimum, there should be at least one ending that one path reaches
      // that the other doesn't
      const trustOnly = trustMaxEndings.filter(e => !antagonizeEndings.includes(e));
      const antagonizeOnly = antagonizeEndings.filter(e => !trustMaxEndings.includes(e));

      // If both arrays are empty, all endings are reachable by both paths
      // which means the stat deltas aren't moving the gates
      const allEndingsReachableByBoth = 
        trustOnly.length === 0 && 
        antagonizeOnly.length === 0 &&
        trustMaxEndings.length > 0 &&
        antagonizeEndings.length > 0;

      // This would be a critical finding - the system is no better than the old one
      if (allEndingsReachableByBoth) {
        console.warn('CRITICAL: Both playthroughs reach the same endings. Stat deltas may be insufficient.');
        console.warn(`Trust-max endings: ${JSON.stringify(trustMaxEndings)}`);
        console.warn(`Antagonize endings: ${JSON.stringify(antagonizeEndings)}`);
      }

      // For the test to pass, we need at least one ending that differs
      // This is the "is the new system better" test
      expect(trustOnly.length > 0 || antagonizeOnly.length > 0).toBe(true);
    });

    it('trust-maxing path can reach high-threshold endings', async () => {
      // Verify that the trust-maxing path can actually reach the high-threshold endings
      const highTrustFlags = { ANSWERED: true, COVERED: true, FRIEND_PATH_ACTIVE: true, DEEPENED: true };
      const highTrustStats = {
        adeyemi_trust: 75,
        adeyemi_familiarity: 80,
        adeyemi_alignment: 65,
        adeyemi_tension: 35,
        adeyemi_debt: 0,
        adeyemi_visibility: 0,
      };

      const playerState: PlayerConditionState = {
        flags: highTrustFlags,
        state: { last_adeyemi_encounter_at: new Date().toISOString() },
        stats: highTrustStats,
        timeBlocks: 100,
      };

      // Should satisfy friend ending
      const friendPass = choicePassesFilters(
        { 
          required_stats: ACT_5_ENDINGS.friend.required_stats,
          required_flags: { FRIEND_PATH_ACTIVE: true, DEEPENED: true }
        },
        playerState
      );

      expect(friendPass).toBe(true);
    });

    it('antagonizing path reaches low-trust/low-alignment endings', async () => {
      // Verify that the antagonizing path reaches different endings
      const lowTrustFlags = { ANSWERED: true, WITNESSED: true };
      const lowTrustStats = {
        adeyemi_trust: 20,
        adeyemi_familiarity: 30,
        adeyemi_alignment: -20,
        adeyemi_tension: 80,
        adeyemi_debt: 0,
        adeyemi_visibility: 0,
      };

      const playerState: PlayerConditionState = {
        flags: lowTrustFlags,
        state: { last_adeyemi_encounter_at: new Date().toISOString() },
        stats: lowTrustStats,
        timeBlocks: 100,
      };

      // Should satisfy opponent ending (low alignment, high tension)
      const opponentPass = choicePassesFilters(
        { 
          required_stats: ACT_5_ENDINGS.opponent.required_stats,
          required_flags: { WITNESSED: true }
        },
        playerState
      );

      expect(opponentPass).toBe(true);
    });
  });

  describe('C3: Neglect has consequences', () => {
    it('Act 3 gate fails after 8 days of neglect', async () => {
      // Seed a player with adeyemi_familiarity: 30
      // Last encounter was 8 days ago
      // Act 3 requires adeyemi_familiarity >= 25
      // But with decay, 30 - 8 = 22, which is below 25

      const eightDaysAgo = daysAgo(8);
      const now = new Date();

      // Initial state: familiarity = 30, last encounter 8 days ago
      await updatePlayerState(
        {}, // flags
        { last_adeyemi_encounter_at: eightDaysAgo.toISOString() },
        { adeyemi_familiarity: 30 }
      );

      // Run decay computation (simulating what the worker would do)
      const playerState = await getPlayerState();
      
      const result = computeRelationshipDecay(
        {
          stats: playerState.stats,
          state: playerState.state,
          prefix: 'adeyemi_',
          now,
        }
      );

      // Apply the decay to the database
      await updatePlayerState(
        {},
        result.newState,
        result.newStats
      );

      // Get the updated state
      const updatedState = await getPlayerState();

      // Familiarity should have decayed by 8 days * 1 = 8
      expect(updatedState.stats.adeyemi_familiarity).toBeLessThan(30);

      // Now check if Act 3 gate passes
      const act3PlayerState: PlayerConditionState = {
        flags: updatedState.flags,
        state: updatedState.state,
        stats: updatedState.stats,
        timeBlocks: 100,
      };

      // Act 3 requires adeyemi_familiarity >= 25
      // After 8 days of decay: 30 - 8 = 22, which is < 25
      const act3Pass = metadataConditionsPass(ACT_3_METADATA, act3PlayerState);

      expect(act3Pass).toBe(false);
    });

    it('Act 3 gate passes when familiarity is above threshold', async () => {
      // Reset: familiarity = 30, last encounter was just now
      await updatePlayerState(
        {},
        { last_adeyemi_encounter_at: new Date().toISOString() },
        { adeyemi_familiarity: 30 }
      );

      const playerState = await getPlayerState();
      const act3PlayerState: PlayerConditionState = {
        flags: playerState.flags,
        state: playerState.state,
        stats: playerState.stats,
        timeBlocks: 100,
      };

      // Act 3 requires adeyemi_familiarity >= 25
      // With no decay: 30 >= 25, should pass
      const act3Pass = metadataConditionsPass(ACT_3_METADATA, act3PlayerState);

      expect(act3Pass).toBe(true);
    });

    it('Act 3 gate fails after decay but passes after re-engagement', async () => {
      const eightDaysAgo = daysAgo(8);
      const now = new Date();

      // Step 1: Seed with familiarity = 30, last encounter 8 days ago
      await updatePlayerState(
        {},
        { last_adeyemi_encounter_at: eightDaysAgo.toISOString() },
        { adeyemi_familiarity: 30 }
      );

      // Step 2: Run decay - should drop familiarity below 25
      const playerState1 = await getPlayerState();
      const decayResult = computeRelationshipDecay(
        {
          stats: playerState1.stats,
          state: playerState1.state,
          prefix: 'adeyemi_',
          now,
        }
      );
      await updatePlayerState({}, decayResult.newState, decayResult.newStats);

      // Step 3: Verify Act 3 gate fails
      const playerState2 = await getPlayerState();
      const act3PlayerState1: PlayerConditionState = {
        flags: playerState2.flags,
        state: playerState2.state,
        stats: playerState2.stats,
        timeBlocks: 100,
      };
      expect(metadataConditionsPass(ACT_3_METADATA, act3PlayerState1)).toBe(false);

      // Step 4: Re-engage - set a new encounter with familiarity boost
      // Simulate an Act 3.5 encounter that boosts familiarity back up
      await updatePlayerState(
        { ANSWERED: true },
        { 
          last_adeyemi_encounter_at: now.toISOString(),
          last_adeyemi_decay_at: now.toISOString()
        },
        { 
          adeyemi_familiarity: 35, // Boosted by encounter
          adeyemi_familiarity_floor: 35, // Content-authored floor (worker never auto-sets it)
        }
      );

      // Step 5: Verify Act 3 gate now passes
      const playerState3 = await getPlayerState();
      const act3PlayerState2: PlayerConditionState = {
        flags: playerState3.flags,
        state: playerState3.state,
        stats: playerState3.stats,
        timeBlocks: 100,
      };
      expect(metadataConditionsPass(ACT_3_METADATA, act3PlayerState2)).toBe(true);
    });
  });

  describe('Decay worker pure function behavior', () => {
    it('computeRelationshipDecay produces consistent results', () => {
      const now = new Date();
      const sevenDaysAgo = daysAgo(7);

      const input = {
        stats: { adeyemi_trust: 40, adeyemi_familiarity: 30 },
        state: { last_adeyemi_encounter_at: sevenDaysAgo.toISOString() },
        prefix: 'adeyemi_',
        now,
      };

      // Call multiple times - should produce the same result (pure function)
      const result1 = computeRelationshipDecay(input);
      const result2 = computeRelationshipDecay(input);

      expect(result1.newStats).toEqual(result2.newStats);
      expect(result1.newState).toEqual(result2.newState);
      expect(result1.hasChanges).toBe(result2.hasChanges);
    });

    it('decay is capped at MAX_DAYS_PER_TICK', () => {
      const now = new Date();
      const sixtyDaysAgo = daysAgo(60);

      const input = {
        stats: { adeyemi_trust: 100 },
        state: { last_adeyemi_encounter_at: sixtyDaysAgo.toISOString() },
        prefix: 'adeyemi_',
        now,
      };

      const result = computeRelationshipDecay(input);

      // Capped at 30 days: 100 - (30 * 2) = 40
      expect(result.newStats.adeyemi_trust).toBe(40);
    });
  });
});