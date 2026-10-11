// SC-306: Postgres-backed PersonalityPoolRepository and CharacterPoolRepository over
// planning.personality_pools / planning.character_pools (migration 106).
// Uses the existing oltpPool via queryOLTP — no new pools (AGENTS hard constraint).
// The content hash and tier-1 normalisation come from api/planning/contracts so they match
// the in-memory implementation byte for byte.

import { queryOLTP } from '@las-flores/infra';
import {
  PERSONALITY_POOL_SCHEMA_VERSION,
  isValidSlug,
  personalityPoolFromJSON,
  personalityPoolToJSON,
  type PersonalityPool,
} from '@las-flores/api-contracts';
import {
  PersonalityPoolRetiredError,
  PoolLinkError,
  normalisePersonalityPool,
  personalityPoolContentHash,
  type CharacterPoolRepository,
  type LinkStatus,
  type ListPersonalityPoolsOptions,
  type PersonalityPoolRecord,
  type PersonalityPoolRepository,
  type RetireResult,
  type UpsertResult,
} from '@las-flores/api-planning';

interface PoolRow {
  slug: string;
  schema_version: number;
  payload: Record<string, unknown>;
  content_hash: string;
  created_at: Date;
  updated_at: Date;
  retired_at: Date | null;
}

const COLUMNS = 'slug, schema_version, payload, content_hash, created_at, updated_at, retired_at';
const P_COLUMNS = COLUMNS.split(', ').map((c) => `p.${c}`).join(', ');

function toRecord(row: PoolRow): PersonalityPoolRecord {
  return {
    slug: row.slug,
    schemaVersion: row.schema_version,
    pool: personalityPoolFromJSON(row.payload),
    contentHash: row.content_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    retiredAt: row.retired_at ? row.retired_at.toISOString() : null,
  };
}

const payloadOf = (pool: PersonalityPool): string => JSON.stringify(personalityPoolToJSON(pool));

export class PgPersonalityPoolRepository implements PersonalityPoolRepository {
  async create(input: PersonalityPool): Promise<PersonalityPoolRecord> {
    const pool = normalisePersonalityPool(input);
    try {
      const { rows } = await queryOLTP<PoolRow>(
        `INSERT INTO planning.personality_pools (slug, schema_version, payload, content_hash)
         VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [pool.slug, PERSONALITY_POOL_SCHEMA_VERSION, payloadOf(pool), personalityPoolContentHash(pool)],
      );
      return toRecord(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new Error(`Personality pool with slug '${pool.slug}' already exists`);
      throw err;
    }
  }

  async get(slug: string): Promise<PersonalityPoolRecord | undefined> {
    const { rows } = await queryOLTP<PoolRow>(`SELECT ${COLUMNS} FROM planning.personality_pools WHERE slug = $1`, [slug]);
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  async list(options: ListPersonalityPoolsOptions = {}): Promise<PersonalityPoolRecord[]> {
    const where = options.includeRetired === true ? '' : 'WHERE retired_at IS NULL';
    const { rows } = await queryOLTP<PoolRow>(`SELECT ${COLUMNS} FROM planning.personality_pools ${where} ORDER BY created_at ASC, slug ASC`);
    return rows.map(toRecord);
  }

  /** One statement; the conflict branch fires only when the hash differs and the row is active. */
  async upsertIfChanged(input: PersonalityPool): Promise<UpsertResult<PersonalityPoolRecord>> {
    const pool = normalisePersonalityPool(input);
    const { rows } = await queryOLTP<PoolRow & { inserted: boolean }>(
      `INSERT INTO planning.personality_pools (slug, schema_version, payload, content_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
         SET schema_version = EXCLUDED.schema_version,
             payload = EXCLUDED.payload,
             content_hash = EXCLUDED.content_hash
         WHERE planning.personality_pools.content_hash IS DISTINCT FROM EXCLUDED.content_hash
           AND planning.personality_pools.retired_at IS NULL
       RETURNING ${COLUMNS}, (xmax = 0) AS inserted`,
      [pool.slug, PERSONALITY_POOL_SCHEMA_VERSION, payloadOf(pool), personalityPoolContentHash(pool)],
    );
    if (rows[0]) return { status: rows[0].inserted ? 'created' : 'updated', record: toRecord(rows[0]) };
    const existing = await this.get(pool.slug);
    if (!existing) throw new Error(`Personality pool '${pool.slug}' vanished during upsert`);
    if (existing.retiredAt !== null) throw new PersonalityPoolRetiredError(pool.slug);
    return { status: 'unchanged', record: existing };
  }

  /** Single conditional UPDATE: two concurrent retires cannot both report success. */
  async retire(slug: string): Promise<RetireResult> {
    const { rowCount } = await queryOLTP('UPDATE planning.personality_pools SET retired_at = NOW() WHERE slug = $1 AND retired_at IS NULL', [slug]);
    if (rowCount) return { success: true, retiredSlug: slug };
    const existing = await queryOLTP('SELECT 1 FROM planning.personality_pools WHERE slug = $1', [slug]);
    return existing.rowCount
      ? { success: false, retiredSlug: slug, error: `Personality pool '${slug}' is already retired` }
      : { success: false, error: `Personality pool '${slug}' not found` };
  }
}

export class PgCharacterPoolRepository implements CharacterPoolRepository {
  /**
   * One statement: inserts only when the pool exists AND is active (the SELECT's WHERE), and the
   * composite primary key makes a repeat a no-op. When nothing was inserted, a follow-up read
   * tells "already linked" from "unknown/retired pool".
   */
  async link(characterSlug: string, poolSlug: string): Promise<LinkStatus> {
    if (!isValidSlug(characterSlug)) throw new PoolLinkError(`'${characterSlug}' is not a valid character slug`);
    const { rowCount } = await queryOLTP(
      `INSERT INTO planning.character_pools (character_slug, pool_slug)
       SELECT $1, slug FROM planning.personality_pools WHERE slug = $2 AND retired_at IS NULL
       ON CONFLICT (character_slug, pool_slug) DO NOTHING`,
      [characterSlug, poolSlug],
    );
    if (rowCount) return 'linked';
    const pool = await queryOLTP<{ retired_at: Date | null }>('SELECT retired_at FROM planning.personality_pools WHERE slug = $1', [poolSlug]);
    if (pool.rowCount === 0) throw new PoolLinkError(`personality pool '${poolSlug}' does not exist`);
    // Linking a retired pool always fails, even if the link already existed.
    if (pool.rows[0].retired_at !== null) throw new PoolLinkError(`personality pool '${poolSlug}' is retired`);
    return 'already_linked';
  }

  async poolsFor(characterSlug: string): Promise<PersonalityPoolRecord[]> {
    const { rows } = await queryOLTP<PoolRow>(
      `SELECT ${P_COLUMNS} FROM planning.character_pools l
         JOIN planning.personality_pools p ON p.slug = l.pool_slug
        WHERE l.character_slug = $1 AND p.retired_at IS NULL
        ORDER BY p.slug`,
      [characterSlug],
    );
    return rows.map(toRecord);
  }

  async charactersFor(poolSlug: string): Promise<string[]> {
    const { rows } = await queryOLTP<{ character_slug: string }>(
      'SELECT character_slug FROM planning.character_pools WHERE pool_slug = $1 ORDER BY character_slug',
      [poolSlug],
    );
    return rows.map((r) => r.character_slug);
  }
}
