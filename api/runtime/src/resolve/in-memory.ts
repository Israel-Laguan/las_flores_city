// api/runtime/src/resolve/in-memory.ts
// SC-M3 T2: in-memory implementations of the runtime read ports, for unit tests and for the
// shared contract suite. They hold immutable data and mirror the Postgres adapters' behaviour.

import {
  normaliseManifest,
  type ArtifactId,
  type ArtifactReader,
  type ManifestEntry,
  type Revision,
  type RevisionId,
  type StoredArtifact,
} from '@las-flores/api-contracts';
import type { RevisionManifestReader } from './lookup.js';

export class InMemoryArtifactReader implements ArtifactReader {
  private rows = new Map<ArtifactId, StoredArtifact>();

  /** Seeds an artifact (test setup; the real store is written only by planning). */
  add(record: StoredArtifact): void {
    this.rows.set(record.artifact.artifact_id, { artifact: { ...record.artifact, dependencies: [...record.artifact.dependencies] }, payload: record.payload });
  }

  async get(id: ArtifactId): Promise<StoredArtifact | undefined> {
    const row = this.rows.get(id);
    return row === undefined ? undefined : { artifact: { ...row.artifact, dependencies: [...row.artifact.dependencies] }, payload: row.payload };
  }
}

export class InMemoryRevisionManifestReader implements RevisionManifestReader {
  private revisions = new Map<RevisionId, Revision>();

  /** Seeds a revision whose manifest names exactly these artifacts. */
  add(id: RevisionId, artifacts: ReadonlyArray<StoredArtifact>): void {
    this.addEntries(
      id,
      artifacts.map((a) => ({ artifact_type: a.artifact.artifact_type, name: a.artifact.name, artifact_id: a.artifact.artifact_id })),
    );
  }

  /** Seeds a revision from explicit manifest entries (lets a test build an inconsistent manifest). */
  addEntries(id: RevisionId, entries: ReadonlyArray<ManifestEntry>): void {
    this.revisions.set(id, {
      revision_id: id,
      parent_revision_id: null,
      manifest: normaliseManifest(entries),
      manifest_hash: '0'.repeat(64),
      note: null,
      created_at: '2026-10-10T00:00:00.000Z',
    });
  }

  async getRevision(id: RevisionId): Promise<Revision | undefined> {
    return this.revisions.get(id);
  }
}
