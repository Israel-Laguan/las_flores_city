import { describe, it, expect } from '@jest/globals';
import { mergeStatsClamped } from '../../src/database/repositories/PlayerStateRepository.write.js';

// ============================================================
// Regression tests for mergeStatsClamped SQL generation
//
// Guards against re-introducing the "multiple assignments to the
// same column" bug: when an effect carries two or more stat keys,
// the previous `setClauses.join(', ')` approach produced
//   UPDATE ... SET stats = jsonb_set(...), stats = jsonb_set(...)
// which PostgreSQL rejects with
//   ERROR: multiple assignments to "stats" column
//
// These tests mock the pg PoolClient (no real DB connection) and
// assert the generated UPDATE assigns `stats` exactly once.
// ============================================================

function captureClient() {
  let capturedSql = '';
  let capturedParams: any[] = [];
  const fakeClient = {
    async query(sql: string, params?: any[]) {
      capturedSql = sql;
      capturedParams = params ?? [];
      return { rows: [] };
    },
  };
  return { fakeClient, getSql: () => capturedSql, getParams: () => capturedParams };
}

describe('mergeStatsClamped — single UPDATE, single stats assignment', () => {
  it('composes two relationship-stat keys into one nested jsonb_set (no duplicate column assignment)', async () => {
    const { fakeClient, getSql, getParams } = captureClient();

    await mergeStatsClamped(fakeClient as any, 'user-1', {
      adeyemi_trust: 10,
      adeyemi_familiarity: 5,
    });

    const sql = getSql();

    // The UPDATE must assign `stats` exactly once. PostgreSQL rejects
    // multiple assignments to the same target column in one UPDATE.
    expect(sql).toMatch(/^UPDATE player_states SET stats = /);
    // A regression to `stats = ..., stats = ...` would reintroduce the
    // "multiple assignments to same column" error.
    expect(sql).not.toContain(', stats =');

    // Both keys are nested into a single jsonb_set chain (innermost
    // COALESCE is the base, each key wraps the previous expression).
    expect(sql).toContain("'{adeyemi_trust}'");
    expect(sql).toContain("'{adeyemi_familiarity}'");

    // Params: [userId, delta_trust, delta_familiarity]
    expect(getParams()).toEqual(['user-1', 10, 5]);
  });

  it('emits exactly one `stats =` assignment for many keys', async () => {
    const { fakeClient, getSql } = captureClient();

    await mergeStatsClamped(fakeClient as any, 'user-1', {
      adeyemi_trust: 1,
      adeyemi_familiarity: 2,
      adeyemi_alignment: 3,
      adeyemi_tension: 4,
    });

    const sql = getSql();
    // Count column-assignment occurrences of ` stats =` (with the
    // leading space that separates it from the preceding token). The
    //nested jsonb_set form assigns stats exactly once.
    const assignments = (sql.match(/ stats = /g) ?? []).length;
    expect(assignments).toBe(1);
  });

  it('clamps bounded relationship stats via GREATEST/LEAST', async () => {
    const { fakeClient, getSql } = captureClient();

    await mergeStatsClamped(fakeClient as any, 'user-1', {
      adeyemi_trust: 999, // bounded: trust min -100, max 100
      adeyemi_familiarity: 999, // bounded: familiarity min 0, max 100
    });

    const sql = getSql();
    // trust: GREATEST(LEAST(..., 100), -100)
    expect(sql).toContain('LEAST(');
    expect(sql).toContain(', 100)');
    expect(sql).toContain(', -100)');
    // familiarity: GREATEST(LEAST(..., 100), 0)
    expect(sql).toContain(', 0)');
  });

  it('does not clamp unbounded (non-relationship) stats', async () => {
    const { fakeClient, getSql, getParams } = captureClient();

    await mergeStatsClamped(fakeClient as any, 'user-1', {
      some_other_stat: 7,
    });

    const sql = getSql();
    expect(sql).not.toContain('GREATEST');
    expect(sql).not.toContain('LEAST');
    expect(getParams()).toEqual(['user-1', 7]);
  });

  it('is a no-op for an empty stat set (no UPDATE issued)', async () => {
    let queryCalled = false;
    const fakeClient = {
      async query() {
        queryCalled = true;
        return { rows: [] };
      },
    };

    await mergeStatsClamped(fakeClient as any, 'user-1', {});
    expect(queryCalled).toBe(false);
  });

  it('preserves additive semantics: each delta reads the pre-update column value', async () => {
    const { fakeClient, getSql } = captureClient();

    await mergeStatsClamped(fakeClient as any, 'user-1', {
      adeyemi_trust: 10,
      adeyemi_familiarity: 5,
    });

    const sql = getSql();
    // Each key's value expression reads `stats->>'<key>' (the original
    // column value, since PostgreSQL evaluates SET expressions against
    // the pre-update row), so deltas add to the original stat rather
    // than chaining onto a sibling key's result.
    expect(sql).toContain("(stats->>'adeyemi_trust')");
    expect(sql).toContain("(stats->>'adeyemi_familiarity')");
  });
});
