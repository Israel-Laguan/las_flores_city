// api/runtime/src/flags.ts
// Runtime flag state management.
// Runtime can READ flag state (from runtime.flag_state table) but CANNOT write.
// Flag state is written by planning module based on threshold crossings and other events.

import type { FlagState } from '@las-flores/api-contracts';

/**
 * Runtime view of flag state for a specific player.
 * This is a read-only snapshot of the flags set for a player.
 *
 * Flag values live in their own `flags` field rather than being intersected
 * with the metadata: `FlagState` is `Record<string, boolean>`, so an
 * intersection typed `playerId` as `boolean & string` (i.e. `never`) and a
 * perfectly valid slug named `playerId` or `updatedAt` would collide with the
 * metadata.
 */
export interface RuntimeFlagState {
  /** The player ID this state belongs to */
  playerId: string;
  /** When this state was last updated */
  updatedAt: string;
  /** Flag slug -> current boolean state */
  flags: FlagState;
}

/**
 * Result of getting flag state for a player.
 */
export interface PlayerFlagStateResult {
  /** The player's flag state */
  flagState: RuntimeFlagState;
  /** The set of true flag slugs (for convenience) */
  trueFlags: Set<string>;
}

/**
 * Placeholder for database-backed flag state repository.
 * In practice, this would query the runtime.flag_state table.
 * 
 * Note: This is a READ-ONLY interface. Runtime cannot write to flag state.
 */
export interface FlagStateRepository {
  /**
   * Get the flag state for a player.
   * Returns undefined if no state exists for this player.
   */
  getPlayerState(playerId: string): Promise<RuntimeFlagState | undefined>;

  /**
   * Get the value of a specific flag for a player.
   * Returns false if the flag is not set or doesn't exist.
   */
  getFlagValue(playerId: string, flagSlug: string): Promise<boolean>;

  /**
   * Get all true flags for a player.
   * Returns a Set of flag slugs that are currently true.
   */
  getTrueFlags(playerId: string): Promise<Set<string>>;
}

/**
 * In-memory implementation for testing.
 * Useful for unit tests that don't require a real database.
 */
export class InMemoryFlagStateRepository implements FlagStateRepository {
  private state: Map<string, RuntimeFlagState> = new Map();

  async getPlayerState(playerId: string): Promise<RuntimeFlagState | undefined> {
    return copyFlagState(this.state.get(playerId));
  }

  async getFlagValue(playerId: string, flagSlug: string): Promise<boolean> {
    const playerState = this.state.get(playerId);
    if (!playerState) {
      return false;
    }
    // `playerState.flags[flagSlug]` would resolve `constructor` / `toString` /
    // `__proto__` through Object.prototype and hand back a truthy function typed
    // as `boolean`, so a cleared flag reads as set. `validateFlagSlug` admits all
    // three spellings, so only an own-key check distinguishes them.
    return Object.hasOwn(playerState.flags, flagSlug)
      ? playerState.flags[flagSlug]
      : false;
  }

  async getTrueFlags(playerId: string): Promise<Set<string>> {
    const playerState = this.state.get(playerId);
    if (!playerState) {
      return new Set();
    }
    return trueFlagSet(playerState.flags);
  }

  /**
   * Set state for testing (not part of the public interface).
   */
  setPlayerState(playerId: string, flagState: Omit<RuntimeFlagState, 'playerId'>): void {
    this.state.set(playerId, { ...flagState, playerId, flags: { ...flagState.flags } });
  }

  /**
   * Clear all state (for test cleanup).
   */
  clear(): void {
    this.state.clear();
  }
}

/**
 * Defensive copy of a flag snapshot.
 *
 * The interface is documented as a read-only snapshot, but handing back the
 * stored object let a caller mutate `state.flags` and silently change every later
 * read of that player. Copy the `flags` record too, for the same reason.
 */
function copyFlagState(state: RuntimeFlagState | undefined): RuntimeFlagState | undefined {
  if (!state) {
    return undefined;
  }
  return { ...state, flags: { ...state.flags } };
}

/**
 * True flag slugs for a `FlagState` record. Derived from the record itself so
 * callers get one consistent snapshot rather than a second repository read that
 * could observe a different version of the state.
 */
function trueFlagSet(flags: FlagState): Set<string> {
  const trueFlags = new Set<string>();
  for (const [flagSlug, isSet] of Object.entries(flags)) {
    if (isSet) {
      trueFlags.add(flagSlug);
    }
  }
  return trueFlags;
}

/**
 * Database-backed implementation.
 * This would query the runtime.flag_state table in a real implementation.
 * 
 * For the api/runtime module (which is pure TypeScript with no DB access),
 * this is a placeholder that would be implemented in server/src/.
 */
export class DatabaseFlagStateRepository implements FlagStateRepository {
  async getPlayerState(_playerId: string): Promise<RuntimeFlagState | undefined> {
    throw new Error(
      'DatabaseFlagStateRepository.getPlayerState: Not implemented in api/runtime. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }

  async getFlagValue(_playerId: string, _flagSlug: string): Promise<boolean> {
    throw new Error(
      'DatabaseFlagStateRepository.getFlagValue: Not implemented in api/runtime. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }

  async getTrueFlags(_playerId: string): Promise<Set<string>> {
    throw new Error(
      'DatabaseFlagStateRepository.getTrueFlags: Not implemented in api/runtime. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }
}

/**
 * Gets the flag state for a player.
 *
 * Returns undefined if no state exists for this player.
 * The `trueFlags` set is derived from the same snapshot to avoid
 * straddling updates.
 *
 * @param playerId - Player to look up
 * @param repository - Flag state repository
 * @returns Player flag state and true-flag set, or undefined
 */
export async function getPlayerFlagState(
  playerId: string,
  repository: FlagStateRepository,
): Promise<PlayerFlagStateResult | undefined> {
  const flagState = await repository.getPlayerState(playerId);
  if (!flagState) {
    return undefined;
  }
  return {
    flagState,
    trueFlags: trueFlagSet(flagState.flags),
  };
}

/**
 * Checks whether a specific flag is set for a player.
 *
 * @param playerId - Player to check
 * @param flagSlug - Flag slug to look up
 * @param repository - Flag state repository
 * @returns true if the flag is set
 */
export async function isPlayerFlagSet(
  playerId: string,
  flagSlug: string,
  repository: FlagStateRepository,
): Promise<boolean> {
  return repository.getFlagValue(playerId, flagSlug);
}

/**
 * Creates a flag state repository.
 *
 * @param inMemory - true for an in-memory implementation (default: false,
 *   which returns a DatabaseFlagStateRepository placeholder)
 * @returns A FlagStateRepository implementation
 */
export function createFlagStateRepository(
  inMemory = false,
): FlagStateRepository {
  if (inMemory) {
    return new InMemoryFlagStateRepository();
  }
  return new DatabaseFlagStateRepository();
}
