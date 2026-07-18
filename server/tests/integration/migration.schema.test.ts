/**
 * Migration schema-integrity tests (derived from scripts/validate-milestones.sh).
 *
 * Verifies that milestone-specific database changes are correctly applied:
 * - Migration 049/050/051 recorded in schema_migrations
 * - content_plans CHECK constraint allows 7 status values
 * - verification_report column on content_plans
 * - scenes.background_urls and locations.image_urls columns
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

const { Pool } = pg;

describe('Milestone schema-integrity checks', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('M02: Migration 049 is recorded in schema_migrations', async () => {
    const result = await pool.query(
      "SELECT COUNT(*) FROM schema_migrations WHERE version = '049';",
    );
    expect(parseInt(result.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
  });

  it('M02: Migration 050 is recorded in schema_migrations', async () => {
    const result = await pool.query(
      "SELECT COUNT(*) FROM schema_migrations WHERE version = '050';",
    );
    expect(parseInt(result.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
  });

  it('M07: Migration 051 is recorded in schema_migrations', async () => {
    const result = await pool.query(
      "SELECT COUNT(*) FROM schema_migrations WHERE version = '051';",
    );
    expect(parseInt(result.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
  });

  it('M02: content_plans CHECK constraint allows 7+ status values', async () => {
    const result = await pool.query(
      "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'content_plans_status_check';",
    );
    expect(result.rows.length).toBe(1);
    const constraintDef = result.rows[0].pg_get_constraintdef as string;
    const valueMatches = constraintDef.match(/'[^']+'/g);
    expect(valueMatches?.length ?? 0).toBeGreaterThanOrEqual(7);
  });

  it('M05: content_plans.verification_report column exists', async () => {
    const result = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'content_plans' AND column_name = 'verification_report'",
    );
    expect(result.rowCount).toBeGreaterThanOrEqual(1);
  });

  it('M07: scenes.background_urls column exists', async () => {
    const result = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'scenes' AND column_name = 'background_urls'",
    );
    expect(result.rowCount).toBeGreaterThanOrEqual(1);
  });

  it('M07: scenes.image_urls column exists', async () => {
    const result = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'scenes' AND column_name = 'image_urls'",
    );
    expect(result.rowCount).toBeGreaterThanOrEqual(1);
  });
});