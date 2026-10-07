// api/runtime/src/index.ts
// Runtime module entry point.
// SC-204: Wire consumer of condition evaluator from contracts.

// Re-export from contracts (runtime can import contracts)
export type {
  FlagDefinition,
  FlagSemantics,
  FlagState,
  ConditionExpr,
  Artifact,
  ArtifactManifest,
  ArtifactId,
  RevisionPointer,
  RevisionPointerRead,
  RevisionPointerReader,
} from '@las-flores/api-contracts';

export {
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
} from '@las-flores/api-contracts';

// Runtime-specific flag state management
export type { RuntimeFlagState } from './flags.js';
export {
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

// Scene resolution (SC-312): select + apply a compiled scene's active layers per player.
export type { ComposedScene, ConditionalLayer, PlayerScene, ResolvedScene } from '@las-flores/api-contracts';
export { resolveSceneForPlayer, selectActiveOverlays } from '@las-flores/api-contracts';
export { resolvePlayerScene } from './resolve/scene.js';
