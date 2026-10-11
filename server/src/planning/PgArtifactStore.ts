// SC-402/406: Postgres-backed ArtifactStore over publish.artifacts (migration 104).
// Uses the existing oltpPool via queryOLTP — no new pools (AGENTS hard constraint).
//
// putMany is ONE statement (multi-row INSERT ... ON CONFLICT DO NOTHING RETURNING): no N+1
// writes, and a single statement is atomic, so a call either writes every new artifact or
// none. Records are verified in code first (same rules the table CHECKs enforce), so a bad
// record is rejected before any I/O.
//
// Runtime-side reads of this table go through the `runtime` role's SELECT grant, never
// through this planning-side adapter.

import { queryOLTP } from '@las-flores/infra';
import { isArtifactId, type Artifact, type ArtifactId } from '@las-flores/api-contracts';
import {
  verifyArtifactRecord,
  type ArtifactRecord,
  type ArtifactStore,
  type PutManyResult,
} from '@las-flores/api-planning';

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

const COLUMNS = 'artifact_id, artifact_type, name, manifest_version, payload, size_bytes, dependencies, created_at';

function toRecord(row: ArtifactRow): ArtifactRecord {
  const record: ArtifactRecord = {
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
  // Defence in depth: the table CHECKs make a mismatch impossible, but a read that hands
  // out unverified bytes would defeat content addressing, so verify again.
  verifyArtifactRecord(record);
  return record;
}

/** Postgres array literal for ids that are already validated lowercase hex (no escaping needed). */
const arrayLiteral = (ids: readonly string[]): string => {
  for (const id of ids) if (!isArtifactId(id)) throw new TypeError(`dependency '${id}' is not an artifact id`);
  return `{${ids.join(',')}}`;
};

/** Anything that runs a parameterised query: `queryOLTP`, or a transaction's client. */
export type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>;

/**
 * Verified, deduplicated, single-statement insert (see the class doc). Exported so a caller
 * holding a transaction (the atomic publish) can run the SAME statement inside it.
 */
export async function insertArtifacts(query: QueryFn, records: ReadonlyArray<ArtifactRecord>): Promise<PutManyResult> {
  for (const r of records) verifyArtifactRecord(r);
  const byId = new Map<ArtifactId, ArtifactRecord>();
  for (const r of records) if (!byId.has(r.artifact.artifact_id)) byId.set(r.artifact.artifact_id, r);
  if (byId.size === 0) return { created: [], unchanged: [] };

  const rows = [...byId.values()];
  const { rows: inserted } = await query(
    `INSERT INTO publish.artifacts (${COLUMNS})
     SELECT t.artifact_id, t.artifact_type, t.name, t.manifest_version, t.payload, t.size_bytes, t.dependencies::text[], t.created_at
       FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::text[], $6::int[], $7::text[], $8::timestamptz[])
         AS t(artifact_id, artifact_type, name, manifest_version, payload, size_bytes, dependencies, created_at)
     ON CONFLICT (artifact_id) DO NOTHING
     RETURNING artifact_id`,
    [
      rows.map((r) => r.artifact.artifact_id),
      rows.map((r) => r.artifact.artifact_type),
      rows.map((r) => r.artifact.name),
      rows.map((r) => r.artifact.manifest_version),
      rows.map((r) => r.payload),
      rows.map((r) => r.artifact.size_bytes),
      // text[] of array literals: unnest() would flatten a text[][] into scalars.
      rows.map((r) => arrayLiteral(r.artifact.dependencies)),
      rows.map((r) => r.artifact.created_at),
    ],
  );
  const created = new Set<string>(inserted.map((r: { artifact_id: string }) => r.artifact_id));
  return {
    created: [...created].sort(),
    unchanged: rows.map((r) => r.artifact.artifact_id).filter((id) => !created.has(id)).sort(),
  };
}

export class PgArtifactStore implements ArtifactStore {
  /** `query` is injectable so tests can count statements; production uses queryOLTP. */
  constructor(private readonly query: typeof queryOLTP = queryOLTP) {}

  async putMany(records: ReadonlyArray<ArtifactRecord>): Promise<PutManyResult> {
    return insertArtifacts(this.query, records);
  }

  async get(id: ArtifactId): Promise<ArtifactRecord | undefined> {
    if (!isArtifactId(id)) return undefined;
    const { rows } = await this.query<ArtifactRow>(`SELECT ${COLUMNS} FROM publish.artifacts WHERE artifact_id = $1`, [id]);
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  async has(ids: readonly ArtifactId[]): Promise<ReadonlySet<ArtifactId>> {
    const valid = ids.filter(isArtifactId);
    if (valid.length === 0) return new Set();
    const { rows } = await this.query<{ artifact_id: string }>(
      'SELECT artifact_id FROM publish.artifacts WHERE artifact_id = ANY($1::text[])',
      [valid],
    );
    return new Set(rows.map((r) => r.artifact_id));
  }
}
