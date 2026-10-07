// api/contracts/src/index.ts
// SC-102: Re-exports all submodules for the contracts module.
// contracts/ is a leaf module - it may be imported by both planning/ and runtime/,
// but may NOT import either of them.

// Flags
export type { FlagDefinition, FlagSemantics, FlagState } from './flags/flag-definition.js';
export {
  FLAG_SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  InvalidFlagSlugError,
  validateFlagSlug,
  createFlagDefinition,
  isFlagDefinition,
} from './flags/flag-definition.js';

// Weather
export type { WeatherTag } from './weather/index.js';
export {
  WEATHER_TAGS,
  DEFAULT_WEATHER_TAG,
  TIME_OF_DAY_VARIANT_TAGS,
  InvalidWeatherTagError,
  isWeatherTag,
  validateWeatherTag,
} from './weather/index.js';

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

// Scene (SC-301)
export type { SceneDef, SceneTime, RoleSlot, SlotPosition } from './scene/index.js';
export {
  SCENE_SCHEMA_VERSION,
  SCENE_TIMES,
  InvalidSceneDefError,
  isSceneTime,
  sceneDefToJSON,
  sceneDefFromJSON,
  stringifySceneDef,
  isValidSlug,
  isUuid,
  SLOT_POSITIONS,
  isSlotPosition,
  findDuplicateSlotIds,
} from './scene/index.js';

// Artifact
export type {
  Artifact,
  ArtifactId,
  ArtifactManifest,
  ArtifactValidation,
  ContentHash,
  ArtifactType,
  ISODateString,
  ManifestVersion,
} from './artifact/artifact.js';
export {
  ARTIFACT_TYPES,
  CONTENT_HASH_PATTERN,
  validateContentHash,
  createArtifactId,
  isArtifact,
  isArtifactManifest,
} from './artifact/artifact.js';

// Revision
export type {
  AtomicFlip,
  AtomicFlipResult,
  RevisionId,
  RevisionPointer,
  RevisionPointerCreate,
  RevisionPointerCreated,
  RevisionPointerRead,
  RevisionPointerReader,
  RevisionPointerRepository,
  RevisionPointerWriter,
} from './revision/revision-pointer.js';
export type { ISODateString as RevisionISODateString } from './revision/revision-pointer.js';
export {
  createRevisionPointer,
  isRevisionPointer,
  isRevisionPointerRead,
} from './revision/revision-pointer.js';

// Legacy placeholder (for backwards compatibility)
export const contractsReady = true as const;
