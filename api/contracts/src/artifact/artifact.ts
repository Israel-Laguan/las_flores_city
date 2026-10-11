// api/contracts/src/artifact/artifact.ts
// SC-M1: Artifact and manifest schemas for content-addressed scene/dialogue bundles.
// These are the shared types for compiled content artifacts that can be
// referenced by revision pointers.

/**
 * Unique identifier for an artifact, derived from its content hash.
 * Format: lowercase hex SHA-256 of the artifact's canonical payload bytes (D3).
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
 * New artifacts use lowercase hex (D3); `validateContentHash` still reads base64url.
 */
export type ContentHash = string;

/**
 * Type of content artifact.
 * - 'scene': A compiled scene (SC-402): the `ResolvedScene` base + conditional layers
 *   plus the district-weather snapshot. Dialogue is referenced by slug, not embedded.
 * - 'dialogue': A standalone dialogue tree
 * - 'mission': A mission definition with its associated scenes
 * - 'character': Character definition and all associated assets
 * - 'overlay': Dialogue overlay with modifications and additions
 * - 'personality_pool': a compiled personality pool (SC-M3); name = pool slug
 * - 'character_pools': the active pools a character uses (SC-M3); name = character slug
 */
export type ArtifactType =
  | 'scene'
  | 'dialogue'
  | 'mission'
  | 'character'
  | 'overlay'
  | 'personality_pool'
  | 'character_pools';

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
   * Always equal to `content_hash`.
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
// 32 bytes base64url-encoded is exactly 43 unpadded characters (the 44th, when
// present, is a single `=` pad). The previous `{43,44}` range therefore admitted
// 44 unpadded url-safe characters — a string that cannot decode to a SHA-256
// digest — while rejecting the padded form Node's Buffer actually emits.
export const CONTENT_HASH_PATTERN = /^[a-fA-F0-9]{64}$|^[A-Za-z0-9_-]{43}=?$/;

/**
 * Validates a content hash string.
 */
export function validateContentHash(hash: string): boolean {
  return CONTENT_HASH_PATTERN.test(hash);
}

/** Canonical artifact identity: lowercase hex SHA-256 (64 chars). */
export const ARTIFACT_ID_PATTERN = /^[0-9a-f]{64}$/;

/** True when `value` is a canonical (lowercase hex SHA-256) artifact id. */
export function isArtifactId(value: unknown): value is ArtifactId {
  return typeof value === 'string' && ARTIFACT_ID_PATTERN.test(value);
}

/**
 * Creates an artifact ID from a content hash (D3): the id IS the content hash, as
 * lowercase hex SHA-256 — the same form `sceneDefContentHash` and
 * `ContentPublishService` already use, so one artifact has exactly one identity.
 * Uppercase hex is lowercased; anything that is not 64 hex characters (including the
 * base64url form `validateContentHash` still accepts for reading) throws.
 *
 * @param contentHash - Hex SHA-256 of the artifact's canonical bytes
 * @returns The canonical artifact id
 * @throws TypeError when `contentHash` is not 64 hex characters
 */
export function createArtifactId(contentHash: ContentHash): ArtifactId {
  if (typeof contentHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(contentHash)) {
    throw new TypeError('artifact id must be a 64-character hex SHA-256 content hash');
  }
  return contentHash.toLowerCase();
}

/**
 * The complete set of valid ArtifactType values.
 * Exported so guards and validation share one source of truth.
 */
export const ARTIFACT_TYPES: ReadonlySet<string> = new Set<ArtifactType>([
  'scene',
  'dialogue',
  'mission',
  'character',
  'overlay',
  'personality_pool',
  'character_pools',
]);

/**
 * Type guard for Artifact.
 *
 * Checks every field the Artifact interface declares, including the ones whose
 * absence previously slipped through: artifact_type must be a known
 * ArtifactType, manifest_version must be exactly 1, and dependencies must be
 * an array of strings (a missing/!Array.dependencies would make downstream
 * `.map()` throw).
 */
export function isArtifact(value: unknown): value is Artifact {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return obj.manifest_version === 1 && isArtifactBody(obj);
}

/**
 * Shared field checks for an artifact payload, excluding manifest_version.
 * ArtifactManifest.artifact is an Omit<Artifact, 'manifest_version'>, so the
 * manifest guard cannot delegate to isArtifact directly.
 */
function isArtifactBody(obj: Record<string, unknown>): boolean {
  return (
    isArtifactId(obj.artifact_id) &&
    typeof obj.artifact_type === 'string' &&
    ARTIFACT_TYPES.has(obj.artifact_type) &&
    // D3: identity is the content hash, so the two must agree.
    obj.content_hash === obj.artifact_id &&
    typeof obj.name === 'string' &&
    typeof obj.created_at === 'string' &&
    typeof obj.size_bytes === 'number' &&
    Array.isArray(obj.dependencies) &&
    obj.dependencies.every((dep): boolean => typeof dep === 'string') &&
    // `description?: string` — a present-but-non-string value would be narrowed
    // to `string` by the predicate and then blow up a `.trim()`/`startsWith`
    // caller at runtime.
    (obj.description === undefined || typeof obj.description === 'string')
  );
}

/**
 * Validates the optional `integrity` block. `{}` (or any object missing the
 * algorithm/hash pair) must not be narrowed to the declared shape: a caller that
 * trusts the predicate would read `integrity.hash` as a hash and verify nothing.
 */
function isIntegrityBlock(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    (obj.algorithm === 'sha256' || obj.algorithm === 'sha512') &&
    typeof obj.hash === 'string'
  );
}

/**
 * Type guard for ArtifactManifest.
 *
 * manifest_version must be exactly 1 and artifact must itself be a well-formed
 * artifact body — accepting any non-null object here let malformed artifacts
 * through into code that trusts the manifest. The optional `integrity` block is
 * validated too, so `{}` cannot be narrowed to `{algorithm, hash}`.
 */
export function isArtifactManifest(value: unknown): value is ArtifactManifest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.manifest_version !== 1 || typeof obj.content_url !== 'string') {
    return false;
  }
  if (!isIntegrityBlock(obj.integrity)) {
    return false;
  }
  if (typeof obj.artifact !== 'object' || obj.artifact === null) {
    return false;
  }
  return isArtifactBody(obj.artifact as Record<string, unknown>);
}
