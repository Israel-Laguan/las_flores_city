import { oltpPool } from '../../src/database/connection.js';

/**
 * Shared blocking-advisory-lock helper for integration tests.
 *
 * Integration tests share a single Postgres instance. Several suites run real
 * schema DDL in `beforeAll` (CREATE TABLE / ALTER TABLE) via `applyMigration`,
 * and `migrateContent()` drops/recreates `dialogue_trees` FK constraints. Two
 * parallel workers issuing concurrent DDL take `ACCESS EXCLUSIVE` table locks
 * on the same tables and Postgres aborts one transaction with
 * `deadlock detected`.
 *
 * This helper serializes every schema/content-mutating operation across Jest
 * workers on ONE advisory lock so only a single worker performs schema mutation
 * at a time. It uses the *same* advisory key as `migrateContent()`'s internal
 * lock (`content_migration`), so DDL applied here also serializes against a
 * concurrent content migration — no two mutators ever run DDL together.
 *
 * A blocking (`pg_advisory_lock`) rather than try-and-give-up acquisition is
 * used so callers wait for the current holder to finish instead of failing-fast
 * under contention. Lock release + connection release are guaranteed by the
 * `finally`.
 */
const SCHEMA_MUTATION_LOCK_KEY = 'content_migration';

/**
 * Runs `fn` while holding an exclusive advisory lock that is shared by every
 * schema-mutating integration suite (and by `migrateContent`). Use this to wrap
 * DDL migration-application, whole-table reconciles, or any other operation that
 * must not run while a sibling worker is mutating the shared schema.
 */
export async function withSchemaLock<T>(fn: () => Promise<T>): Promise<T> {
  const client = await oltpPool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [
      SCHEMA_MUTATION_LOCK_KEY,
    ]);
    return await fn();
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
        SCHEMA_MUTATION_LOCK_KEY,
      ]);
    } finally {
      client.release();
    }
  }
}
