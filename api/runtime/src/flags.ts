// api/runtime/src/flags.ts
// Runtime flag state management.
// Runtime can READ flag state (from runtime.flag_state table) but CANNOT write.
// Flag state is written by planning module based on threshold crossings and other events.

import type { FlagState } from '@las-flores/api-contracts';

/**
 * Runtime view of flag state for a specific player.
 * This is a read-only snapshot of the flags set for a player.
 */
export type RuntimeFlagState = FlagState & {
  /** The player ID this state belongs to */
  playerId: string;
  /** When this state was last updated */
  updatedAt: string;
};

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
    return this.state.get(playerId);
  }

  async getFlagValue(playerId: string, flagSlug: string): Promise<boolean> {
    const playerState = this.state.get(playerId);
    if (!playerState) {
      return false;
    }
    return playerState[flagSlug] ?? false;
  }

  async getTrueFlags(playerId: string): Promise<Set<string>> {
    const playerState = this.state.get(playerId);
    if (!playerState) {
      return new Set();
    }
    const trueFlags = new Set<string>();
    for (const [flagSlug, isSet] of Object.entries(playerState)) {
      if (isSet && flagSlug !== 'playerId' && flagSlug !== 'updatedAt') {
        trueFlags.add(flagSlug);
      }
    }
    return trueFlags;
  }

  /**
   * Set state for testing (not part of the public interface).
   */
  setPlayerState(playerId: string, flagState: Omit<RuntimeFlagState, 'playerId'>): void {
    this.state.set(playerId, { ...flagState, playerId });
  }

  /**
   * Clear all state (for test cleanup).
   */
  clear(): void {
    this.state.clear();
  }
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
 * Convenience function to get flag state for a player.
 * Uses the in-memory implementation for testing.
 */
export async function getPlayerFlagState(
  playerId: string,
  repository: FlagStateRepository = new InMemoryFlagStateRepository(),
): Promise<PlayerFlagStateResult | undefined> {
  const flagState = await repository.getPlayerState(playerId);
  if (!flagState) {
    return undefined;
  }
  return {
    flagState,
    trueFlags: await repository.getTrueFlags(playerId),
  };
}

/**
 * Convenience function to check if a specific flag is set for a player.
 */
export async function isPlayerFlagSet(
  playerId: string,
  flagSlug: string,
  repository: FlagStateRepository = new InMemoryFlagStateRepository(),
): Promise<boolean> {
  return repository.getFlagValue(playerId, flagSlug);
}

/**
 * Factory function to create a flag state repository.
 * In production, this would create a DatabaseFlagStateRepository.
 * In tests, this can create an InMemoryFlagStateRepository.
 */
export function createFlagStateRepository(
  inMemory = false,
): FlagStateRepository {
  if (inMemory) {
    return new InMemoryFlagStateRepository();
  }
  return new DatabaseFlagStateRepository();
}
