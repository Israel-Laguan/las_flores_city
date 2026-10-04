// api/contracts/src/flags/index.ts
// Re-exports for flags module.

export type {
  FlagDefinition,
  FlagSemantics,
  FlagState,
} from './flag-definition.js';
export {
  FLAG_SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  InvalidFlagSlugError,
  validateFlagSlug,
  createFlagDefinition,
  isFlagDefinition,
} from './flag-definition.js';
