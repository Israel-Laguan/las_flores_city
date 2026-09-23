// api/contracts/src/index.ts
// SC-102: Re-exports all submodules for the contracts module.
// contracts/ is a leaf module - it may be imported by both planning/ and runtime/,
// but may NOT import either of them.

// Flags
export type { FlagSemantics, FlagState } from './flags/flag-definition.js';
export {
  FlagDefinition,
  FLAG_SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  InvalidFlagSlugError,
  validateFlagSlug,
  createFlagDefinition,
  isFlagDefinition,
} from './flags/flag-definition.js';

// Condition
export type {
  ConditionExpr,
  FlagCondition,
  NotCondition,
  AndCondition,
  OrCondition,
  TrueCondition,
  FalseCondition,
  FlagSet,
} from './condition/index.js';
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
} from './condition/index.js';

// Artifact
export type {
  ArtifactId,
  ManifestVersion,
  ContentHash,
  ArtifactType,
  ISODateString,
} from './artifact/artifact.js';
export {
  Artifact,
  ArtifactManifest,
  ArtifactValidation,
  CONTENT_HASH_PATTERN,
  validateContentHash,
  createArtifactId,
  isArtifact,
  isArtifactManifest,
} from './artifact/artifact.js';

// Revision
export type {
  RevisionId,
  RevisionISODateString,
} from './revision/revision-pointer.js';
export {
  RevisionPointer,
  RevisionPointerRead,
  RevisionPointerCreate,
  RevisionPointerCreated,
  AtomicFlip,
  AtomicFlipResult,
  RevisionPointerReader,
  RevisionPointerWriter,
  RevisionPointerRepository,
  isRevisionPointer,
  isRevisionPointerRead,
  createRevisionPointer,
} from './revision/revision-pointer.js';

// Legacy placeholder (for backwards compatibility)
export const contractsReady = true as const;
