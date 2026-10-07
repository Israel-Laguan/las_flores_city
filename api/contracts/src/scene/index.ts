// api/contracts/src/scene/index.ts
// Re-exports for scene module.

export type { SceneDef, SceneTime } from './scene-def.js';
export {
  SCENE_SCHEMA_VERSION,
  SCENE_TIMES,
  InvalidSceneDefError,
  isSceneTime,
  sceneDefToJSON,
  sceneDefFromJSON,
  stringifySceneDef,
} from './scene-def.js';
export { isValidSlug, isUuid } from './slug.js';

export type { RoleSlot, SlotPosition } from './role-slot.js';
export { SLOT_POSITIONS, isSlotPosition, findDuplicateSlotIds } from './role-slot.js';

export { SCENE_ISSUE_CODES, validateScene } from './validate.js';
export type { SceneIssueCode, SceneIssue, SceneValidationResult } from './validate.js';
