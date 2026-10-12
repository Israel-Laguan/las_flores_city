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
  ActiveRevision,
  Revision,
  RevisionId,
  RevisionManifest,
  RevisionReader,
  RevisionWriter,
  FlipInput,
  FlipResult,
  FlipRecord,
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

// Scene def repository (SC-311)
export type {
  ListSceneDefsOptions,
  SceneDefRecord,
  SceneDefRepository,
  UpsertResult,
  UpsertStatus,
} from './canon/scene-def-repository.js';
export {
  InMemorySceneDefRepository,
  SceneDefRetiredError,
  normaliseSceneDef,
  sceneDefContentHash,
} from './canon/scene-def-repository.js';

// Scene overlay repository (SC-314)
export type {
  ListSceneOverlaysOptions,
  SceneOverlayRecord,
  SceneOverlayRepository,
} from './canon/scene-overlay-repository.js';
export {
  InMemorySceneOverlayRepository,
  SceneOverlayRetiredError,
  normaliseSceneOverlay,
  sceneOverlayContentHash,
} from './canon/scene-overlay-repository.js';

// Scene composition (SC-303b)
export type {
  ComposedScene,
  ConditionalLayer,
  Provenance,
  ResolvedScene,
  SceneOverlay,
  SceneOverlayOp,
} from '@las-flores/api-contracts';
export type { ComposeSceneOptions, ComposeSceneResult } from './scene/compose-scene.js';
export { composeScene, sortOverlays } from './scene/compose-scene.js';
// Runtime selection (SC-312) — same engine runtime uses, re-exported for compile-side checks.
export type { PlayerScene } from '@las-flores/api-contracts';
export { resolveSceneForPlayer, selectActiveOverlays } from '@las-flores/api-contracts';

// Weather resolution (SC-305)
export type { ResolvedWeather, WeatherInput, WeatherSource } from './scene/resolve-weather.js';
export { resolveWeather } from './scene/resolve-weather.js';

// Composition golden fixtures (SC-313) — data in api/planning/test-fixtures/scene-composition
export type {
  GoldenCase,
  GoldenCaseExpectation,
  GoldenFixture,
  GoldenPlayerExpectation,
} from './scene/golden-fixtures.js';
export { InvalidGoldenFixtureError, parseGoldenFixture } from './scene/golden-fixtures.js';

// Overlay conflict detection (SC-304)
export type { ConflictReport, SceneConflict, SceneConflictCode } from './scene/conflicts.js';
export {
  conflictsToIssues,
  detectConflicts,
  formatConflictReport,
  stringifyConflictReport,
} from './scene/conflicts.js';

// Personality pools + character line resolution (SC-306/308)
export type {
  CharacterPoolRepository,
  LinkStatus,
  ListPersonalityPoolsOptions,
  PersonalityPoolRecord,
  PersonalityPoolRepository,
} from './canon/personality-pool-repository.js';
export {
  InMemoryCharacterPoolRepository,
  InMemoryPersonalityPoolRepository,
  PersonalityPoolRetiredError,
  PoolLinkError,
  normalisePersonalityPool,
  personalityPoolContentHash,
} from './canon/personality-pool-repository.js';
export type { ResolveCharacterLineInput } from './dialogue/resolve-character-line.js';
export { resolveCharacterLine, resolveSlotLine } from './dialogue/resolve-character-line.js';

// Compile (SC-402/403/405) — scenes + overlays -> content-addressed artifacts + report
export type { ContentLookup, LocationInfo } from './compile/content-lookup.js';
export { InMemoryContentLookup } from './compile/content-lookup.js';
export type { ArtifactRecord, ArtifactStore, PutManyResult } from './compile/artifact-store.js';
export {
  ArtifactIntegrityError,
  InMemoryArtifactStore,
  buildArtifactRecord,
  buildSceneArtifactRecord,
  verifyArtifactRecord,
} from './compile/artifact-store.js';
export type { CompileDeps, CompileScenesOptions, CompileScenesResult } from './compile/compile-scenes.js';
export { compileScenes } from './compile/compile-scenes.js';
export type { CompilePoolsDeps, CompilePoolsOptions, CompilePoolsResult } from './compile/compile-pools.js';
export { POOL_COMPILE_ISSUE_CODES, compilePools } from './compile/compile-pools.js';
export type { CompileReport, SceneArtifactPayload } from '@las-flores/api-contracts';
export {
  InvalidManifestError,
  RevisionArtifactMissingError,
  manifestHash,
  normaliseManifest,
} from '@las-flores/api-contracts';

// Revisions + publish (SC-404/406)
export type { PublishInput, PublishResult, RevisionRepository } from './compile/revision-repository.js';
export { InMemoryRevisionRepository, manifestFromRecords } from './compile/revision-repository.js';

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
