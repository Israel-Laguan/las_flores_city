import { describe, test, expect } from '@jest/globals';
import { oltpPool } from '@las-flores/infra';
import { validateFlagSlug } from '@las-flores/api-contracts';

// SC-318 (m-85): slug parity between the SQL trigger `planning._validate_flag_slug()`
// (migration 096) and the TypeScript `validateFlagSlug` (api/contracts). Both enforce the
// same identifier rule; this drives identical candidates through both and fails on any
// disagreement, naming both sides.
//
// Each candidate is inserted inside one transaction that is rolled back, so no rows persist.
// Only the trigger's own rejection (SQLSTATE P0001, RAISE EXCEPTION) counts as "SQL rejects";
// any other error is rethrown so an unrelated failure cannot pass as a rejection.
const CANDIDATES = [
  'valid_slug',
  'A',
  '_',
  '_1',
  'a1',
  '1abc',
  'a-b',
  'a b',
  'a.b',
  'é',
  'a\n',
  '',
  'x'.repeat(256),
  'x'.repeat(257),
];

const RAISE_EXCEPTION = 'P0001';

function tsAccepts(slug: string): boolean {
  try {
    validateFlagSlug(slug);
    return true;
  } catch {
    return false;
  }
}

describe('flag slug parity: 096 SQL trigger vs validateFlagSlug (SC-318)', () => {
  test('both sides accept and reject exactly the same slugs', async () => {
    const client = await oltpPool.connect();
    const drifts: string[] = [];
    const sqlVerdicts = new Set<boolean>();
    try {
      await client.query('BEGIN');
      for (const slug of CANDIDATES) {
        await client.query('SAVEPOINT slug_probe');
        let sqlAccepts = true;
        try {
          await client.query(
            `INSERT INTO planning.flag_definitions (slug, meaning, semantics)
             VALUES ($1, 'slug parity probe', 'latching')`,
            [slug],
          );
        } catch (err) {
          if ((err as { code?: string }).code !== RAISE_EXCEPTION) throw err;
          sqlAccepts = false;
        }
        await client.query('ROLLBACK TO SAVEPOINT slug_probe');
        const tsOk = tsAccepts(slug);
        sqlVerdicts.add(sqlAccepts);
        if (sqlAccepts !== tsOk) {
          drifts.push(
            `${JSON.stringify(slug)}: SQL _validate_flag_slug (096) ${sqlAccepts ? 'accepts' : 'rejects'}, ` +
              `validateFlagSlug (api/contracts) ${tsOk ? 'accepts' : 'rejects'}`,
          );
        }
      }
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    // Guard against a vacuous pass: the candidates must exercise both verdicts.
    expect(sqlVerdicts).toEqual(new Set([true, false]));
    expect(drifts).toEqual([]);
  });
});
