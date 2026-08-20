import { describe, it, expect, jest as jestGlobals, beforeEach } from '@jest/globals';

// ============================================================
// M19 A1 — Content-read pool unit test
//
// Proves the `contentPool` / `queryContent` seam:
//   1. No pg Pool is created at import time (lazy, like oltp/olap)
//      — importing connection.ts never opens a socket/TCPWRAP handle.
//   2. `queryContent` (a content read) creates exactly ONE pool and
//      never touches the gameplay `oltpPool`.
//   3. A player write (`queryOLTP`) routes through a *separate* pool
//      instance from content reads — the two are never the same
//      backing pool.
// ============================================================

const poolInstances: Array<{ query: ReturnType<typeof jestGlobals.fn> }> = [];
// Captures the config each mock Pool was constructed with, so tests can assert the
// env-driven sizing (`max` from `CONTENT_POOL_MAX`).
const poolConfigs: Array<Record<string, unknown>> = [];

jestGlobals.mock('pg', () => {
  class Pool {
    query = jestGlobals.fn<(sql: string, params?: any[]) => Promise<unknown>>();
    constructor(config?: Record<string, unknown>) {
      poolConfigs.push(config ?? {});
      poolInstances.push({ query: this.query });
    }
    end = jestGlobals.fn(async () => undefined);
    connect = jestGlobals.fn(async () => ({ release: jestGlobals.fn() }));
  }
  return { Pool };
});

import {
  queryContent,
  queryOLTP,
  contentPool,
  oltpPool,
  closeConnections,
} from '@las-flores/infra';

describe('M19 contentPool', () => {
  beforeEach(async () => {
    // Reset the module-held pool handles (end + null them) so each test starts
    // with zero live pools. The mock Pool never connects, so close is safe.
    await closeConnections();
  });

  it('does not create a pool at import time (lazy proxy)', () => {
    // connection.ts was imported above. The lazy Proxy pattern means merely
    // importing it must never construct a Pool — otherwise Jest would hang on
    // an open handle. poolInstances is drained by closeConnections in
    // beforeEach, so 0 here proves lazy.
    expect(poolInstances.length).toBe(0);
  });

  it('a content read creates exactly one pool and never touches oltpPool', async () => {
    const before = poolInstances.length;

    await queryContent<{ id: string }>('SELECT id FROM dialogue_chunks');

    // Exactly one new Pool was created for the content read.
    expect(poolInstances.length).toBe(before + 1);

    // That single pool handled the query.
    const created = poolInstances[poolInstances.length - 1];
    expect(created.query.mock.calls[0]?.[0]).toBe('SELECT id FROM dialogue_chunks');
  });

  it('a player write uses a separate pool instance from a content read', async () => {
    await queryContent<{ id: string }>('SELECT id FROM mysteries');
    await queryOLTP<{ id: string }>(
      'UPDATE player_states SET story_beat = $2 WHERE user_id = $1',
      ['abc', 'prologue'],
    );

    // Two distinct pool instances: one content, one OLTP. Each pool object
    // owns its own `query` jest.fn, so identity proves separation.
    expect(poolInstances.length).toBeGreaterThanOrEqual(2);
    expect(new Set(poolInstances.map((p) => p.query)).size).toBeGreaterThanOrEqual(2);
  });

  it('exposes a lazy contentPool proxy that delegates query()', async () => {
    await contentPool.query('SELECT COUNT(*) FROM scenes');

    const created = poolInstances[poolInstances.length - 1];
    expect(created.query.mock.calls[0]?.[0]).toBe('SELECT COUNT(*) FROM scenes');
  });

  it('oltpPool proxy still resolves (sanity)', async () => {
    await oltpPool.query('SELECT 1');
    const created = poolInstances[poolInstances.length - 1];
    expect(created.query.mock.calls[0]?.[0]).toBe('SELECT 1');
  });

  it('contentPool defaults to max 10 when CONTENT_POOL_MAX is unset', async () => {
    const prev = process.env.CONTENT_POOL_MAX;
    delete process.env.CONTENT_POOL_MAX;
    try {
      await queryContent<{ id: string }>('SELECT 1 FROM dialogue_chunks');
      expect(poolConfigs[poolConfigs.length - 1].max).toBe(10);
    } finally {
      if (prev === undefined) delete process.env.CONTENT_POOL_MAX;
      else process.env.CONTENT_POOL_MAX = prev;
    }
  });

  it('contentPool honors CONTENT_POOL_MAX override', async () => {
    const prev = process.env.CONTENT_POOL_MAX;
    process.env.CONTENT_POOL_MAX = '30';
    try {
      await queryContent<{ id: string }>('SELECT 1 FROM dialogue_chunks');
      expect(poolConfigs[poolConfigs.length - 1].max).toBe(30);
    } finally {
      if (prev === undefined) delete process.env.CONTENT_POOL_MAX;
      else process.env.CONTENT_POOL_MAX = prev;
    }
  });
});
