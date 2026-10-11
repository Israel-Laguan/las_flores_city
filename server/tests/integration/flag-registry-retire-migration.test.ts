import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { queryOLTP } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';

// SC-317 (m-82): migration 097 — retired_at on planning.flag_definitions (BF-303).
// The retire behaviour itself is covered by flagRegistry.pg.test.ts; this suite pins the
// DDL: re-apply is a no-op and the column and active-flag index are the expected shape.
// 098 already has its idempotency test in districts-weather.test.ts.
const MIGRATION = '097_flag_registry_retire.sql';

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'src/database/migrations', filename), 'utf-8');
  await withSchemaLock(async (client) => {
    await client.query(sql);
  });
}

describe('097 planning.flag_definitions retired_at', () => {
  test('is idempotent (re-apply is a no-op)', async () => {
    await expect(applyMigration(MIGRATION)).resolves.toBeUndefined();
    await expect(applyMigration(MIGRATION)).resolves.toBeUndefined();
  });

  test('retired_at is a nullable TIMESTAMPTZ column', async () => {
    const { rows } = await queryOLTP<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'planning' AND table_name = 'flag_definitions' AND column_name = 'retired_at'`,
    );
    expect(rows).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES' }]);
  });

  test('active-flag partial index exists', async () => {
    const { rows } = await queryOLTP<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'planning' AND indexname = 'flag_definitions_active_semantics_idx'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/WHERE \(?retired_at IS NULL/);
  });
});
