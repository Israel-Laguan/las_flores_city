import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { WEATHER_TAGS } from '@las-flores/api-contracts';
import { queryOLTP } from '@las-flores/infra';
import os from 'node:os';
import { processContentFile } from '../../src/content/upsert.js';
import { withSchemaLock } from '../helpers/schemaLock.js';

// Collision-avoidance: this suite's district rows use the e9800000-* UUID block
// and the 'zz-weather-test' slug prefix; no other suite touches them.
const TEST_ID = 'e9800000-0000-4000-8000-000000000001';
const TEST_SLUG = 'zz-weather-test';

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  await withSchemaLock(async (client) => {
    await client.query(sql);
  });
}

describe('098 districts.weather', () => {
  beforeAll(async () => {
    await applyMigration('098_districts_weather.sql');
    await queryOLTP('DELETE FROM districts WHERE id = $1', [TEST_ID]);
  });

  afterAll(async () => {
    await queryOLTP('DELETE FROM districts WHERE id = $1', [TEST_ID]);
  });

  test('is idempotent (re-apply is a no-op)', async () => {
    await expect(applyMigration('098_districts_weather.sql')).resolves.toBeUndefined();
    await expect(applyMigration('098_districts_weather.sql')).resolves.toBeUndefined();
  });

  test('column is text NOT NULL DEFAULT clear', async () => {
    const r = await queryOLTP<{ data_type: string; is_nullable: string; column_default: string }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'districts' AND column_name = 'weather'`
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].data_type).toBe('text');
    expect(r.rows[0].is_nullable).toBe('NO');
    expect(r.rows[0].column_default).toContain('clear');
  });

  test('every district row has a valid weather tag', async () => {
    const r = await queryOLTP<{ weather: string }>('SELECT weather FROM districts');
    for (const row of r.rows) {
      expect(WEATHER_TAGS as readonly string[]).toContain(row.weather);
    }
  });

  test('new districts default to clear', async () => {
    await queryOLTP(
      `INSERT INTO districts (id, name, slug, x, y) VALUES ($1, 'Zz Weather Test', $2, 99, 99)`,
      [TEST_ID, TEST_SLUG]
    );
    const r = await queryOLTP<{ weather: string }>('SELECT weather FROM districts WHERE id = $1', [TEST_ID]);
    expect(r.rows[0].weather).toBe('clear');
  });

  test('CHECK rejects an unknown tag', async () => {
    await expect(
      queryOLTP('UPDATE districts SET weather = $1 WHERE id = $2', ['plasma', TEST_ID])
    ).rejects.toThrow(/districts_weather_check/);
  });

  test('NOT NULL rejects null', async () => {
    await expect(
      queryOLTP('UPDATE districts SET weather = NULL WHERE id = $1', [TEST_ID])
    ).rejects.toThrow(/null value/);
  });

  test('re-applying the migration does not clobber an authored value', async () => {
    await queryOLTP('UPDATE districts SET weather = $1 WHERE id = $2', ['storm', TEST_ID]);
    await applyMigration('098_districts_weather.sql');
    const r = await queryOLTP<{ weather: string }>('SELECT weather FROM districts WHERE id = $1', [TEST_ID]);
    expect(r.rows[0].weather).toBe('storm');
  });

  test('SQL CHECK list matches the contract vocabulary exactly', () => {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), 'src/database/migrations/098_districts_weather.sql'),
      'utf-8'
    );
    const m = sql.match(/CHECK \(weather IN \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const tags = m![1].split(',').map((t) => t.trim().replace(/'/g, ''));
    expect([...tags].sort()).toEqual([...WEATHER_TAGS].sort());
  });

  describe('content upsert (SC-309c)', () => {
    let tmpDir: string;
    const writeDistrict = (slug: string, body: string): string => {
      const dir = path.join(tmpDir, 'districts', slug);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `district_${slug}.yaml`);
      fs.writeFileSync(file, body);
      return file;
    };

    beforeAll(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'district-weather-'));
      await queryOLTP(
        `INSERT INTO districts (id, name, slug, x, y) VALUES ($1, 'Zz Weather Test', $2, 99, 99)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_ID, TEST_SLUG]
      );
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('YAML weather round-trips into districts.weather', async () => {
      const file = writeDistrict(TEST_SLUG, `type: district\nslug: ${TEST_SLUG}\nweather: rain\n`);
      const applied = await processContentFile(file);
      expect(applied.contentType).toBe('district');
      const r = await queryOLTP<{ weather: string }>('SELECT weather FROM districts WHERE id = $1', [TEST_ID]);
      expect(r.rows[0].weather).toBe('rain');
    });

    test('absent weather keeps the existing value', async () => {
      const file = writeDistrict(TEST_SLUG, `type: district\nslug: ${TEST_SLUG}\n`);
      await processContentFile(file);
      const r = await queryOLTP<{ weather: string }>('SELECT weather FROM districts WHERE id = $1', [TEST_ID]);
      expect(r.rows[0].weather).toBe('rain');
    });

    test('invalid tag is rejected and the row is unchanged', async () => {
      const file = writeDistrict(TEST_SLUG, `type: district\nslug: ${TEST_SLUG}\nweather: plasma\n`);
      await expect(processContentFile(file)).rejects.toThrow(/plasma/);
      const r = await queryOLTP<{ weather: string }>('SELECT weather FROM districts WHERE id = $1', [TEST_ID]);
      expect(r.rows[0].weather).toBe('rain');
    });

    test('unknown district slug fails loudly', async () => {
      const file = writeDistrict('zz-nonexistent', 'type: district\nslug: zz-nonexistent\nweather: fog\n');
      await expect(processContentFile(file)).rejects.toThrow(/not found/);
    });
  });
});
