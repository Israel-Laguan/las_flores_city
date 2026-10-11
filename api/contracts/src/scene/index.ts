// api/contracts/src/scene/index.ts
// Re-exports for scene module.

export type { SceneDef, SceneDefInput, SceneTime } from './scene-def.js';
export {
  SCENE_SCHEMA_VERSION,
  SCENE_TIMES,
  InvalidSceneDefError,
  createSceneDef,
  isSceneTime,
  sceneDefToJSON,
  sceneDefFromJSON,
  stringifySceneDef,
} from './scene-def.js';
export { isValidSlug, isUuid } from './slug.js';

export type { RoleSlot, SlotPosition } from './role-slot.js';
export { SLOT_POSITIONS, isSlotPosition, findDuplicateSlotIds } from './role-slot.js';

export { SCENE_ISSUE_CODES, validateScene } from './validate.js';
export type { ValidateSceneOptions } from './validate.js';
export type { SceneIssueCode, SceneIssue, SceneValidationResult } from './validate.js';

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
} from './scene-overlay.js';
export {
  InvalidSceneOverlayError,
  createSceneOverlay,
  sceneOverlayOpToJSON,
  sceneOverlayToJSON,
  sceneOverlayFromJSON,
  stringifySceneOverlay,
} from './scene-overlay.js';
export type { SceneOverlayOpName, SceneOverlayOpKind } from './overlay-vocab.js';
export {
  SCENE_OVERLAY_SCHEMA_VERSION,
  SCENE_OVERLAY_OPS,
  SCENE_OVERLAY_OP_NAMES,
  isSceneOverlayOpName,
} from './overlay-vocab.js';
export { SCENE_OVERLAY_ISSUE_CODES, validateSceneOverlay } from './overlay-validate.js';

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
} from './compose.js';
export { SCENE_COMPOSE_ISSUE_CODES, applyOverlayOps, toComposedScene } from './compose.js';

export type {
  ValidateSceneOverlayOptions,
  SceneOverlayIssueCode,
  SceneOverlayIssue,
  SceneOverlayValidationResult,
} from './overlay-validate.js';

export type { PlayerScene } from './select.js';
export { resolveSceneForPlayer, selectActiveOverlays } from './select.js';

export type { LineWhen, SlotLine, LineProblem } from './line.js';
export {
  LINE_WHEN_KEYS,
  SLOT_LINE_JSON_KEYS,
  checkLineWhen,
  checkSlotLine,
  lineWhenSpecificity,
  lineWhenToJSON,
  slotLineKey,
  slotLineToJSON,
} from './line.js';
