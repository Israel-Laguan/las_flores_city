import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { oltpPool, olapPool } from '@las-flores/infra';
import type { PoolClient } from 'pg';
import { migrateContent } from '../content/migrate.js';
import { hashText, parseVersion, stripFileLevelTransactionControl, splitStatements } from './migrateUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const TARGETS_PATH = path.join(MIGRATIONS_DIR, 'migration-targets.json');
const CONTENT_DIR = path.resolve(__dirname, '../../../content');

interface MigrateTargets {
  oltp: string[];
  olap: string[];
  /**
   * Migrations that must run OUTSIDE a transaction (e.g. CREATE INDEX
   * CONCURRENTLY or in-body COMMIT). Each entry maps the migration filename to
   * the database it targets, so the nontransactional pass does not have to
   * assume a single database. A file must therefore live in exactly one place
   * (per the one-migration-one-database rule).
   */
  nontransactional?: Record<string, string>;
}

async function ensureSchemaMigrationsTable(): Promise<void> {
  const oltp = await oltpPool.connect();
  try {
    await oltp.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT NOT NULL,
        filename TEXT NOT NULL,
        checksum TEXT NOT NULL,
        database_name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (version, database_name)
      )
    `);
  } finally {
    oltp.release();
  }
  const olap = await olapPool.connect();
  try {
    await olap.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT NOT NULL,
        filename TEXT NOT NULL,
        checksum TEXT NOT NULL,
        database_name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (version, database_name)
      )
    `);
  } finally {
    olap.release();
  }
}

async function isAppliedOn(client: PoolClient, dbName: string, version: string): Promise<boolean> {
  const result = await client.query(
    'SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version = $1 AND database_name = $2',
    [version, dbName]
  );
  return result.rows[0].count > 0;
}

async function recordMigration(client: PoolClient, dbName: string, version: string, filename: string, checksum: string): Promise<void> {
  await client.query(
    `INSERT INTO schema_migrations (version, filename, checksum, database_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (version, database_name)
     DO UPDATE SET filename = EXCLUDED.filename, checksum = EXCLUDED.checksum, applied_at = NOW()`,
    [version, filename, checksum, dbName]
  );
}

async function calculateChecksum(filePath: string): Promise<string> {
  const crypto = await import('crypto');
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Apply one migration file on a pinned client. `transactional` migrations run
 * inside a single BEGIN/COMMIT with a transaction-scoped advisory lock. The
 * client MUST be pinned for the whole check/apply/record sequence so the lock
 * and the migration transaction share one session (a plain pool.query lock would
 * live on a different session and never serialize concurrently).
 *
 * `nontransactional` migrations (e.g. 075) cannot run inside a transaction
 * because they issue COMMIT inside PL/pgSQL bodies or use CREATE/DROP INDEX
 * CONCURRENTLY. They run in autocommit mode under a session-level advisory lock,
 * with each statement executed as its own client.query() — a single multi-statement
 * query would be wrapped in an implicit transaction, making the in-body COMMIT
 * illegal (2D000). The schema_migrations record is written per-file afterwards.
 */
async function applyMigrationFile(
  client: PoolClient,
  dbName: string,
  filename: string,
  transactional: boolean,
): Promise<void> {
  const version = parseVersion(filename);
  const filePath = path.join(MIGRATIONS_DIR, filename);

  try {
    await fs.access(filePath);
  } catch {
    return;
  }

  const lockKey = hashText(`migration:${dbName}`);

  if (transactional) {
    await client.query('BEGIN');
    try {
      // A transaction-scoped advisory lock is only meaningful inside a transaction;
      // in autocommit it would commit and release instantly, defeating serialization.
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      const alreadyApplied = await isAppliedOn(client, dbName, version);
      if (alreadyApplied) {
        await client.query('COMMIT');
        return;
      }

      const checksum = await calculateChecksum(filePath);
      const rawSql = await fs.readFile(filePath, 'utf-8');
      // Strip only the file-level BEGIN/COMMIT so the wrapper's own transaction is
      // the only one; schema changes + the schema_migrations record commit together.
      const sql = stripFileLevelTransactionControl(rawSql);

      console.log(`[migrate] Applying ${filename} to ${dbName}...`);
      // Single transaction so a failure/interrupted run can never strand a
      // half-applied migration (e.g. a PL/pgSQL function failing to recompile).
      await client.query(sql);
      await recordMigration(client, dbName, version, filename, checksum);
      await client.query('COMMIT');
      console.log(`[migrate] ✓ ${filename} applied to ${dbName}`);
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ✗ ${filename} failed on ${dbName}: ${err.message}`);
      throw err;
    }
    return;
  }

  // Nontransactional: session-level (not xact) lock so concurrent runners still
  // serialize WITHOUT opening a transaction — CREATE/DROP INDEX CONCURRENTLY and
  // in-body COMMIT are illegal inside one.
  await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
  try {
    const alreadyApplied = await isAppliedOn(client, dbName, version);
    if (alreadyApplied) return;

    const checksum = await calculateChecksum(filePath);
    const rawSql = await fs.readFile(filePath, 'utf-8');
    // Strip only file-level BEGIN/COMMIT; statements inside $$ bodies (including
    // COMMIT) are preserved for autocommit execution.
    const sql = stripFileLevelTransactionControl(rawSql);

    console.log(`[migrate] Applying ${filename} to ${dbName} (nontransactional)...`);
    // Execute each statement as its own autocommit query so an in-body COMMIT is
    // legal (a single multi-statement query would open an implicit transaction).
    for (const stmt of splitStatements(sql)) {
      await client.query(stmt);
    }
    await recordMigration(client, dbName, version, filename, checksum);
    console.log(`[migrate] ✓ ${filename} applied to ${dbName}`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
  }
}

async function applySQLMigrations(): Promise<void> {
  const targetsRaw = await fs.readFile(TARGETS_PATH, 'utf-8');
  const targets: MigrateTargets = JSON.parse(targetsRaw);

  await ensureSchemaMigrationsTable();

  const dbConfigs: Array<{ name: string; key: 'oltp' | 'olap' }> = [
    { name: 'las_flores', key: 'oltp' },
    { name: 'las_flores_analytics', key: 'olap' },
  ];
  const validDbNames = new Set(dbConfigs.map((d) => d.name));

  const nontransactional = targets.nontransactional || {};

  // Fail fast on a typo/unsupported dbName in migration-targets.json. A silent
  // fallback to oltpPool (as an unvalidated ternary would) could run an OLAP
  // migration against OLTP — exactly the mis-targeting this pass exists to prevent.
  for (const [filename, dbName] of Object.entries(nontransactional)) {
    if (!validDbNames.has(dbName)) {
      throw new Error(`Unsupported migration database target "${dbName}" for ${filename}`);
    }
  }

  // Nontransactional migrations run in autocommit mode (see applyMigrationFile).
  // Its per-file target database is encoded in migration-targets.json, so an OLAP
  // nontransactional migration is applied to las_flores_analytics, not OLTP.
  //
  // Both modes are applied per-database in ONE version-ordered stream, so a
  // nontransactional migration that precedes a later transactional migration for
  // the same database runs in the correct order (not after the whole db loop).
  for (const db of dbConfigs) {
    const transactionalFiles = targets[db.key] ?? [];
    const nontransactionalFiles = Object.entries(nontransactional)
      .filter(([, dbName]) => dbName === db.name)
      .map(([filename]) => filename);

    // Merge without duplicates (a file lives in exactly one place per the
    // one-migration-one-database rule; the defensive dedupe keeps this robust).
    const planned = new Map<string, boolean>();
    for (const f of transactionalFiles) planned.set(f, true);
    for (const f of nontransactionalFiles) planned.set(f, false);
    const files = [...planned.entries()]
      .sort((a, b) => parseInt(parseVersion(a[0]), 10) - parseInt(parseVersion(b[0]), 10))
      .map(([filename, isTransactional]) => ({ filename, isTransactional }));

    const pool = db.key === 'oltp' ? oltpPool : olapPool;
    for (const { filename, isTransactional } of files) {
      const client = await pool.connect();
      try {
        await applyMigrationFile(client, db.name, filename, isTransactional);
      } finally {
        client.release();
      }
    }
  }
}

export async function runAllMigrations(): Promise<void> {
  console.log('[migrate] Running database schema migrations...');
  await applySQLMigrations();
  console.log('[migrate] Database schema migrations complete');

  console.log('[migrate] Running content migration...');
  const result = await migrateContent(CONTENT_DIR);
  if (!result.success) {
    console.error('[migrate] Content migration had errors:');
    result.errors.forEach(e => console.error(`  - ${e}`));
    if (result.filesFailed > 0) {
      throw new Error(`Content migration failed: ${result.filesFailed} file(s) failed`);
    }
  }
  console.log('[migrate] Content migration complete');
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]).endsWith(path.join('src', 'database', 'migrate.ts'))
  : false;

if (isCli) {
  runAllMigrations()
    .then(() => { console.log('[migrate] All migrations complete'); process.exit(0); })
    .catch(err => { console.error('[migrate] Migration failed:', err); process.exit(1); });
}
