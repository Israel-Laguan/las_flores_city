import type pg from 'pg';
import { oltpPool, olapPool } from '@las-flores/infra';

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
 *
 * IMPORTANT — advisory locks are per-database. Postgres advisory locks live in
 * the shared lock table but are scoped to the database of the session holding
 * them, so a lock taken on the OLTP database is invisible to sessions
 * mutating the OLAP/analytics database (a separate server on another port).
 * Callers applying DDL to the analytics database must therefore lock on the
 * *same* database via `withOlapSchemaLock`, otherwise the lock provides no
 * mutual exclusion at all.
 */
const SCHEMA_MUTATION_LOCK_KEY = 'content_migration';

async function withPoolSchemaLock<T>(pool: pg.Pool, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [
      SCHEMA_MUTATION_LOCK_KEY,
    ]);
  } catch (error) {
    // Acquisition failed and the session's lock state is unknown — destroy the
    // connection instead of returning a possibly-locked one to the pool.
    client.release(true);
    throw error;
  }

  let succeeded = false;
  try {
    const value = await fn();
    succeeded = true;
    return value;
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
        SCHEMA_MUTATION_LOCK_KEY,
      ]);
      client.release();
    } catch (error) {
      // The unlock failed, so this session may still hold the session-level
      // advisory lock. Returning it to the pool would silently carry the lock
      // onto the next unrelated query and block every future schema mutator
      // for the rest of the run. Destroy the connection instead: closing the
      // backend releases all of its session locks.
      client.release(true);

      // Always log: a failed unlock is a real infrastructure problem and must
      // never vanish silently from a test run.
      console.error(
        `[schemaLock] Failed to release advisory lock '${SCHEMA_MUTATION_LOCK_KEY}'; connection destroyed to drop it:`,
        error
      );

      // Only propagate when `fn` itself succeeded. This block runs in a
      // `finally`, so rethrowing unconditionally would overwrite a genuine
      // test failure from `fn` with this secondary lock error and hide the
      // assertion the developer actually needs to see. When `fn` already
      // threw, that error stays the one that propagates and this one is
      // surfaced via the log above.
      if (succeeded) {
        throw error;
      }
    }
  }
}

/**
 * Runs `fn` while holding an exclusive advisory lock that is shared by every
 * schema-mutating integration suite (and by `migrateContent`). Use this to wrap
 * DDL migration-application, whole-table reconciles, or any other operation that
 * must not run while a sibling worker is mutating the shared schema.
 *
 * Locks on the OLTP database — use for DDL against OLTP only.
 */
export async function withSchemaLock<T>(fn: () => Promise<T>): Promise<T> {
  return withPoolSchemaLock(oltpPool, fn);
}

/**
 * OLAP/analytics counterpart of `withSchemaLock`. Advisory locks are
 * per-database, so DDL against the analytics database (e.g.
 * `025_marketplace_olap.sql`, which alters the shared `player_events` table)
 * must serialize on a lock held in that same database — a lock taken on OLTP
 * would not exclude anything.
 */
export async function withOlapSchemaLock<T>(fn: () => Promise<T>): Promise<T> {
  return withPoolSchemaLock(olapPool, fn);
}
