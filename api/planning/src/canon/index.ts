// api/planning/src/canon/index.ts
// Re-exports for canon module.

export type { CreateFlagInput, FlagDefinitionWithMetadata, FlagRegistry, RetireResult } from './flag-registry.js';
export {
  DatabaseFlagRegistry,
  InMemoryFlagRegistry,
  createFlagRegistry,
} from './flag-registry.js';

export type { StatValue, Threshold, ThresholdResult } from './threshold-events.js';
export {
  ThresholdMonitor,
  applyThresholdCrossing,
  applyThresholdCrossingSimple,
  FixtureFlagState,
} from './threshold-events.js';
