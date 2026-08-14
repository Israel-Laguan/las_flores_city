import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryOLTP, queryOLAP, withOLTPTransaction, withOLAPTransaction } from '@las-flores/infra';
import type { PoolClient } from 'pg';
import { migrateContent } from '../content/migrate.js';

function hashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash === 0 ? 1 : hash;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const TARGETS_PATH = path.join(MIGRATIONS_DIR, 'migration-targets.json');
const CONTENT_DIR = path.resolve(__dirname, '../../../content');

interface MigrateTargets {
  oltp: string[];
  olap: string[];
}

async function ensureSchemaMigrationsTable(): Promise<void> {
  await queryOLTP(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT NOT NULL,
      filename TEXT NOT NULL,
      checksum TEXT NOT NULL,
      database_name TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (version, database_name)
    )
  `);
  await queryOLAP(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT NOT NULL,
      filename TEXT NOT NULL,
      checksum TEXT NOT NULL,
      database_name TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (version, database_name)
    )
  `);
}

async function isApplied(dbName: string, version: string): Promise<boolean> {
  const q = dbName === 'las_flores' ? queryOLTP : queryOLAP;
  const result = await q(
    'SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version = $1 AND database_name = $2',
    [version, dbName]
  );
  if (!result) return false;
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

function parseVersion(filename: string): string {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : filename;
}

async function calculateChecksum(filePath: string): Promise<string> {
  const crypto = await import('crypto');
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Migration files historically wrapped themselves in a top-level BEGIN/COMMIT so
// the wrapper transaction in withOLTPTransaction/withOLAPTransaction would then
// open a *nested* transaction. A file-level COMMIT inside that wrapper can close
// the inner savepoint before recordMigration runs, leaving schema changes
// applied without matching bookkeeping on a later failure. We now let the
// wrapper own the single transaction and strip the file-level transaction
// control statements here — but only those at the top level, never the
// BEGIN/COMMIT/ROLLBACK that appear inside PL/pgSQL `$$` ... `$$` bodies.
function stripFileLevelTransactionControl(sql: string): string {
  const lines = sql.split('\n');
  let inDollarBlock = false;
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (/\$\$/.test(trimmed)) {
      const dollars = (trimmed.match(/\$\$/g) || []).length;
      // Toggle per pair; an odd count within a line keeps us in/out of a block.
      if (dollars % 2 === 1) inDollarBlock = !inDollarBlock;
    }
    if (!inDollarBlock && /^(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(trimmed)) {
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

async function applySQLMigrations(): Promise<void> {
  const targetsRaw = await fs.readFile(TARGETS_PATH, 'utf-8');
  const targets: MigrateTargets = JSON.parse(targetsRaw);

  await ensureSchemaMigrationsTable();

  const dbConfigs: Array<{ name: string; key: 'oltp' | 'olap' }> = [
    { name: 'las_flores', key: 'oltp' },
    { name: 'las_flores_analytics', key: 'olap' },
  ];

  for (const db of dbConfigs) {
    const files = targets[db.key];
    if (!files) continue;

    const sorted = [...files].sort((a, b) => {
      const va = parseInt(parseVersion(a), 10);
      const vb = parseInt(parseVersion(b), 10);
      return va - vb;
    });

    for (const filename of sorted) {
      const version = parseVersion(filename);
      const filePath = path.join(MIGRATIONS_DIR, filename);

      try {
        await fs.access(filePath);
      } catch {
        continue;
      }

      const lockKey = hashText(`migration:${db.name}`);
      const acquireLock = db.key === 'oltp' ? queryOLTP : queryOLAP;
      const withTx = db.key === 'oltp' ? withOLTPTransaction : withOLAPTransaction;

      // Serialize runners (e.g. concurrent intake-worker instances) so two
      // processes cannot apply the same migration simultaneously. The lock
      // spans the isApplied check, SQL execution, and recordMigration, and is
      // released (pg_advisory_unlock_all on session end / pool release) whether
      // the migration succeeds or fails.
      await acquireLock('SELECT pg_advisory_lock($1)', [lockKey]);

      const alreadyApplied = await isApplied(db.name, version);
      if (alreadyApplied) {
        await acquireLock('SELECT pg_advisory_unlock($1)', [lockKey]);
        continue;
      }

      const checksum = await calculateChecksum(filePath);
      const rawSql = await fs.readFile(filePath, 'utf-8');
      // Strip the file-level BEGIN/COMMIT so the wrapper's own transaction is
      // the only one; schema changes and the schema_migrations record then
      // commit atomically.
      const sql = stripFileLevelTransactionControl(rawSql);

      console.log(`[migrate] Applying ${filename} to ${db.name}...`);

      try {
        // Run the whole file in a single transaction so a failure (or an
        // interrupted run) can never strand a half-applied migration — e.g. a
        // partially-created PL/pgSQL function that would fail to recompile on
        // the next `CREATE OR REPLACE` and surface as a `pl_comp.c` error.
        // The schema_migrations record is written inside the same transaction,
        // so success and bookkeeping are atomic.
        await withTx(async (client) => {
          await client.query(sql);
          await recordMigration(client, db.name, version, filename, checksum);
        });
        await acquireLock('SELECT pg_advisory_unlock($1)', [lockKey]);
        console.log(`[migrate] ✓ ${filename} applied to ${db.name}`);
      } catch (err: any) {
        await acquireLock('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => {});
        console.error(`[migrate] ✗ ${filename} failed on ${db.name}: ${err.message}`);
        throw err;
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
