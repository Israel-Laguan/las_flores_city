/**
 * Story Beat Pipeline Integration Tests
 *
 * Validates:
 * - SQL migration creates the story_beats table with correct schema (PK on slug, UNIQUE on "order")
 * - Content file processing upserts every beat in story_beats.yaml with correct slugs and orders
 * - Migration logging records the story_beat content type
 *
 * Feature: story-beat-definition, Requirement 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import pg from 'pg';
import path from 'path';
import fs from 'fs/promises';

// Mock Redis cache operations to avoid Redis dependency in integration tests
jest.mock('../../src/database/redis.js', () => ({
  setCache: jest.fn() as any,
  getCache: jest.fn() as any,
  deleteCache: jest.fn() as any,
  invalidatePattern: jest.fn() as any,
}));

import * as yaml from 'js-yaml';
import crypto from 'crypto';
import { processContentFile } from '../../src/content/upsert.js';

const { Pool } = pg;

// Resolve content directory relative to the server workspace
const CONTENT_DIR = path.resolve(process.cwd(), '../content');

// Canonical beats are read from content/story_beats.yaml at runtime rather than
// hardcoded, so the suite stays correct as beats are added or removed.
async function readCanonicalBeats(): Promise<
  Array<{ slug: string; label: string; order: number; description: string }>
> {
  const yamlContent = await fs.readFile(path.join(CONTENT_DIR, 'story_beats.yaml'), 'utf-8');
  const yamlData = yaml.load(yamlContent) as {
    beats: Array<{ slug: string; label: string; order: number; description: string }>;
  };
  return yamlData.beats;
}

describe('Story Beat Pipeline Integration', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });

    // Run the SQL migration first so the table exists before we clean it.
    const migrationPath = path.resolve(process.cwd(), 'src/database/migrations/044_story_beats.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    await pool.query(migrationSql);

    // Fully reconcile the registry to a clean baseline. Clearing the whole
    // table (rather than only a hardcoded slug list) means the row-count
    // assertion reflects exactly what story_beats.yaml defines, and does not
    // depend on pre-existing or orphaned rows left by other suites or by beats
    // that have since been removed from the yaml.
    await pool.query('DELETE FROM story_beats');
  });

  afterAll(async () => {
    // Restore the canonical story_beats registry. These are real content slugs,
    // so we must NOT delete them — doing so leaves the shared registry empty
    // and breaks content-pipeline.test.ts, which validates dialogue/scene
    // story_beat cross-references against it. Re-populate instead.
    await processContentFile(path.join(CONTENT_DIR, 'story_beats.yaml'));
    await pool.end();
  });

  // Requirement 3.1: story_beats table exists with PK on slug
  test('SQL migration creates story_beats table with primary key on slug', async () => {
    const result = await pool.query(`
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'story_beats'::regclass
      AND i.indisprimary
    `);

    const pkColumns = result.rows.map(row => row.column_name);
    expect(pkColumns).toContain('slug');
  });

  // Requirement 3.2: UNIQUE constraint on "order"
  test('SQL migration creates unique index on story_beats."order"', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'story_beats'
      AND indexname LIKE 'idx_story_beats%'
    `);

    const indexNames = result.rows.map(row => row.indexname);
    expect(indexNames).toContain('idx_story_beats_order');
  });

  test('story_beats table has correct column schema', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'story_beats'
      ORDER BY ordinal_position
    `);

    const columns = result.rows;
    const columnMap = new Map(columns.map(c => [c.column_name, c]));

    // slug: VARCHAR(100) PRIMARY KEY
    const slugCol = columnMap.get('slug');
    expect(slugCol).toBeDefined();
    expect(slugCol.data_type).toBe('character varying');
    expect(slugCol.is_nullable).toBe('NO');

    // label: VARCHAR(100) NOT NULL
    const labelCol = columnMap.get('label');
    expect(labelCol).toBeDefined();
    expect(labelCol.data_type).toBe('character varying');
    expect(labelCol.is_nullable).toBe('NO');

    // "order": INTEGER NOT NULL
    const orderCol = columnMap.get('order');
    expect(orderCol).toBeDefined();
    expect(orderCol.data_type).toBe('integer');
    expect(orderCol.is_nullable).toBe('NO');

    // description: TEXT NOT NULL
    const descCol = columnMap.get('description');
    expect(descCol).toBeDefined();
    expect(descCol.data_type).toBe('text');
    expect(descCol.is_nullable).toBe('NO');

    // created_at, updated_at: TIMESTAMPTZ
    const createdAtCol = columnMap.get('created_at');
    expect(createdAtCol).toBeDefined();
    expect(createdAtCol.data_type).toContain('timestamp');

    const updatedAtCol = columnMap.get('updated_at');
    expect(updatedAtCol).toBeDefined();
    expect(updatedAtCol.data_type).toContain('timestamp');
  });

  // Requirement 3.4: migration_log.content_type CHECK includes 'story_beat'
  test('migration_log.content_type CHECK constraint includes story_beat', async () => {
    const result = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'migration_log_content_type_check'
    `);

    expect(result.rows.length).toBe(1);
    const constraintDef = result.rows[0].def;
    expect(constraintDef).toContain("'story_beat'");
  });

  // Requirement 3.3, 3.6: processContentFile upserts every beat in story_beats.yaml
  test('processContentFile upserts all beats with correct data', async () => {
    // Load the canonical story_beats.yaml to get full expected data
    const yamlPath = path.join(CONTENT_DIR, 'story_beats.yaml');
    const yamlContent = await fs.readFile(yamlPath, 'utf-8');
    const beats = await readCanonicalBeats();
    const checksum = crypto.createHash('sha256').update(yamlContent).digest('hex');
    const expectedCount = beats.length;

    // Process the content file
    const result = await processContentFile(yamlPath);
    expect(result.contentType).toBe('story_beat');
    expect(result.contentId.split(',').length).toBe(expectedCount);

    // Record the migration (simulates what migrateContent does after processContentFile)
    await pool.query(
      'INSERT INTO migration_log (file_path, file_checksum, content_type, content_id) VALUES ($1, $2, $3, $4)',
      ['story_beats.yaml', checksum, 'story_beat', 'prologue']
    );

    // Verify all registry rows are present. beforeAll cleared the table, so the
    // count must match the yaml exactly with no extra or orphaned rows.
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM story_beats');
    expect(countResult.rows[0].count).toBe(expectedCount);

    // Verify each expected beat exists with correct order
    for (const expectedBeat of beats) {
      const beatResult = await pool.query(
        'SELECT slug, "order", label, description FROM story_beats WHERE slug = $1',
        [expectedBeat.slug]
      );

      expect(beatResult.rows.length).toBe(1);
      expect(beatResult.rows[0].slug).toBe(expectedBeat.slug);
      expect(beatResult.rows[0].order).toBe(expectedBeat.order);

      // Also verify label and description match the YAML
      expect(beatResult.rows[0].label).toBe(expectedBeat.label);
      expect(beatResult.rows[0].description).toBe(expectedBeat.description);
    }
  });

  // Requirement 3.5: migration_log gains a new row with content_type = 'story_beat'
  test('migration_log records story_beat migration entry', async () => {
    const result = await pool.query(`
      SELECT file_path, file_checksum, content_type, content_id
      FROM migration_log
      WHERE content_type = 'story_beat'
      ORDER BY applied_at DESC
      LIMIT 1
    `);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].file_path).toBe('story_beats.yaml');
    expect(result.rows[0].content_type).toBe('story_beat');

    // content_id should be the first slug (prologue) per the migration pattern
    expect(result.rows[0].content_id).toBe('prologue');
  });

  // Idempotency: upsert should not create duplicate rows
  test('processContentFile is idempotent - no duplicate rows on re-run', async () => {
    const yamlPath = path.join(CONTENT_DIR, 'story_beats.yaml');

    // Count rows before
    const countBefore = await pool.query('SELECT COUNT(*)::int AS count FROM story_beats');
    const countBeforeNum = countBefore.rows[0].count;

    // Run again
    await processContentFile(yamlPath);

    // Count rows after - should be the same
    const countAfter = await pool.query('SELECT COUNT(*)::int AS count FROM story_beats');
    expect(countAfter.rows[0].count).toBe(countBeforeNum);

    // Verify data is still correct
    const beatResult = await pool.query('SELECT label FROM story_beats WHERE slug = $1', ['prologue']);
    expect(beatResult.rows[0].label).toBe('Prologue');
  });

  // Individual beat file ingestion: process a single /story_beats/<slug>/...yaml
  test('processContentFile ingests individual beat file with correct slug and order', async () => {
    const individualBeatPath = path.join(
      CONTENT_DIR,
      'story_beats',
      'beat_sofia_alberto_risk',
      'story_beat_beat_sofia_alberto_risk.yaml',
    );

    const result = await processContentFile(individualBeatPath);
    expect(result.contentType).toBe('story_beat');
    expect(result.contentId).toBe('beat_sofia_alberto_risk');

    // Verify the persisted row has the order from the individual file (401, matching registry)
    const beatResult = await pool.query(
      'SELECT slug, "order", label, description FROM story_beats WHERE slug = $1',
      ['beat_sofia_alberto_risk'],
    );
    expect(beatResult.rows.length).toBe(1);
    expect(beatResult.rows[0].slug).toBe('beat_sofia_alberto_risk');
    expect(beatResult.rows[0].order).toBe(401);
    expect(beatResult.rows[0].label).toBe("Beat 2 — The Brother's Orbit");
    expect(beatResult.rows[0].description).toContain('intercept him');

    // Verify the cache was refreshed (mocked setCache should have been called with all slugs)
    const { setCache } = await import('../../src/database/redis.js');
    const cacheCall = (setCache as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'story_beats:slugs',
    );
    expect(cacheCall).toBeDefined();
    const cachedSlugs = cacheCall![1] as string[];
    expect(cachedSlugs).toContain('beat_sofia_alberto_risk');
    // Cache should contain all registry slugs (refreshed from the full table),
    // not just this one.
    const { rows: totalRows } = await pool.query('SELECT COUNT(*)::int AS c FROM story_beats');
    expect(cachedSlugs.length).toBe(totalRows[0].c);
  });
});