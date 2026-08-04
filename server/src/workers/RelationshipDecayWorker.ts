import { oltpPool } from '../database/connection.js';
import { RELATIONSHIP_STAT_PREFIXES } from '@las-flores/shared';

/**
 * RelationshipDecayWorker
 *
 * Implements Rule 2: Missed encounters are data. Decays relationship stats
 * for characters that haven't been engaged with recently.
 *
 * Runs on a setInterval cron in the Express bootstrap.
 * For each user with relationship state, checks elapsed days since last encounter
 * and decays trust/familiarity, adjusts tension.
 */

// ============================================================
// Pure decay computation — no I/O, fully testable
// ============================================================

export interface DecayRates {
  trustDecayPerDay: number;
  familiarityDecayPerDay: number;
  tensionGrowthPerDay: number;
}

export interface DecayBounds {
  minTrust: number;
  minFamiliarity: number;
  maxTension: number;
}

export interface DecayInput {
  stats: Record<string, number>;
  state: Record<string, string>;
  prefix: string;
  now: Date;
}

export interface DecayResult {
  newStats: Record<string, number>;
  newState: Record<string, string>;
  hasChanges: boolean;
}

// Default rates and bounds
const DEFAULT_RATES: DecayRates = {
  trustDecayPerDay: 2,
  familiarityDecayPerDay: 1,
  tensionGrowthPerDay: 1,
};

const DEFAULT_BOUNDS: DecayBounds = {
  minTrust: -100,
  minFamiliarity: 0,
  maxTension: 100,
};

/** Maximum days to apply in a single tick (prevents huge catch-up spikes if worker was down) */
const MAX_DAYS_PER_TICK = 30;

/**
 * Compute relationship decay for a single character prefix.
 * Pure function — no I/O, deterministic, fully testable.
 */
export function computeRelationshipDecay(
  input: DecayInput,
  rates: DecayRates = DEFAULT_RATES,
  bounds: DecayBounds = DEFAULT_BOUNDS
): DecayResult {
  const { stats, state, prefix, now } = input;
  const result: DecayResult = {
    newStats: { ...stats },
    newState: { ...state },
    hasChanges: false,
  };

  const lastEncounterKey = `last_${prefix}encounter_at`;
  const lastDecayKey = `last_${prefix}decay_at`;
  const trustKey = `${prefix}trust`;
  const familiarityKey = `${prefix}familiarity`;
  const tensionKey = `${prefix}tension`;
  const trustFloorKey = `${prefix}trust_floor`;
  const familiarityFloorKey = `${prefix}familiarity_floor`;

  const lastEncounterTime = state[lastEncounterKey];
  
  // If no last encounter, nothing to decay
  if (!lastEncounterTime) {
    return result;
  }

  const lastDecayTime = state[lastDecayKey];
  const lastEncounterDate = new Date(lastEncounterTime);

  // Use last_decay_at if available (for incremental decay), otherwise fall back to last_encounter_at.
  // However, if the player re-engaged after the last decay tick (last_encounter_at is
  // newer than last_decay_at), use the encounter time as the reference so we don't
  // charge decay for the period the player was actively engaged.
  const lastDecayDate = lastDecayTime ? new Date(lastDecayTime) : null;
  let referenceDate: Date;
  if (lastDecayDate && lastDecayDate.getTime() > lastEncounterDate.getTime()) {
    // Decay marker is newer than the last encounter — incremental decay.
    referenceDate = lastDecayDate;
  } else {
    // Either no prior decay, or the player re-engaged after the last decay tick.
    // Use the encounter time so decay starts from the most recent interaction.
    referenceDate = lastEncounterDate;
  }

  // An unparsable timestamp would make daysElapsed NaN and persist NaN stats.
  if (Number.isNaN(referenceDate.getTime())) {
    return result;
  }

  const daysElapsed = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));

  // Cap to prevent huge catch-up spikes
  const cappedDays = Math.min(daysElapsed, MAX_DAYS_PER_TICK);

  // If no time has passed, nothing to do
  if (cappedDays <= 0) {
    return result;
  }

  // Get current values
  const currentTrust = stats[trustKey] ?? 0;
  const currentFamiliarity = stats[familiarityKey] ?? 0;
  const currentTension = stats[tensionKey] ?? 0;

  // Floors are content-authored only — the worker never auto-initializes them.
  // If a content author set an explicit <prefix>trust_floor / <prefix>familiarity_floor
  // stat, decay won't drop below it. Otherwise the floor is the hard minimum
  // (bounds.minTrust / bounds.minFamiliarity), so neglect has real consequences.
  // (Auto-initializing the floor to the current value on first tick would clamp
  //  decay straight back to the starting value and make trust/familiarity un-decayable.)
  const trustFloor = stats[trustFloorKey] ?? bounds.minTrust;
  const familiarityFloor = stats[familiarityFloorKey] ?? bounds.minFamiliarity;

  // Apply linear decay
  const newTrust = Math.max(bounds.minTrust, currentTrust - (rates.trustDecayPerDay * cappedDays));
  const newFamiliarity = Math.max(bounds.minFamiliarity, currentFamiliarity - (rates.familiarityDecayPerDay * cappedDays));
  const newTension = Math.min(bounds.maxTension, currentTension + (rates.tensionGrowthPerDay * cappedDays));

  // Apply floor protection: don't decay below the floor, but never raise a stat.
  const flooredTrust = Math.min(currentTrust, Math.max(newTrust, trustFloor));
  const flooredFamiliarity = Math.min(currentFamiliarity, Math.max(newFamiliarity, familiarityFloor));

  // Update stats if changed
  if (flooredTrust !== currentTrust) {
    result.newStats[trustKey] = flooredTrust;
    result.hasChanges = true;
  }
  if (flooredFamiliarity !== currentFamiliarity) {
    result.newStats[familiarityKey] = flooredFamiliarity;
    result.hasChanges = true;
  }
  if (newTension !== currentTension) {
    result.newStats[tensionKey] = newTension;
    result.hasChanges = true;
  }

  // Update the last decay timestamp
  result.newState[lastDecayKey] = now.toISOString();

  return result;
}

// Re-export for backward compatibility (tests import from here).
// The canonical source is shared/src/conditions.ts.
export { RELATIONSHIP_STAT_PREFIXES } from '@las-flores/shared';

/**
 * RelationshipDecayWorker
 *
 * Implements Rule 2: Missed encounters are data. Decays relationship stats
 * for characters that haven't been engaged with recently.
 *
 * Runs on a setInterval cron in the Express bootstrap.
 * For each user with relationship state, checks elapsed days since last encounter
 * and decays trust/familiarity, adjusts tension.
 */
export class RelationshipDecayWorker {
  /**
   * Process relationship decay for all users.
   * For each user, finds their relationship stats and decays them based on
   * time since last encounter with each character.
   */
  public static async processDecay(): Promise<void> {
    // Page through all eligible users in batches so players beyond the
    // first 500 also receive decay. The LIMIT is a batch size, not a cap.
    let cursor: string | null = null;
    let totalProcessed = 0;

    try {
      for (;;) {
        // Acquire a fresh select client each iteration — release it before
        // per-user transactions so we don't hold two connections at once.
        let selectClient: import('pg').PoolClient;
        try {
          selectClient = await oltpPool.connect();
        } catch (err) {
          console.error('[RelationshipDecayWorker] processDecay connection error:', err);
          return;
        }

        let batch: { id: string }[];
        try {
          const { rows } = await selectClient.query<{ id: string }>(
            `SELECT DISTINCT ps.user_id AS id
               FROM player_states ps
              WHERE ps.state IS NOT NULL
                AND ps.state != '{}'::jsonb
                AND EXISTS (
                  SELECT 1 FROM jsonb_object_keys(ps.state) AS k(key)
                  WHERE key LIKE 'last_\\_%\\_encounter_at' ESCAPE '\\'
                )
                ${cursor ? 'AND ps.user_id > $2' : ''}
              ORDER BY ps.user_id
              LIMIT 500`,
            cursor ? [cursor] : []
          );
          batch = rows;
        } finally {
          selectClient.release();
        }

        if (batch.length === 0) {
          break; // no more eligible users
        }

        // Process each user in this batch
        for (const user of batch) {
          let client: import('pg').PoolClient;
          try {
            client = await oltpPool.connect();
          } catch (err) {
            console.error(`[RelationshipDecayWorker] failed to connect for user=${user.id}:`, err);
            continue;
          }

          try {
            await this.processUserDecay(client, user.id);
          } catch (err) {
            console.error(`[RelationshipDecayWorker] decay failed for user=${user.id}:`, err);
          } finally {
            client.release();
          }
        }

        totalProcessed += batch.length;

        if (batch.length < 500) {
          break; // last page — no more users to process
        }

        cursor = batch[batch.length - 1].id;
      }
    } catch (err) {
      console.error('[RelationshipDecayWorker] processDecay error:', err);
    } finally {
      console.log(`[RelationshipDecayWorker] processed ${totalProcessed} user(s) this tick`);
    }
  }

  /**
   * Process decay for a single user.
   * Finds all relationship stats and last encounter timestamps, computes decay.
   */
  private static async processUserDecay(
    client: import('pg').PoolClient,
    userId: string
  ): Promise<void> {
    await client.query('BEGIN');

    try {
      // Get current player state
      const { rows: stateRows } = await client.query<{
        flags: Record<string, boolean>;
        state: Record<string, string>;
        stats: Record<string, number>;
      }>(
        `SELECT flags, state, stats FROM player_states WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      if (stateRows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      const playerState = stateRows[0];
      const currentState = playerState.state || {};
      const currentStats = playerState.stats || {};

      let updatedStats = { ...currentStats };
      let updatedState = { ...currentState };
      let hasChanges = false;

      const now = new Date();

      // Process each relationship character using the pure decay function
      for (const prefix of RELATIONSHIP_STAT_PREFIXES) {
        const result = computeRelationshipDecay(
          {
            stats: updatedStats,
            state: updatedState,
            prefix,
            now,
          },
          DEFAULT_RATES,
          DEFAULT_BOUNDS
        );

        // Merge results
        if (result.hasChanges) {
          updatedStats = result.newStats;
          updatedState = result.newState;
          hasChanges = true;
        }
      }

      // Update player state if changes occurred
      if (hasChanges) {
        await client.query(
          `UPDATE player_states SET stats = $1, state = $2 WHERE user_id = $3`,
          [updatedStats, updatedState, userId]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
}
