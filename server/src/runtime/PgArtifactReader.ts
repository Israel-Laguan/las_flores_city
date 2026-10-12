// SC-M3 T2 (SC-502): Postgres-backed ArtifactReader over publish.artifacts (migration 104).
//
// READ ONLY: one SELECT. Written so it needs nothing beyond the `runtime` role's SELECT grant on
// `publish` (proven by running the shared contract suite through a client logged in as `runtime`).
// Defaults to the existing oltpPool via queryOLTP, no new pool (AGENTS hard constraint); the query
// function is injectable so the same adapter can run on any connection.

import { queryOLTP } from '@las-flores/infra';
import { isArtifactId, type Artifact, type ArtifactId, type ArtifactReader, type StoredArtifact } from '@las-flores/api-contracts';
import type { QueryFn } from '../planning/PgArtifactStore.js';

interface ArtifactRow {
  artifact_id: string;
  artifact_type: Artifact['artifact_type'];
  name: string;
  manifest_version: 1;
  payload: string;
  size_bytes: number;
  dependencies: string[];
  created_at: Date;
}

export class PgArtifactReader implements ArtifactReader {
  constructor(private readonly query: QueryFn = queryOLTP) {}

  async get(id: ArtifactId): Promise<StoredArtifact | undefined> {
    if (!isArtifactId(id)) return undefined;
    const { rows } = await this.query(
      `SELECT artifact_id, artifact_type, name, manifest_version, payload, size_bytes, dependencies, created_at
         FROM publish.artifacts WHERE artifact_id = $1`,
      [id],
    );
    const row = rows[0] as ArtifactRow | undefined;
    if (row === undefined) return undefined;
    return {
      artifact: {
        artifact_id: row.artifact_id,
        artifact_type: row.artifact_type,
        content_hash: row.artifact_id,
        manifest_version: row.manifest_version,
        name: row.name,
        created_at: row.created_at.toISOString(),
        size_bytes: row.size_bytes,
        dependencies: [...row.dependencies],
      },
      payload: row.payload,
    };
  }
}
