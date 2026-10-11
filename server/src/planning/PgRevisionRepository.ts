// SC-404/406: Postgres-backed RevisionRepository over publish.revisions / revision_entries /
// active_revision / revision_flips (migration 105). Uses the existing oltpPool via
// queryOLTP / withOLTPTransaction — no new pools (AGENTS hard constraint).
//
// The pointer move is compare-and-swap in ONE statement, with no application-level locking:
//   first flip   INSERT INTO active_revision ... ON CONFLICT DO NOTHING
//   later flips  UPDATE active_revision SET revision_id = $to WHERE revision_id = $expected
// Under READ COMMITTED a concurrent flip waits for the first, re-evaluates the WHERE against
// the updated row and matches nothing, so exactly one of N racing flips wins and the rest
// are reported as `conflict` with the winner as `actual`. Every flip also appends to
// revision_flips inside the same transaction, so the log can never disagree with the pointer.
//
// `publish` runs the artifact insert, the revision + manifest insert and the flip in ONE
// transaction: any failure (including a stale expectedActive, or a fault injected between the
// steps) rolls back all of it.

import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import {
  RevisionArtifactMissingError,
  isRevisionId,
  manifestHash,
  normaliseManifest,
  type ActiveRevision,
  type CreateRevisionInput,
  type FlipInput,
  type FlipRecord,
  type FlipResult,
  type Revision,
  type RevisionId,
} from '@las-flores/api-contracts';
import {
  manifestFromRecords,
  type PublishInput,
  type PublishResult,
  type RevisionRepository,
} from '@las-flores/api-planning';
import { insertArtifacts, type QueryFn } from './PgArtifactStore.js';

type Tx = <T>(fn: (client: { query: QueryFn }) => Promise<T>) => Promise<T>;

interface RevisionRow {
  revision_id: string;
  parent_revision_id: string | null;
  manifest_hash: string;
  note: string | null;
  created_at: Date;
}
interface EntryRow {
  artifact_type: Revision['manifest']['entries'][number]['artifact_type'];
  name: string;
  artifact_id: string;
}
interface ActiveRow {
  revision_id: string;
  flipped_at: Date;
}

const toActive = (r: ActiveRow): ActiveRevision => ({ revision_id: r.revision_id, flipped_at: r.flipped_at.toISOString() });

const fmt = (id: string | null): string => (id === null ? 'nothing' : `'${id}'`);

/** Thrown inside a transaction to roll it back and surface a typed publish failure. */
class Rollback extends Error {
  constructor(readonly failure: Extract<PublishResult, { ok: false }>) {
    super('rollback');
  }
}

async function readActive(query: QueryFn): Promise<string | null> {
  const { rows } = await query('SELECT revision_id FROM publish.active_revision WHERE singleton');
  return rows[0]?.revision_id ?? null;
}

/** The compare-and-swap, against whatever connection/transaction `query` runs on. */
async function casFlip(query: QueryFn, { to, expectedActive }: FlipInput): Promise<FlipResult> {
  const fail = async (code: 'conflict' | 'unknown_revision' | 'already_active', message: string): Promise<FlipResult> => ({
    ok: false,
    code,
    actual: await readActive(query),
    message,
  });
  if (!isRevisionId(to)) return fail('unknown_revision', `'${to}' is not a revision id`);
  const exists = await query('SELECT 1 FROM publish.revisions WHERE revision_id = $1', [to]);
  if (exists.rowCount === 0) return fail('unknown_revision', `revision '${to}' does not exist`);

  if (expectedActive === to) {
    const actual = await readActive(query);
    return actual === to
      ? fail('already_active', `revision '${to}' is already active`)
      : fail('conflict', `expected '${to}' to be active, but ${fmt(actual)} is`);
  }

  if (expectedActive !== null && !isRevisionId(expectedActive)) {
    const actual = await readActive(query);
    return { ok: false, code: 'conflict', actual, message: `expected ${fmt(expectedActive)}, but ${fmt(actual)} is active` };
  }
  const moved =
    expectedActive === null
      ? await query(
          `INSERT INTO publish.active_revision (singleton, revision_id) VALUES (TRUE, $1)
           ON CONFLICT (singleton) DO NOTHING RETURNING revision_id, flipped_at`,
          [to],
        )
      : await query(
          `UPDATE publish.active_revision SET revision_id = $1, flipped_at = NOW()
            WHERE singleton AND revision_id = $2 RETURNING revision_id, flipped_at`,
          [to, expectedActive],
        );
  if (moved.rows.length === 0) {
    const actual = await readActive(query);
    return {
      ok: false,
      code: 'conflict',
      actual,
      message: `expected ${expectedActive === null ? 'no active revision' : fmt(expectedActive)}, but ${fmt(actual)} is active`,
    };
  }
  await query('INSERT INTO publish.revision_flips (from_revision_id, to_revision_id) VALUES ($1, $2)', [expectedActive, to]);
  return { ok: true, previous: expectedActive, active: toActive(moved.rows[0]) };
}

async function insertRevision(query: QueryFn, input: CreateRevisionInput): Promise<Revision> {
  const manifest = normaliseManifest(input.manifest.entries);
  const ids = [...new Set(manifest.entries.map((e) => e.artifact_id))];
  if (ids.length > 0) {
    const have = await query('SELECT artifact_id FROM publish.artifacts WHERE artifact_id = ANY($1::text[])', [ids]);
    const present = new Set<string>(have.rows.map((r: { artifact_id: string }) => r.artifact_id));
    const missing = ids.filter((id) => !present.has(id)).sort();
    if (missing.length > 0) throw new RevisionArtifactMissingError(missing);
  }
  const parent = input.parentRevisionId ?? null;
  if (parent !== null) {
    const found = isRevisionId(parent) ? await query('SELECT 1 FROM publish.revisions WHERE revision_id = $1', [parent]) : undefined;
    if (found === undefined || found.rowCount === 0) throw new Error(`parent revision '${parent}' does not exist`);
  }
  const { rows } = await query(
    `INSERT INTO publish.revisions (parent_revision_id, manifest_hash, note) VALUES ($1, $2, $3)
     RETURNING revision_id, parent_revision_id, manifest_hash, note, created_at`,
    [parent, manifestHash(manifest), input.note ?? null],
  );
  const row = rows[0] as RevisionRow;
  if (manifest.entries.length > 0) {
    await query(
      `INSERT INTO publish.revision_entries (revision_id, artifact_type, name, artifact_id)
       SELECT $1::uuid, t.artifact_type, t.name, t.artifact_id
         FROM unnest($2::text[], $3::text[], $4::text[]) AS t(artifact_type, name, artifact_id)`,
      [row.revision_id, manifest.entries.map((e) => e.artifact_type), manifest.entries.map((e) => e.name), manifest.entries.map((e) => e.artifact_id)],
    );
  }
  return {
    revision_id: row.revision_id,
    parent_revision_id: row.parent_revision_id,
    manifest,
    manifest_hash: row.manifest_hash,
    note: row.note,
    created_at: row.created_at.toISOString(),
  };
}

export class PgRevisionRepository implements RevisionRepository {
  /** `query` and `tx` are injectable so tests can inject a fault mid-transaction. */
  constructor(
    private readonly query: typeof queryOLTP = queryOLTP,
    private readonly tx: Tx = withOLTPTransaction as unknown as Tx,
  ) {}

  async getActive(): Promise<ActiveRevision | undefined> {
    const { rows } = await this.query<ActiveRow>('SELECT revision_id, flipped_at FROM publish.active_revision WHERE singleton');
    return rows[0] ? toActive(rows[0]) : undefined;
  }

  async getRevision(id: RevisionId): Promise<Revision | undefined> {
    if (!isRevisionId(id)) return undefined;
    const { rows } = await this.query<RevisionRow>(
      'SELECT revision_id, parent_revision_id, manifest_hash, note, created_at FROM publish.revisions WHERE revision_id = $1',
      [id],
    );
    if (!rows[0]) return undefined;
    const entries = await this.query<EntryRow>(
      'SELECT artifact_type, name, artifact_id FROM publish.revision_entries WHERE revision_id = $1',
      [id],
    );
    return {
      revision_id: rows[0].revision_id,
      parent_revision_id: rows[0].parent_revision_id,
      manifest: normaliseManifest(entries.rows),
      manifest_hash: rows[0].manifest_hash,
      note: rows[0].note,
      created_at: rows[0].created_at.toISOString(),
    };
  }

  createRevision(input: CreateRevisionInput): Promise<Revision> {
    return this.tx((client) => insertRevision(client.query.bind(client), input));
  }

  flip(input: FlipInput): Promise<FlipResult> {
    return this.tx((client) => casFlip(client.query.bind(client), input));
  }

  async listFlips(limit = 100): Promise<FlipRecord[]> {
    const { rows } = await this.query<{ flip_id: string; from_revision_id: string | null; to_revision_id: string; flipped_at: Date }>(
      'SELECT flip_id, from_revision_id, to_revision_id, flipped_at FROM publish.revision_flips ORDER BY flip_id DESC LIMIT $1',
      [limit],
    );
    return rows.map((r) => ({
      flip_id: Number(r.flip_id),
      from_revision_id: r.from_revision_id,
      to_revision_id: r.to_revision_id,
      flipped_at: r.flipped_at.toISOString(),
    }));
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    // Everything that can throw without I/O happens before the transaction opens.
    const manifest = manifestFromRecords(input.records);
    try {
      return await this.tx(async (client) => {
        const query: QueryFn = client.query.bind(client);
        // Cheap early exit: a stale expectation writes nothing at all. The flip below is still
        // the real compare-and-swap, so a race between this read and the flip is caught there.
        const actual = await readActive(query);
        if (actual !== input.expectedActive) {
          throw new Rollback({
            ok: false,
            code: 'conflict',
            actual,
            message: `expected ${input.expectedActive === null ? 'no active revision' : fmt(input.expectedActive)}, but ${fmt(actual)} is active`,
          });
        }
        const artifacts = await insertArtifacts(query, input.records);
        const revision = await insertRevision(query, { manifest, parentRevisionId: input.expectedActive, note: input.note ?? null });
        const flipped = await casFlip(query, { to: revision.revision_id, expectedActive: input.expectedActive });
        if (!flipped.ok) {
          throw new Rollback({ ok: false, code: flipped.code, actual: flipped.actual, message: flipped.message });
        }
        return { ok: true, revision, previous: flipped.previous, active: flipped.active, artifacts } satisfies PublishResult;
      });
    } catch (err) {
      if (err instanceof Rollback) return err.failure;
      throw err;
    }
  }
}
