// api/planning/src/compile/artifact-store.ts
// SC-402/403/406: where compiled artifacts are written. A port (D2): the Postgres adapter
// (server/src/planning/PgArtifactStore.ts, schema `publish`) is the M2 backing store, and a
// MinIO/CDN adapter can replace it later without touching compile (architecture.md §5).
//
// Content addressing is enforced AT THE PORT, not trusted: every record must satisfy
// `sha256(payload) === artifact_id === content_hash` and `size_bytes === byte length`, or
// the write is rejected. Artifacts are immutable, so a put of an id that already exists is
// `unchanged`, never an overwrite (SC-403).

import { createHash } from 'node:crypto';
import {
  createArtifactId,
  isArtifact,
  stringifySceneArtifact,
  type Artifact,
  type ArtifactId,
  type SceneArtifactPayload,
} from '@las-flores/api-contracts';

/** An artifact's metadata plus its canonical payload bytes (UTF-8 JSON text). */
export interface ArtifactRecord {
  artifact: Artifact;
  payload: string;
}

export interface PutManyResult {
  /** Ids written by this call, sorted. */
  created: ArtifactId[];
  /** Ids that already existed (left untouched), sorted. Duplicates in the input count once. */
  unchanged: ArtifactId[];
}

export class ArtifactIntegrityError extends Error {
  constructor(message: string) {
    super(`Artifact integrity check failed: ${message}`);
    this.name = 'ArtifactIntegrityError';
  }
}

/** Throws ArtifactIntegrityError unless the record is a well-formed, self-consistent artifact. */
export function verifyArtifactRecord(record: ArtifactRecord): void {
  const { artifact, payload } = record;
  if (!isArtifact(artifact)) throw new ArtifactIntegrityError('metadata is not a valid artifact (id must be lowercase hex sha256 and equal content_hash)');
  const actual = createHash('sha256').update(payload).digest('hex');
  if (actual !== artifact.content_hash) {
    throw new ArtifactIntegrityError(`payload hashes to ${actual}, not ${artifact.content_hash}`);
  }
  const size = Buffer.byteLength(payload, 'utf8');
  if (size !== artifact.size_bytes) throw new ArtifactIntegrityError(`size_bytes is ${artifact.size_bytes}, payload is ${size} bytes`);
  try {
    JSON.parse(payload);
  } catch {
    throw new ArtifactIntegrityError('payload is not valid JSON');
  }
}

/**
 * Persistence port for compiled artifacts. Planning writes; runtime only ever reads
 * (through the `publish` schema's SELECT-only grant — see migration 104).
 */
export interface ArtifactStore {
  /**
   * Insert every record not already present, in ONE round trip / transaction (SC-406): all
   * or nothing. Every record is verified first; any integrity failure rejects the whole call
   * and writes nothing.
   */
  putMany(records: ReadonlyArray<ArtifactRecord>): Promise<PutManyResult>;

  /** The stored artifact, or undefined. The payload bytes are returned exactly as written. */
  get(id: ArtifactId): Promise<ArtifactRecord | undefined>;

  /** The subset of `ids` that exist. */
  has(ids: readonly ArtifactId[]): Promise<ReadonlySet<ArtifactId>>;
}

/** Builds the verified record for already-canonical bytes of any artifact kind. `createdAt` is metadata, not content. */
export function buildArtifactRecord(artifactType: Artifact['artifact_type'], name: string, bytes: string, createdAt: string): ArtifactRecord {
  const id = createArtifactId(createHash('sha256').update(bytes).digest('hex'));
  return {
    artifact: {
      artifact_id: id,
      artifact_type: artifactType,
      content_hash: id,
      manifest_version: 1,
      name,
      created_at: createdAt,
      size_bytes: Buffer.byteLength(bytes, 'utf8'),
      dependencies: [],
    },
    payload: bytes,
  };
}

/** Builds the verified record for a scene artifact payload. `createdAt` is metadata, not content. */
export function buildSceneArtifactRecord(payload: SceneArtifactPayload, createdAt: string): ArtifactRecord {
  const bytes = stringifySceneArtifact(payload);
  const id = createArtifactId(createHash('sha256').update(bytes).digest('hex'));
  return {
    artifact: {
      artifact_id: id,
      artifact_type: 'scene',
      content_hash: id,
      manifest_version: 1,
      name: payload.scene.scene_slug,
      created_at: createdAt,
      size_bytes: Buffer.byteLength(bytes, 'utf8'),
      dependencies: [],
    },
    payload: bytes,
  };
}

const copy = (r: ArtifactRecord): ArtifactRecord => ({ artifact: { ...r.artifact, dependencies: [...r.artifact.dependencies] }, payload: r.payload });

/** In-memory implementation. Must behave like the Postgres adapter: `artifactStoreContract` runs against both. */
export class InMemoryArtifactStore implements ArtifactStore {
  private rows = new Map<ArtifactId, ArtifactRecord>();

  async putMany(records: ReadonlyArray<ArtifactRecord>): Promise<PutManyResult> {
    for (const r of records) verifyArtifactRecord(r);
    const created = new Set<ArtifactId>();
    const unchanged = new Set<ArtifactId>();
    for (const r of records) {
      const id = r.artifact.artifact_id;
      if (this.rows.has(id) || created.has(id)) {
        unchanged.add(id);
      } else {
        this.rows.set(id, copy(r));
        created.add(id);
      }
    }
    // A duplicate inside one call that was also new counts as created only.
    for (const id of created) unchanged.delete(id);
    return { created: [...created].sort(), unchanged: [...unchanged].sort() };
  }

  async get(id: ArtifactId): Promise<ArtifactRecord | undefined> {
    const r = this.rows.get(id);
    return r ? copy(r) : undefined;
  }

  async has(ids: readonly ArtifactId[]): Promise<ReadonlySet<ArtifactId>> {
    return new Set(ids.filter((id) => this.rows.has(id)));
  }

  /** Number of stored artifacts (tests). */
  get size(): number {
    return this.rows.size;
  }
}
