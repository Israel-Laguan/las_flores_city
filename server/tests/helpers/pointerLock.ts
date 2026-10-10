import { oltpPool } from '@las-flores/infra';

/**
 * Test-only: `publish.active_revision` is ONE global row, so suites that move it cannot run in
 * parallel. Every such suite holds this session-level advisory lock for its whole run (acquire
 * in beforeAll, release in afterAll). It waits rather than failing, so suites simply queue.
 *
 * Also snapshots the pointer row that existed before the suite and restores it on release, so a
 * developer's real active revision survives a test run.
 */
const KEY = 'publish_active_revision_tests';

export async function acquirePointerLock(): Promise<() => Promise<void>> {
  const client = await oltpPool.connect();
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [KEY]);
  const saved = await client.query<{ revision_id: string; flipped_at: Date }>(
    'SELECT revision_id, flipped_at FROM publish.active_revision WHERE singleton',
  );
  return async () => {
    try {
      const prior = saved.rows[0];
      if (prior) {
        // Only put it back if that revision still exists (it is never deleted by tests: they only
        // delete their own prefixed revisions) and nothing else is active.
        await client.query(
          `INSERT INTO publish.active_revision (singleton, revision_id, flipped_at)
           SELECT TRUE, $1, $2 WHERE EXISTS (SELECT 1 FROM publish.revisions WHERE revision_id = $1)
           ON CONFLICT (singleton) DO NOTHING`,
          [prior.revision_id, prior.flipped_at],
        );
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [KEY]);
      client.release();
    }
  };
}

/**
 * Removes every revision whose note starts with `prefix`, plus its entries, flips and the
 * pointer if it points at one of them, then the artifacts whose name starts with `prefix`.
 * Runs as the owner connection (planning itself may not DELETE).
 */
export async function deletePrefixedPublishRows(prefix: string): Promise<void> {
  const like = `${prefix}%`;
  const ids = `(SELECT revision_id FROM publish.revisions WHERE note LIKE $1)`;
  await oltpPool.query(`DELETE FROM publish.active_revision WHERE revision_id IN ${ids}`, [like]);
  await oltpPool.query(`DELETE FROM publish.revision_flips WHERE to_revision_id IN ${ids} OR from_revision_id IN ${ids}`, [like]);
  await oltpPool.query(`DELETE FROM publish.revision_entries WHERE revision_id IN ${ids}`, [like]);
  await oltpPool.query(`DELETE FROM publish.revisions WHERE note LIKE $1`, [like]);
  await oltpPool.query(`DELETE FROM publish.artifacts WHERE name LIKE $1`, [`${prefix.split(' ')[0]}\\_%`]);
}
