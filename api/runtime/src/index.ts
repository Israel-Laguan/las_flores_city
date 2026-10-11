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
  ActiveRevision,
  Revision,
  RevisionId,
  RevisionManifest,
  RevisionReader,
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

// Revision-scoped artifact lookup + pool-line resolution (SC-M3 T2 / SC-502)
export type { ArtifactReader, StoredArtifact } from '@las-flores/api-contracts';
export type { LookupErrorCode, LookupSources, RevisionManifestReader } from './resolve/lookup.js';
export { ArtifactLookupError, RevisionScopedLookup } from './resolve/lookup.js';
export type { ResolveCharacterLineAtInput } from './resolve/character-line.js';
export { resolveCharacterLineAt } from './resolve/character-line.js';
export { InMemoryArtifactReader, InMemoryRevisionManifestReader } from './resolve/in-memory.js';

// Player state keyed by player AND game (SC-501)
export type {
  Game,
  GameFlagRepository,
  GameRepository,
  GameResolution,
  GameResolutionInput,
  ResolutionRepository,
  SetFlagResult,
} from './state/ports.js';
export { GameNotFoundError } from './state/ports.js';
export {
  InMemoryGameFlagRepository,
  InMemoryGameRepository,
  InMemoryResolutionRepository,
  flagsForGame,
} from './state/in-memory.js';

// Client-owned session pin (SC-504)
export type { SessionStart } from './session/pin.js';
export { NoActiveRevisionError, requirePinnedRevision, startSession } from './session/pin.js';
