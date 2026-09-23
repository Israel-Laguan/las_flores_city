// api/planning/src/edges/index.ts
// Re-exports for edges module.

export type { EntityPayload, EntityEffects, FlagSetEffect, FlagUsage, FlagEdge } from './flag-tracking.js';
export {
  extractFlagUsage,
  extractFlagReadsFromCondition,
  extractFlagSetsFromEffects,
  flagUsageToEdges,
  createFlagEdges,
  validateFlagReferences,
} from './flag-tracking.js';
