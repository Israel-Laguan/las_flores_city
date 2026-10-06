// BF-303: Postgres-backed FlagRegistry over planning.flag_definitions.
// Uses the existing oltpPool via queryOLTP — no new pools (AGENTS hard constraint).
// Type-only imports from api/planning keep the module free of a runtime dependency
// on the api/ build output.

import { queryOLTP } from '@las-flores/infra';
import type {
  CreateFlagInput,
  FlagDefinitionWithMetadata,
  FlagRegistry,
  FlagSemantics,
  RetireResult,
} from '@las-flores/api-planning';

interface FlagRow {
  slug: string;
  meaning: string;
  semantics: FlagSemantics;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'slug, meaning, semantics, created_at, updated_at';
const ORDER = 'ORDER BY created_at ASC, slug ASC';

function toFlag(row: FlagRow): FlagDefinitionWithMetadata {
  return {
    slug: row.slug,
    meaning: row.meaning,
    semantics: row.semantics,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PgFlagRegistry implements FlagRegistry {
  /** Slug format is enforced by the `_check_flag_slug` trigger; a duplicate by the PK. */
  async create(input: CreateFlagInput): Promise<FlagDefinitionWithMetadata> {
    try {
      const { rows } = await queryOLTP<FlagRow>(
        `INSERT INTO planning.flag_definitions (slug, meaning, semantics)
         VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
        [input.slug, input.meaning, input.semantics],
      );
      return toFlag(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new Error(`Flag with slug '${input.slug}' already exists`);
      }
      throw err;
    }
  }

  /** Includes retired flags (audit trail). */
  async get(slug: string): Promise<FlagDefinitionWithMetadata | undefined> {
    const { rows } = await queryOLTP<FlagRow>(
      `SELECT ${COLUMNS} FROM planning.flag_definitions WHERE slug = $1`,
      [slug],
    );
    return rows[0] ? toFlag(rows[0]) : undefined;
  }

  /** All flags, retired included. */
  async list(): Promise<FlagDefinitionWithMetadata[]> {
    const { rows } = await queryOLTP<FlagRow>(
      `SELECT ${COLUMNS} FROM planning.flag_definitions ${ORDER}`,
    );
    return rows.map(toFlag);
  }

  /** Active (non-retired) flags only. */
  async listBySemantics(semantics: FlagSemantics): Promise<FlagDefinitionWithMetadata[]> {
    const { rows } = await queryOLTP<FlagRow>(
      `SELECT ${COLUMNS} FROM planning.flag_definitions
       WHERE semantics = $1 AND retired_at IS NULL ${ORDER}`,
      [semantics],
    );
    return rows.map(toFlag);
  }

  async retire(slug: string): Promise<RetireResult> {
    // Single conditional UPDATE: two concurrent retires can't both report success.
    const { rowCount } = await queryOLTP(
      `UPDATE planning.flag_definitions SET retired_at = NOW()
       WHERE slug = $1 AND retired_at IS NULL`,
      [slug],
    );
    if (rowCount) {
      return { success: true, retiredSlug: slug };
    }
    const existing = await queryOLTP(
      'SELECT 1 FROM planning.flag_definitions WHERE slug = $1',
      [slug],
    );
    return existing.rowCount
      ? { success: false, retiredSlug: slug, error: `Flag '${slug}' is already retired` }
      : { success: false, error: `Flag '${slug}' not found` };
  }

  /** True only for existing, non-retired flags. */
  async exists(slug: string): Promise<boolean> {
    const { rowCount } = await queryOLTP(
      'SELECT 1 FROM planning.flag_definitions WHERE slug = $1 AND retired_at IS NULL',
      [slug],
    );
    return !!rowCount;
  }

  /** Active slugs, sorted. */
  async getAllSlugs(): Promise<string[]> {
    const { rows } = await queryOLTP<{ slug: string }>(
      'SELECT slug FROM planning.flag_definitions WHERE retired_at IS NULL ORDER BY slug',
    );
    return rows.map((r) => r.slug);
  }
}
