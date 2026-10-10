// api/planning/src/canon/personality-pool-repository.ts
// SC-306: planning storage for personality pools (`planning.personality_pools`) and the
// many-to-many link from characters to pools (`planning.character_pools`).
// Pools: create, read, list, upsertIfChanged, retire (never delete) — the same contract shape
// as scene defs. Links: idempotent `link`, and reads from both sides.
// Implemented in memory here; the Postgres adapters are in server/src/planning.
//
// Parity note: in Postgres a link to an unknown pool is rejected by a foreign key and a link to
// a retired pool by the INSERT's own WHERE; the in-memory double checks the pool repository.
// The shared contract suite covers both.

import { createHash } from 'node:crypto';
import {
  InvalidPersonalityPoolError,
  PERSONALITY_POOL_SCHEMA_VERSION,
  isValidSlug,
  personalityPoolFromJSON,
  personalityPoolToJSON,
  stringifyPersonalityPool,
  validatePersonalityPool,
  type PersonalityPool,
} from '@las-flores/api-contracts';
import type { RetireResult } from './flag-registry.js';
import type { UpsertResult } from './scene-def-repository.js';

/** A stored pool plus the bookkeeping columns of `planning.personality_pools`. */
export interface PersonalityPoolRecord {
  slug: string;
  schemaVersion: number;
  pool: PersonalityPool;
  /** sha256 hex of the canonical pool bytes — see `personalityPoolContentHash`. */
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp once retired; `null` = active. Rows are never deleted. */
  retiredAt: string | null;
}

export interface ListPersonalityPoolsOptions {
  /** Include retired pools (audit view). Default: active only. */
  includeRetired?: boolean;
}

/** Thrown when a write targets a retired pool slug: retirement is terminal. */
export class PersonalityPoolRetiredError extends Error {
  constructor(slug: string) {
    super(`Personality pool '${slug}' is retired and cannot be written`);
    this.name = 'PersonalityPoolRetiredError';
  }
}

/** sha256 (hex) of `stringifyPersonalityPool`. Every implementation MUST use this. */
export function personalityPoolContentHash(pool: PersonalityPool): string {
  return createHash('sha256').update(stringifyPersonalityPool(pool)).digest('hex');
}

/** Validates (tier 1, throwing InvalidPersonalityPoolError) and normalises to an independent copy. */
export function normalisePersonalityPool(pool: PersonalityPool): PersonalityPool {
  const { issues } = validatePersonalityPool(personalityPoolToJSON(pool));
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new InvalidPersonalityPoolError(errors);
  return personalityPoolFromJSON(personalityPoolToJSON(pool));
}

export interface PersonalityPoolRepository {
  /** Inserts a new pool; throws if the slug exists (retired included) or the pool is invalid. */
  create(pool: PersonalityPool): Promise<PersonalityPoolRecord>;
  /** Retired pools are returned (with `retiredAt`) for the audit trail. */
  get(slug: string): Promise<PersonalityPoolRecord | undefined>;
  /** Pools ordered by `createdAt` ascending (slug breaks ties). Active only by default. */
  list(options?: ListPersonalityPoolsOptions): Promise<PersonalityPoolRecord[]>;
  /** Insert, or update only when the content hash differs. Throws PersonalityPoolRetiredError for a retired slug. */
  upsertIfChanged(pool: PersonalityPool): Promise<UpsertResult<PersonalityPoolRecord>>;
  /** Stamps `retiredAt`, keeps the row. Unknown slug / double retire return `success: false`. */
  retire(slug: string): Promise<RetireResult>;
}

/** Thrown by `link` for an unknown pool, a retired pool, or a malformed slug. */
export class PoolLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoolLinkError';
  }
}

export type LinkStatus = 'linked' | 'already_linked';

/**
 * The many-to-many link between characters and pools. A character may use 0..n pools and a pool
 * may serve 0..n characters; sharing is the point — no per-character copy of a pool exists.
 * `character_slug` is a plain slug (the legacy `characters` table is not mirrored into planning).
 */
export interface CharacterPoolRepository {
  /** Idempotent. Throws PoolLinkError for an unknown or retired pool or a malformed slug. */
  link(characterSlug: string, poolSlug: string): Promise<LinkStatus>;
  /** ACTIVE pools the character uses, ordered by pool slug. Retired pools drop out. */
  poolsFor(characterSlug: string): Promise<PersonalityPoolRecord[]>;
  /** Character slugs linked to the pool (whether or not the pool is retired), sorted. */
  charactersFor(poolSlug: string): Promise<string[]>;
}

function copyRecord(record: PersonalityPoolRecord): PersonalityPoolRecord {
  return { ...record, pool: personalityPoolFromJSON(personalityPoolToJSON(record.pool)) };
}

export class InMemoryPersonalityPoolRepository implements PersonalityPoolRepository {
  private rows = new Map<string, PersonalityPoolRecord>();

  async create(input: PersonalityPool): Promise<PersonalityPoolRecord> {
    const pool = normalisePersonalityPool(input);
    if (this.rows.has(pool.slug)) throw new Error(`Personality pool with slug '${pool.slug}' already exists`);
    const now = new Date().toISOString();
    const record: PersonalityPoolRecord = {
      slug: pool.slug,
      schemaVersion: PERSONALITY_POOL_SCHEMA_VERSION,
      pool,
      contentHash: personalityPoolContentHash(pool),
      createdAt: now,
      updatedAt: now,
      retiredAt: null,
    };
    this.rows.set(pool.slug, record);
    return copyRecord(record);
  }

  async get(slug: string): Promise<PersonalityPoolRecord | undefined> {
    const r = this.rows.get(slug);
    return r ? copyRecord(r) : undefined;
  }

  async list(options: ListPersonalityPoolsOptions = {}): Promise<PersonalityPoolRecord[]> {
    return [...this.rows.values()]
      .filter((r) => options.includeRetired === true || r.retiredAt === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.slug.localeCompare(b.slug))
      .map(copyRecord);
  }

  async upsertIfChanged(input: PersonalityPool): Promise<UpsertResult<PersonalityPoolRecord>> {
    const pool = normalisePersonalityPool(input);
    const existing = this.rows.get(pool.slug);
    if (!existing) return { status: 'created', record: await this.create(pool) };
    if (existing.retiredAt !== null) throw new PersonalityPoolRetiredError(pool.slug);
    const contentHash = personalityPoolContentHash(pool);
    if (existing.contentHash === contentHash) return { status: 'unchanged', record: copyRecord(existing) };
    const updated: PersonalityPoolRecord = { ...existing, pool, contentHash, updatedAt: new Date().toISOString() };
    this.rows.set(pool.slug, updated);
    return { status: 'updated', record: copyRecord(updated) };
  }

  async retire(slug: string): Promise<RetireResult> {
    const r = this.rows.get(slug);
    if (!r) return { success: false, error: `Personality pool '${slug}' not found` };
    if (r.retiredAt !== null) return { success: false, retiredSlug: slug, error: `Personality pool '${slug}' is already retired` };
    const now = new Date().toISOString();
    this.rows.set(slug, { ...r, retiredAt: now, updatedAt: now });
    return { success: true, retiredSlug: slug };
  }

  /** Clear all pools (test cleanup). */
  clear(): void {
    this.rows.clear();
  }
}

export class InMemoryCharacterPoolRepository implements CharacterPoolRepository {
  private links = new Set<string>(); // `${character}\u0000${pool}`

  constructor(private readonly pools: PersonalityPoolRepository) {}

  async link(characterSlug: string, poolSlug: string): Promise<LinkStatus> {
    if (!isValidSlug(characterSlug)) throw new PoolLinkError(`'${characterSlug}' is not a valid character slug`);
    const pool = await this.pools.get(poolSlug);
    if (pool === undefined) throw new PoolLinkError(`personality pool '${poolSlug}' does not exist`);
    if (pool.retiredAt !== null) throw new PoolLinkError(`personality pool '${poolSlug}' is retired`);
    const key = `${characterSlug}\u0000${poolSlug}`;
    if (this.links.has(key)) return 'already_linked';
    this.links.add(key);
    return 'linked';
  }

  async poolsFor(characterSlug: string): Promise<PersonalityPoolRecord[]> {
    const out: PersonalityPoolRecord[] = [];
    for (const key of this.links) {
      const [c, p] = key.split('\u0000');
      if (c !== characterSlug) continue;
      const record = await this.pools.get(p);
      if (record !== undefined && record.retiredAt === null) out.push(record);
    }
    return out.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  }

  async charactersFor(poolSlug: string): Promise<string[]> {
    return [...this.links]
      .map((k) => k.split('\u0000'))
      .filter(([, p]) => p === poolSlug)
      .map(([c]) => c)
      .sort();
  }
}
