// api/contracts/src/artifact/index.ts
// Re-exports for artifact module.

export type {
  Artifact,
  ArtifactId,
  ArtifactManifest,
  ArtifactValidation,
  ContentHash,
  ArtifactType,
  ISODateString,
  ManifestVersion,
} from './artifact.js';
export {
  ARTIFACT_ID_PATTERN,
  isArtifactId,
  CONTENT_HASH_PATTERN,
  ARTIFACT_TYPES,
  validateContentHash,
  createArtifactId,
  isArtifact,
  isArtifactManifest,
} from './artifact.js';

export type { SceneArtifactPayload } from './scene-artifact.js';
export {
  SCENE_ARTIFACT_SCHEMA_VERSION,
  InvalidSceneArtifactError,
  sceneArtifactPayloadFromJSON,
  sceneArtifactPayloadToJSON,
  sceneArtifactContentHash,
  sha256Hex,
  stringifySceneArtifact,
} from './scene-artifact.js';

export type { ArtifactReader, StoredArtifact } from './reader.js';

export type { CharacterPoolsArtifactPayload } from './pool-artifact.js';
export {
  CHARACTER_POOLS_ARTIFACT_SCHEMA_VERSION,
  InvalidPoolArtifactError,
  characterPoolsArtifactContentHash,
  characterPoolsArtifactFromBytes,
  characterPoolsArtifactToJSON,
  personalityPoolArtifactContentHash,
  personalityPoolArtifactFromBytes,
  stringifyCharacterPoolsArtifact,
  stringifyPersonalityPoolArtifact,
} from './pool-artifact.js';

export type {
  CompileIssue,
  CompileIssueCode,
  CompileReport,
  CompileSceneEntry,
  CompileSceneStatus,
} from './compile-report.js';
export { COMPILE_ISSUE_CODES, COMPILE_REPORT_VERSION, buildCompileReport, stringifyCompileReport } from './compile-report.js';
