import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryOLTP, queryOLAP, withOLTPTransaction, withOLAPTransaction } from '@las-flores/infra';
import type { PoolClient } from 'pg';
import { migrateContent } from '../content/migrate.js';

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

      if (await isApplied(db.name, version)) continue;

      const checksum = await calculateChecksum(filePath);
      const sql = await fs.readFile(filePath, 'utf-8');

      console.log(`[migrate] Applying ${filename} to ${db.name}...`);

      try {
        // Run the whole file in a single transaction so a failure (or an
        // interrupted run) can never strand a half-applied migration — e.g. a
        // partially-created PL/pgSQL function that would fail to recompile on
        // the next `CREATE OR REPLACE` and surface as a `pl_comp.c` error.
        // The schema_migrations record is written inside the same transaction,
        // so success and bookkeeping are atomic.
        if (db.key === 'oltp') {
          await withOLTPTransaction(async (client) => {
            await client.query(sql);
            await recordMigration(client, db.name, version, filename, checksum);
          });
        } else {
          await withOLAPTransaction(async (client) => {
            await client.query(sql);
            await recordMigration(client, db.name, version, filename, checksum);
          });
        }
        console.log(`[migrate] ✓ ${filename} applied to ${db.name}`);
      } catch (err: any) {
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
