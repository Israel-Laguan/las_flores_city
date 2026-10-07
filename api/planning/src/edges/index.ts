// api/planning/src/edges/index.ts
// Re-exports for edges module.

export type { EntityPayload, EntityEffects, FlagSetEffect, FlagUsage, FlagEdge, FlagRead, FlagWrite } from './flag-tracking.js';
export {
  SCENE_DEF_ENTITY_TYPE,
  extractFlagUsage,
  extractFlagReadsFromCondition,
  extractFlagSetsFromEffects,
  flagUsageToEdges,
  createFlagEdges,
  validateFlagReferences,
} from './flag-tracking.js';
