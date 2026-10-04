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
  CONTENT_HASH_PATTERN,
  ARTIFACT_TYPES,
  validateContentHash,
  createArtifactId,
  isArtifact,
  isArtifactManifest,
} from './artifact.js';
