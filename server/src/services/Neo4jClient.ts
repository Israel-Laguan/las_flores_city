// ============================================================
// Neo4jClient — thin lazy singleton wrapper around the Neo4j bolt driver
//
// Following the infra pattern (see `@las-flores/infra` redis.ts/connection.ts):
// the driver is created lazily on first use so module import never opens a TCP
// handle, and every method is defensive so a boot-unreachable Neo4j can only
// skip, never abort `initializeServer()`.
//
// Neo4j is the sanctioned *authoring* IR (decision locked in M19) — NOT a
// player read/write pool. All player reads/writes stay on `oltpPool`. This
// client is reused by the graph substrate (M27), by M27-b's
// `Neo4jNeighborhoodProvider` + `:Conflict`/`:Suggestion` writes, and by M28's
// write/merge path.
//
// Feature flag: NEO4J_ENABLED (default OFF). When off/unreachable, `isEnabled()`
// is false and the query helpers short-circuit, leaving existing Postgres paths
// untouched.
// ============================================================

import neo4j, { type Driver, type Session, type ManagedTransaction } from 'neo4j-driver';

/** True only when NEO4J_ENABLED === 'true' (explicit opt-in). */
export function isNeo4jEnabled(): boolean {
  return process.env.NEO4J_ENABLED === 'true';
}

let _driver: Driver | null = null;

/** Lazy singleton driver. Callers MUST gate on `isEnabled()` first. */
export function getDriver(): Driver {
  if (!_driver) {
    _driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'neo4j',
      ),
    );
  }
  return _driver;
}

/**
 * Open a session. No-op guard: when the feature is disabled this throws a
 * `Neo4jDisabledError` so callers that did not check `isEnabled()` fail fast
 * with a clear, catchable reason instead of hanging on a dead bolt connection.
 */
export class Neo4jDisabledError extends Error {
  constructor() {
    super('Neo4j is disabled (NEO4J_ENABLED !== "true")');
    this.name = 'Neo4jDisabledError';
  }
}

export function session(): Session {
  if (!isNeo4jEnabled()) {
    throw new Neo4jDisabledError();
  }
  return getDriver().session();
}

/** Default database for queries (bolt://host:7687). */
export function defaultDatabaseName(): string {
  return process.env.NEO4J_DATABASE || 'neo4j';
}

/**
 * Run a single Cypher statement and return the rows as plain objects. Safe when
 * disabled — returns `[]` so graph consumers degrade to empty without throwing.
 */
export async function runNeo4jQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  if (!isNeo4jEnabled()) return [];
  const s = session();
  try {
    const result = await s.run(cypher, params);
    return result.records.map((record) => record.toObject() as T);
  } finally {
    await s.close();
  }
}

/**
 * Run a body within an autocommit transaction (each statement auto-commits).
 * Bounded convenience for bulk seed loops that want a single connection.
 * No-op when disabled: resolves `undefined` without touching the driver.
 */
export async function runNeo4jTransaction<T>(
  fn: (tx: ManagedTransaction) => Promise<T>,
): Promise<T | undefined> {
  if (!isNeo4jEnabled()) return undefined;
  const s = session();
  try {
    return await s.executeWrite(fn);
  } finally {
    await s.close();
  }
}

/**
 * Non-fatal connectivity check. Returns true when reachable; logs a warning and
 * returns false when disabled or unreachable — never throws, never aborts boot.
 */
export async function verifyNeo4j(): Promise<boolean> {
  if (!isNeo4jEnabled()) return false;
  try {
    await getDriver().verifyConnectivity();
    return true;
  } catch (err) {
    console.warn('[Neo4j] connectivity check failed (authoring graph unavailable):', (err as Error).message);
    return false;
  }
}

/** Close the driver (idempotent). Safe to call even if never opened. */
export async function closeNeo4j(): Promise<void> {
  if (!_driver) return;
  const driver = _driver;
  _driver = null;
  try {
    await driver.close();
  } catch (err) {
    console.warn('[Neo4j] error closing driver:', (err as Error).message);
  }
}
