// api/runtime/src/resolve/lookup.ts
// SC-M3 T2 (SC-502): revision-scoped artifact lookup, the runtime's only way to get content.
//
// Everything is addressed by (revisionId, artifact_type, name). The lookup takes the revision as an
// ARGUMENT and its manifest source is typed to `getRevision` only: it cannot read the
// active-revision pointer, so "whatever is active now" can never leak into a pinned session
// (architecture.md §4, R12). Revisions and artifacts are immutable, so nothing here needs
// invalidation.
//
// Failures are typed and distinct and never fall back to another revision (R10):
//   revision_missing          the revision id names no revision
//   artifact_not_in_revision  the manifest has no (type, name) entry
//   artifact_missing          the manifest names an artifact id nobody stored
//   artifact_corrupt          bytes do not hash to the id, type disagrees, or bytes do not parse
//
// DB-free: persistence is injected through ports (`RevisionManifestReader`, `ArtifactReader`).

import {
  InvalidPoolArtifactError,
  InvalidSceneArtifactError,
  characterPoolsArtifactFromBytes,
  personalityPoolArtifactFromBytes,
  sceneArtifactPayloadFromJSON,
  sha256Hex,
  type ArtifactReader,
  type ArtifactType,
  type CharacterPoolsArtifactPayload,
  type PersonalityPool,
  type RevisionReader,
  type RevisionId,
  type SceneArtifactPayload,
  type StoredArtifact,
} from '@las-flores/api-contracts';

/** The manifest side of lookup: deliberately WITHOUT `getActive`. */
export type RevisionManifestReader = Pick<RevisionReader, 'getRevision'>;

export interface LookupSources {
  revisions: RevisionManifestReader;
  artifacts: ArtifactReader;
}

export type LookupErrorCode = 'revision_missing' | 'artifact_not_in_revision' | 'artifact_missing' | 'artifact_corrupt';

export class ArtifactLookupError extends Error {
  constructor(
    readonly code: LookupErrorCode,
    readonly revisionId: RevisionId,
    message: string,
    readonly artifactType?: ArtifactType,
    readonly artifactName?: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'ArtifactLookupError';
  }
}

export class RevisionScopedLookup {
  constructor(private readonly sources: LookupSources) {}

  /** The artifact `revisionId` names for (type, name), verified against its content id. */
  async get(revisionId: RevisionId, type: ArtifactType, name: string): Promise<StoredArtifact> {
    const found = await this.tryGet(revisionId, type, name);
    if (found === undefined) {
      throw new ArtifactLookupError('artifact_not_in_revision', revisionId, `revision ${revisionId} has no ${type} '${name}'`, type, name);
    }
    return found;
  }

  /**
   * Like `get`, but a name absent from the manifest is `undefined` instead of an error. Every other
   * failure (unknown revision, missing or corrupt artifact) still throws.
   */
  async tryGet(revisionId: RevisionId, type: ArtifactType, name: string): Promise<StoredArtifact | undefined> {
    const revision = await this.sources.revisions.getRevision(revisionId);
    if (revision === undefined) throw new ArtifactLookupError('revision_missing', revisionId, `no revision ${revisionId}`, type, name);
    const entry = revision.manifest.entries.find((e) => e.artifact_type === type && e.name === name);
    if (entry === undefined) return undefined;

    const record = await this.sources.artifacts.get(entry.artifact_id);
    if (record === undefined) {
      throw new ArtifactLookupError('artifact_missing', revisionId, `${type} '${name}' names artifact ${entry.artifact_id}, which is not stored`, type, name);
    }
    if (record.artifact.artifact_id !== entry.artifact_id || sha256Hex(record.payload) !== entry.artifact_id) {
      throw new ArtifactLookupError('artifact_corrupt', revisionId, `${type} '${name}': stored bytes do not hash to ${entry.artifact_id}`, type, name);
    }
    if (record.artifact.artifact_type !== type) {
      throw new ArtifactLookupError('artifact_corrupt', revisionId, `${type} '${name}' resolves to a stored ${record.artifact.artifact_type}`, type, name);
    }
    return record;
  }

  async getScene(revisionId: RevisionId, slug: string): Promise<SceneArtifactPayload> {
    const rec = await this.get(revisionId, 'scene', slug);
    return this.parse(revisionId, 'scene', slug, () => sceneArtifactPayloadFromJSON(JSON.parse(rec.payload)), InvalidSceneArtifactError);
  }

  async getPool(revisionId: RevisionId, slug: string): Promise<PersonalityPool> {
    const rec = await this.get(revisionId, 'personality_pool', slug);
    return this.parse(revisionId, 'personality_pool', slug, () => personalityPoolArtifactFromBytes(rec.payload), InvalidPoolArtifactError);
  }

  /** The pools a character uses in this revision; `undefined` = no link artifact = no pools. */
  async getCharacterPools(revisionId: RevisionId, characterSlug: string): Promise<CharacterPoolsArtifactPayload | undefined> {
    const rec = await this.tryGet(revisionId, 'character_pools', characterSlug);
    if (rec === undefined) return undefined;
    return this.parse(revisionId, 'character_pools', characterSlug, () => characterPoolsArtifactFromBytes(rec.payload), InvalidPoolArtifactError);
  }

  private parse<T>(revisionId: RevisionId, type: ArtifactType, name: string, fn: () => T, invalid: new (...args: never[]) => Error): T {
    try {
      return fn();
    } catch (err) {
      if (err instanceof invalid || err instanceof SyntaxError) {
        throw new ArtifactLookupError('artifact_corrupt', revisionId, `${type} '${name}' does not parse: ${(err as Error).message}`, type, name);
      }
      throw err;
    }
  }
}
