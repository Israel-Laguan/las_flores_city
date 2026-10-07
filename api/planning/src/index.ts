// api/planning/src/index.ts
// Planning module entry point.
// SC-202, SC-204, SC-205, SC-206: Wire consumers of contracts primitives.

// Re-export from contracts (planning can import contracts)
export type {
  FlagDefinition,
  FlagSemantics,
  ConditionExpr,
  Artifact,
  ArtifactManifest,
  ArtifactId,
  RevisionPointer,
  RevisionPointerRead,
} from '@las-flores/api-contracts';

export {
  validateFlagSlug,
  createFlagDefinition,
  isFlagDefinition,
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

// Flag registry (SC-202)
export type {
  CreateFlagInput,
  FlagDefinitionWithMetadata,
  FlagRegistry,
  RetireResult,
} from './canon/flag-registry.js';
export {
  InMemoryFlagRegistry,
  createFlagRegistry,
} from './canon/flag-registry.js';

// Threshold events (SC-206)
export type { ThresholdResult, StatValue, Threshold } from './canon/threshold-events.js';
export {
  ThresholdMonitor,
  applyThresholdCrossing,
  applyThresholdCrossingSimple,
  FixtureFlagState,
} from './canon/threshold-events.js';

// Flag tracking (SC-205)
export type {
  EntityPayload,
  EntityEffects,
  FlagSetEffect,
  FlagUsage,
  FlagEdge,
  FlagRead,
  FlagWrite,
} from './edges/flag-tracking.js';
export {
  SCENE_DEF_ENTITY_TYPE,
  extractFlagUsage,
  extractFlagReadsFromCondition,
  extractFlagSetsFromEffects,
  flagUsageToEdges,
  createFlagEdges,
  validateFlagReferences,
} from './edges/flag-tracking.js';

// Legacy placeholder
export const planningReady = true as const;
