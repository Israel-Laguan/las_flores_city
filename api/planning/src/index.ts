// api/planning/src/index.ts
// Planning module entry point.
// SC-202, SC-204, SC-205, SC-206: Wire consumers of contracts primitives.

// Re-export from contracts (planning can import contracts)
export {
  FlagDefinition,
  FlagSemantics,
  validateFlagSlug,
  createFlagDefinition,
  isFlagDefinition,
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
} from '@las-flores/api-contracts';

// Flag registry (SC-202)
export {
  CreateFlagInput,
  FlagDefinitionWithMetadata,
  FlagRegistry,
  InMemoryFlagRegistry,
  DatabaseFlagRegistry,
  createFlagRegistry,
  RetireResult,
} from './canon/flag-registry.js';

// Threshold events (SC-206)
export {
  ThresholdMonitor,
  ThresholdResult,
  applyThresholdCrossing,
  applyThresholdCrossingSimple,
  FixtureFlagState,
  StatValue,
  Threshold,
} from './canon/threshold-events.js';

// Flag tracking (SC-205)
export {
  EntityPayload,
  EntityEffects,
  FlagSetEffect,
  FlagUsage,
  FlagEdge,
  extractFlagUsage,
  extractFlagReadsFromCondition,
  extractFlagSetsFromEffects,
  flagUsageToEdges,
  createFlagEdges,
  validateFlagReferences,
} from './edges/flag-tracking.js';

// Legacy placeholder
export const planningReady = true as const;
