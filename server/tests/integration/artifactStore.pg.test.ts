import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { oltpPool, queryOLTP } from '@las-flores/infra';
import { PgArtifactStore } from '../../src/planning/PgArtifactStore.js';
import { artifactStoreContract, fixtureRecord } from '../helpers/artifactStoreContract.js';

// SC-402/406: the shared ArtifactStore contract against publish.artifacts (Postgres), plus
// the Postgres-only guarantees: one statement per putMany, and the table's own CHECKs.
// Collision avoidance: every fixture scene slug (and therefore artifact `name`) starts with
// `sc402_pg`, which no other suite uses; rows are removed in afterAll by that name prefix.
const PREFIX = 'sc402_pg';
const cleanup = async () => {
  await oltpPool.query('DELETE FROM publish.artifacts WHERE name LIKE $1', [`${PREFIX}\\_%`]);
};

artifactStoreContract('PgArtifactStore', () => new PgArtifactStore(), { slugPrefix: PREFIX, cleanup });

describe('PgArtifactStore (Postgres-only)', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  test('putMany is exactly ONE statement however many records (SC-406: no N+1)', async () => {
    const statements: string[] = [];
    const counting = ((text: string, params?: unknown[]) => {
      statements.push(text);
      return queryOLTP(text, params as any[]);
    }) as typeof queryOLTP;
    const store = new PgArtifactStore(counting);
    const batch = Array.from({ length: 25 }, (_, i) => fixtureRecord(`${PREFIX}_batch${i}`));
    await store.putMany(batch);
    expect(statements).toHaveLength(1);
    // ...and a repeat is also one statement, all unchanged.
    statements.length = 0;
    const again = await store.putMany(batch);
    expect(statements).toHaveLength(1);
    expect(again.created).toEqual([]);
    expect(again.unchanged).toHaveLength(25);
  });

  test('the table itself rejects a hash that does not match the payload (CHECK 23514)', async () => {
    const r = fixtureRecord(`${PREFIX}_check`);
    let code: string | undefined;
    try {
      await queryOLTP(
        `INSERT INTO publish.artifacts (artifact_id, artifact_type, name, manifest_version, payload, size_bytes)
         VALUES ($1, 'scene', $2, 1, $3, $4)`,
        ['d'.repeat(64), `${PREFIX}_check`, r.payload, r.artifact.size_bytes],
      );
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe('23514');
  });

  test('the table rejects a wrong size_bytes and a non-JSON payload (CHECK 23514)', async () => {
    const r = fixtureRecord(`${PREFIX}_check2`);
    const insert = (payload: string, id: string, size: number) =>
      queryOLTP(
        `INSERT INTO publish.artifacts (artifact_id, artifact_type, name, manifest_version, payload, size_bytes)
         VALUES ($1, 'scene', $2, 1, $3, $4)`,
        [id, `${PREFIX}_check2`, payload, size],
      );
    const codeOf = async (run: () => Promise<unknown>) => {
      try {
        await run();
        return undefined;
      } catch (err) {
        return (err as { code?: string }).code;
      }
    };
    expect(await codeOf(() => insert(r.payload, r.artifact.artifact_id, 1))).toBe('23514');
    // A payload that is not JSON can pass the hash check only if its id is computed from it.
    const { createHash } = await import('node:crypto');
    const bad = 'not json';
    const id = createHash('sha256').update(bad).digest('hex');
    const code = await codeOf(() => insert(bad, id, bad.length));
    expect(['22P02', '23514']).toContain(code); // invalid_text_representation from the ::jsonb cast
  });

  test('payload bytes survive a round trip exactly (TEXT, not JSONB)', async () => {
    const r = fixtureRecord(`${PREFIX}_bytes`);
    await new PgArtifactStore().putMany([r]);
    const { rows } = await queryOLTP<{ payload: string }>('SELECT payload FROM publish.artifacts WHERE artifact_id = $1', [r.artifact.artifact_id]);
    expect(rows[0].payload).toBe(r.payload);
  });
});
