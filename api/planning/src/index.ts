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
  sceneDefContentHash,
} from './canon/scene-def-repository.js';

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

// Weather resolution (SC-305)
export type { ResolvedWeather, WeatherInput, WeatherSource } from './scene/resolve-weather.js';
export { resolveWeather } from './scene/resolve-weather.js';

// Overlay conflict detection (SC-304)
export type { ConflictReport, SceneConflict, SceneConflictCode } from './scene/conflicts.js';
export {
  conflictsToIssues,
  detectConflicts,
  formatConflictReport,
  stringifyConflictReport,
} from './scene/conflicts.js';

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
