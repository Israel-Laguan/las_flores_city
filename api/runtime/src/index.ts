// api/runtime/src/index.ts
// Runtime module entry point.
// SC-204: Wire consumer of condition evaluator from contracts.

// Re-export from contracts (runtime can import contracts)
export {
  FlagDefinition,
  FlagSemantics,
  FlagState,
  ConditionExpr,
  flag,
  not,
  and,
  or,
  TRUE,
  FALSE,
  isConditionExpr,
  extractFlagSlugs,
  toJSON,
  fromJSON,
  equals,
  evaluate,
  evaluateWithFlagObject,
  flagSetFromObject,
  flagObjectFromSet,
  Artifact,
  ArtifactManifest,
  ArtifactId,
  RevisionPointer,
  RevisionPointerRead,
  RevisionPointerReader,
} from '@las-flores/api-contracts';

// Runtime-specific flag state management
export {
  /**
   * Runtime view of flag state for a specific context (e.g., player).
   * This is read-only from runtime's perspective (written by planning).
   */
  type RuntimeFlagState,
  /**
   * Get flag state for a player.
   * In practice, this would query runtime.flag_state table.
   */
  getPlayerFlagState,
  /**
   * Check if a specific flag is set for a player.
   */
  isPlayerFlagSet,
} from './flags.js';

// Legacy placeholder
export const runtimeReady = true as const;
