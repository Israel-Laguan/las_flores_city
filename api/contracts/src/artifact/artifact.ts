// api/contracts/src/artifact/artifact.ts
// SC-M1: Artifact and manifest schemas for content-addressed scene/dialogue bundles.
// These are the shared types for compiled content artifacts that can be
// referenced by revision pointers.

/**
 * Unique identifier for an artifact, derived from its content hash.
 * Format: base64url-encoded SHA-256 hash of the artifact's JSON representation.
 * Used as a stable reference across revisions.
 */
export type ArtifactId = string;

/**
 * Version of the manifest schema.
 * Incremented when the manifest structure changes in a breaking way.
 * Current version: 1
 */
export type ManifestVersion = 1;

/**
 * Content hash of the artifact.
 * Used for integrity verification and as the artifact's identity.
 * Must be a valid SHA-256 hash in hex or base64url encoding.
 */
export type ContentHash = string;

/**
 * Type of content artifact.
 * - 'scene': A compiled scene with all its dialogue, choices, and branching
 * - 'dialogue': A standalone dialogue tree
 * - 'mission': A mission definition with its associated scenes
 * - 'character': Character definition and all associated assets
 * - 'overlay': Dialogue overlay with modifications and additions
 */
export type ArtifactType = 'scene' | 'dialogue' | 'mission' | 'character' | 'overlay';

/**
 * Timestamp in ISO 8601 format (UTC).
 */
export type ISODateString = string;

/**
 * An artifact represents a compiled, content-addressed bundle of game content.
 * Once created, artifacts are immutable - any change produces a new artifact
 * with a new content_hash and artifact_id.
 */
export interface Artifact {
  /**
   * Unique identifier, derived from content_hash.
   * Typically: base64url(sha256(json_bytes))
   */
  artifact_id: ArtifactId;

  /**
   * The type of content this artifact represents.
   */
  artifact_type: ArtifactType;

  /**
   * Hash of the artifact's content.
   * Used for both identity and integrity verification.
   */
  content_hash: ContentHash;

  /**
   * Version of the manifest schema used for this artifact.
   */
  manifest_version: ManifestVersion;

  /**
   * Human-readable name/title of the artifact.
   * e.g., "great_lithium_leak_scene_01"
   */
  name: string;

  /**
   * Optional description of what this artifact contains.
   */
  description?: string;

  /**
   * Timestamp when this artifact was created/compiled.
   */
  created_at: ISODateString;

  /**
   * Size of the artifact content in bytes.
   */
  size_bytes: number;

  /**
   * References to other artifacts that this artifact depends on.
   * e.g., a scene might depend on character artifacts.
   */
  dependencies: ArtifactId[];
}

/**
 * A manifest is the metadata wrapper for an artifact.
 * It contains the artifact metadata plus a reference to where the
 * actual content can be found.
 */
export interface ArtifactManifest {
  /**
   * Version of the manifest schema.
   */
  manifest_version: ManifestVersion;

  /**
   * The artifact this manifest describes.
   */
  artifact: Omit<Artifact, 'manifest_version'>;

  /**
   * Content URL or path where the artifact content can be retrieved.
   * For local dev: file:// path
   * For production: http:// or s3:// URL
   */
  content_url: string;

  /**
   * Optional integrity check for the content at content_url.
   * Should match artifact.content_hash.
   */
  integrity?: {
    algorithm: 'sha256' | 'sha512';
    hash: ContentHash;
  };
}

/**
 * Validation result for an artifact.
 */
export interface ArtifactValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that a string looks like a valid content hash.
 * Accepts both hex-encoded and base64url-encoded SHA-256 hashes.
 */
export const CONTENT_HASH_PATTERN = /^[a-fA-F0-9]{64}$|^[A-Za-z0-9-_]{43,44}$/;

/**
 * Validates a content hash string.
 */
export function validateContentHash(hash: string): boolean {
  return CONTENT_HASH_PATTERN.test(hash);
}

/**
 * Creates an artifact ID from a content hash.
 * Uses base64url encoding of the SHA-256 hash.
 * This is a placeholder - actual implementation would use crypto.
 */
export function createArtifactId(contentHash: ContentHash): ArtifactId {
  // For now, just return the hash as-is (assuming it's already base64url)
  // In practice, this might involve encoding/decoding
  return contentHash;
}

/**
 * Type guard for Artifact.
 */
export function isArtifact(value: unknown): value is Artifact {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.artifact_id === 'string' &&
    typeof obj.artifact_type === 'string' &&
    typeof obj.content_hash === 'string' &&
    typeof obj.manifest_version === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.created_at === 'string' &&
    typeof obj.size_bytes === 'number'
  );
}

/**
 * Type guard for ArtifactManifest.
 */
export function isArtifactManifest(value: unknown): value is ArtifactManifest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.manifest_version === 'number' &&
    typeof obj.artifact === 'object' &&
    obj.artifact !== null &&
    typeof obj.content_url === 'string'
  );
}
