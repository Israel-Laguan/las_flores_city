// api/contracts/src/artifact/index.ts
// Re-exports for artifact module.

export type {
  ArtifactId,
  ManifestVersion,
  ContentHash,
  ArtifactType,
  ISODateString,
} from './artifact.js';
export {
  Artifact,
  ArtifactManifest,
  ArtifactValidation,
  CONTENT_HASH_PATTERN,
  validateContentHash,
  createArtifactId,
  isArtifact,
  isArtifactManifest,
} from './artifact.js';
