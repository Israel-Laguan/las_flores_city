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
export type { CoSatisfiableResult, CoSatisfiableOptions } from './condition/index.js';
export { MAX_SAT_VARS, coSatisfiable } from './condition/index.js';

// Scene (SC-301)
export type { SceneDef, SceneDefInput, SceneTime, RoleSlot, SlotPosition, ValidateSceneOptions } from './scene/index.js';
export {
  SCENE_SCHEMA_VERSION,
  SCENE_TIMES,
  InvalidSceneDefError,
  createSceneDef,
  isSceneTime,
  sceneDefToJSON,
  sceneDefFromJSON,
  stringifySceneDef,
  isValidSlug,
  isUuid,
  SLOT_POSITIONS,
  isSlotPosition,
  findDuplicateSlotIds,
  SCENE_ISSUE_CODES,
  validateScene,
} from './scene/index.js';
export type { SceneIssueCode, SceneIssue, SceneValidationResult } from './scene/index.js';

// Scene overlays (SC-303a)
export type {
  SceneOverlay,
  SceneOverlayInput,
  SceneOverlayOp,
  AddDialogueRefsOp,
  AddItemsOp,
  AddRoleSlotOp,
  AddSlotLinesOp,
  CastSlotOp,
  SetWeatherOp,
  SetTimeOp,
  SceneOverlayOpName,
  SceneOverlayOpKind,
  ValidateSceneOverlayOptions,
  SceneOverlayIssueCode,
  SceneOverlayIssue,
  SceneOverlayValidationResult,
} from './scene/index.js';
export {
  InvalidSceneOverlayError,
  createSceneOverlay,
  sceneOverlayOpToJSON,
  sceneOverlayToJSON,
  sceneOverlayFromJSON,
  stringifySceneOverlay,
  SCENE_OVERLAY_SCHEMA_VERSION,
  SCENE_OVERLAY_OPS,
  SCENE_OVERLAY_OP_NAMES,
  isSceneOverlayOpName,
  SCENE_OVERLAY_ISSUE_CODES,
  validateSceneOverlay,
} from './scene/index.js';

// Scene composition engine (SC-303b, shared by planning compile + runtime)
export type {
  ApplyResult,
  ComposedScene,
  ConditionalLayer,
  OverlayLayer,
  Provenance,
  ProvenanceSource,
  ResolvedScene,
  SceneComposeIssue,
  SceneComposeIssueCode,
} from './scene/index.js';
export { SCENE_COMPOSE_ISSUE_CODES, applyOverlayOps, toComposedScene } from './scene/index.js';
export type { PlayerScene } from './scene/index.js';
export { resolveSceneForPlayer, selectActiveOverlays } from './scene/index.js';

// Scene lines (SC-307; also the SC-306 pool line shape)
export type { LineWhen, SlotLine, LineProblem } from './scene/index.js';
export {
  LINE_WHEN_KEYS,
  SLOT_LINE_JSON_KEYS,
  checkLineWhen,
  checkSlotLine,
  lineWhenSpecificity,
  lineWhenToJSON,
  slotLineKey,
  slotLineToJSON,
} from './scene/index.js';

// Personality pools + the specificity ladder (SC-306/308)
export type { PoolLine } from './scene/line.js';
export {
  POOL_LINE_JSON_KEYS,
  checkPoolLine,
  poolLineFromJSON,
  poolLineToJSON,
} from './scene/line.js';
export type {
  PersonalityPool,
  PersonalityPoolInput,
  PoolIssue,
  PoolIssueCode,
  PoolValidationResult,
} from './dialogue/personality-pool.js';
export {
  InvalidPersonalityPoolError,
  PERSONALITY_POOL_JSON_KEYS,
  PERSONALITY_POOL_SCHEMA_VERSION,
  POOL_ISSUE_CODES,
  createPersonalityPool,
  personalityPoolFromJSON,
  personalityPoolToJSON,
  stringifyPersonalityPool,
  validatePersonalityPool,
} from './dialogue/personality-pool.js';
export type { LineCandidate, LineContext, LineRung } from './dialogue/resolve-line.js';
export {
  LINE_RUNGS,
  lineApplies,
  poolLineCandidates,
  resolveLine,
  slotLineCandidates,
} from './dialogue/resolve-line.js';

// Validation (shared issue format)
export type { IssueSeverity, ValidationIssue, ValidationResult } from './validation/index.js';
export { ISSUE_SEVERITIES, createValidationResult, issuePath } from './validation/index.js';

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
  ARTIFACT_ID_PATTERN,
  CONTENT_HASH_PATTERN,
  validateContentHash,
  createArtifactId,
  isArtifactId,
  isArtifact,
  isArtifactManifest,
} from './artifact/artifact.js';

// Scene artifact + compile report (SC-401/402/405)
export type {
  CompileIssue,
  CompileIssueCode,
  CompileReport,
  CompileSceneEntry,
  CompileSceneStatus,
  SceneArtifactPayload,
  CharacterPoolsArtifactPayload,
  ArtifactReader,
  StoredArtifact,
} from './artifact/index.js';
export {
  COMPILE_ISSUE_CODES,
  COMPILE_REPORT_VERSION,
  SCENE_ARTIFACT_SCHEMA_VERSION,
  CHARACTER_POOLS_ARTIFACT_SCHEMA_VERSION,
  InvalidPoolArtifactError,
  InvalidSceneArtifactError,
  characterPoolsArtifactContentHash,
  characterPoolsArtifactFromBytes,
  characterPoolsArtifactToJSON,
  personalityPoolArtifactContentHash,
  personalityPoolArtifactFromBytes,
  stringifyCharacterPoolsArtifact,
  stringifyPersonalityPoolArtifact,
  buildCompileReport,
  sceneArtifactContentHash,
  sceneArtifactPayloadFromJSON,
  sceneArtifactPayloadToJSON,
  sha256Hex,
  stringifyCompileReport,
  stringifySceneArtifact,
} from './artifact/index.js';

// Revision (SC-404, D1: bundle revision + compare-and-swap pointer)
export type {
  ActiveRevision,
  CreateRevisionInput,
  FlipFailureCode,
  FlipInput,
  FlipRecord,
  FlipResult,
  ManifestEntry,
  Revision,
  RevisionId,
  RevisionManifest,
  RevisionReader,
  RevisionWriter,
} from './revision/index.js';
export {
  InvalidManifestError,
  RevisionArtifactMissingError,
  isRevisionId,
  manifestHash,
  normaliseManifest,
} from './revision/index.js';

// Legacy placeholder (for backwards compatibility)
export const contractsReady = true as const;
