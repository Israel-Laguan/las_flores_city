import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { oltpPool, queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import { PgArtifactStore } from '../../src/planning/PgArtifactStore.js';
import { PgRevisionRepository } from '../../src/planning/PgRevisionRepository.js';
import { acquirePointerLock, deletePrefixedPublishRows } from '../helpers/pointerLock.js';
import { fixtureRecord } from '../helpers/artifactStoreContract.js';
import { revisionRepositoryContract } from '../helpers/revisionRepositoryContract.js';
import { manifestFromRecords } from '@las-flores/api-planning';

// SC-404: the shared RevisionRepository contract against publish.* (Postgres), plus the
// Postgres-only guarantees (singleton pointer, atomicity under an injected fault).
// Collision avoidance: every artifact name starts with `sc404_pg` and every revision note with
// `sc404_pg`, which no other suite uses. The pointer is one global row, so this suite holds the
// shared advisory lock for its whole run (see helpers/pointerLock.ts) and the rows it created
// are removed in afterAll.
const PREFIX = 'sc404_pg';

let release: () => Promise<void>;
const reset = () => deletePrefixedPublishRows(PREFIX);

beforeAll(async () => {
  release = await acquirePointerLock();
  await reset();
});
afterAll(async () => {
  try {
    await reset();
  } finally {
    await release();
  }
});

revisionRepositoryContract(
  'PgRevisionRepository',
  () => ({ repo: new PgRevisionRepository(), store: new PgArtifactStore() }),
  { slugPrefix: PREFIX, reset },
);

describe('PgRevisionRepository (Postgres-only)', () => {
  beforeAll(reset);
  const note = (s: string) => `${PREFIX} ${s}`;

  /** A transaction runner that throws when a statement matching `pattern` is about to run. */
  const faultOn = (pattern: RegExp) =>
    (async (fn: (c: { query: (t: string, p?: unknown[]) => Promise<unknown> }) => Promise<unknown>) =>
      withOLTPTransaction(async (client) =>
        fn({
          query: (text: string, params?: unknown[]) => {
            if (pattern.test(text)) throw new Error('injected fault');
            return client.query(text, params as any[]);
          },
        }),
      )) as never;

  test('FAULT: an error after the artifacts and revision are written (flip log insert) rolls EVERYTHING back', async () => {
    await reset();
    const store = new PgArtifactStore();
    const repo = new PgRevisionRepository(queryOLTP, faultOn(/INSERT INTO publish\.revision_flips/));
    const rec = fixtureRecord(`${PREFIX}_fault_a`);

    await expect(repo.publish({ records: [rec], expectedActive: null, note: note('fault publish') })).rejects.toThrow('injected fault');

    expect(await store.get(rec.artifact.artifact_id)).toBeUndefined(); // artifacts rolled back
    expect((await queryOLTP('SELECT 1 FROM publish.revisions WHERE note = $1', [note('fault publish')])).rowCount).toBe(0);
    expect(await new PgRevisionRepository().getActive()).toBeUndefined(); // pointer untouched
  });

  test('FAULT: a failure after the pointer moved (flip log insert) leaves the PREVIOUS revision active', async () => {
    await reset();
    const store = new PgArtifactStore();
    const healthy = new PgRevisionRepository();
    const a = fixtureRecord(`${PREFIX}_fault_b1`);
    const b = fixtureRecord(`${PREFIX}_fault_b2`);
    await store.putMany([a, b]);
    const ra = await healthy.createRevision({ manifest: manifestFromRecords([a]), note: note('fb1') });
    const rb = await healthy.createRevision({ manifest: manifestFromRecords([b]), note: note('fb2') });
    await healthy.flip({ to: ra.revision_id, expectedActive: null });

    const faulty = new PgRevisionRepository(queryOLTP, faultOn(/INSERT INTO publish\.revision_flips/));
    await expect(faulty.flip({ to: rb.revision_id, expectedActive: ra.revision_id })).rejects.toThrow('injected fault');

    expect((await healthy.getActive())!.revision_id).toBe(ra.revision_id); // the UPDATE was rolled back with it
    expect(await healthy.listFlips()).toHaveLength(1);
  });

  test('the pointer is a singleton: a second row cannot exist (23505 / 23514)', async () => {
    await reset();
    const store = new PgArtifactStore();
    const repo = new PgRevisionRepository();
    const a = fixtureRecord(`${PREFIX}_single`);
    await store.putMany([a]);
    const r = await repo.createRevision({ manifest: manifestFromRecords([a]), note: note('single') });
    await repo.flip({ to: r.revision_id, expectedActive: null });
    const code = async (sql: string) => {
      try {
        await queryOLTP(sql, [r.revision_id]);
        return undefined;
      } catch (e) {
        return (e as { code?: string }).code;
      }
    };
    expect(await code('INSERT INTO publish.active_revision (singleton, revision_id) VALUES (TRUE, $1)')).toBe('23505');
    expect(await code('INSERT INTO publish.active_revision (singleton, revision_id) VALUES (FALSE, $1)')).toBe('23514');
  });

  test('referential integrity: an entry cannot name a missing artifact, a flip cannot name a missing revision (23503)', async () => {
    await reset();
    const store = new PgArtifactStore();
    const repo = new PgRevisionRepository();
    const a = fixtureRecord(`${PREFIX}_fk`);
    await store.putMany([a]);
    const r = await repo.createRevision({ manifest: manifestFromRecords([a]), note: note('fk') });
    const code = async (sql: string, params: unknown[]) => {
      try {
        await queryOLTP(sql, params as any[]);
        return undefined;
      } catch (e) {
        return (e as { code?: string }).code;
      }
    };
    expect(await code(`INSERT INTO publish.revision_entries (revision_id, artifact_type, name, artifact_id) VALUES ($1, 'scene', 'x', $2)`, [r.revision_id, 'e'.repeat(64)])).toBe('23503');
    expect(await code(`INSERT INTO publish.revision_flips (to_revision_id) VALUES ($1)`, ['e9904000-0000-4000-8000-0000000000aa'])).toBe('23503');
  });

  test('a real concurrent race across separate pool connections is decided by the database, not the test', async () => {
    await reset();
    const store = new PgArtifactStore();
    const repo = new PgRevisionRepository();
    const recs = Array.from({ length: 20 }, (_, i) => fixtureRecord(`${PREFIX}_race${i}`));
    await store.putMany(recs);
    const revs = await Promise.all(recs.map((r, i) => repo.createRevision({ manifest: manifestFromRecords([r]), note: note(`race${i}`) })));
    const results = await Promise.all(revs.map((r) => repo.flip({ to: r.revision_id, expectedActive: null })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const rows = await oltpPool.query('SELECT count(*)::int AS n FROM publish.revision_flips WHERE to_revision_id = ANY($1::uuid[])', [revs.map((r) => r.revision_id)]);
    expect(rows.rows[0].n).toBe(1);
  });
});
