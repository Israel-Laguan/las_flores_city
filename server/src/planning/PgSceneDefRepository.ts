// SC-314: Postgres-backed SceneDefRepository over planning.scene_defs.
// Uses the existing oltpPool via queryOLTP — no new pools (AGENTS hard constraint).
//
// Self-contained in server/src/planning so it can relocate into the `db` package later.
// Runtime imports from api/ are deliberate, not persistence: the content hash and the
// tier-1 normalisation must match InMemorySceneDefRepository byte for byte, so they come
// from the same functions instead of being reimplemented here.

import { queryOLTP } from '@las-flores/infra';
import { SCENE_SCHEMA_VERSION, sceneDefFromJSON, sceneDefToJSON, type SceneDef } from '@las-flores/api-contracts';
import {
  normaliseSceneDef,
  sceneDefContentHash,
  SceneDefRetiredError,
  type ListSceneDefsOptions,
  type RetireResult,
  type SceneDefRecord,
  type SceneDefRepository,
  type UpsertResult,
} from '@las-flores/api-planning';

interface SceneDefRow {
  slug: string;
  schema_version: number;
  payload: Record<string, unknown>;
  content_hash: string;
  created_at: Date;
  updated_at: Date;
  retired_at: Date | null;
}

const COLUMNS = 'slug, schema_version, payload, content_hash, created_at, updated_at, retired_at';

function toRecord(row: SceneDefRow): SceneDefRecord {
  return {
    slug: row.slug,
    schemaVersion: row.schema_version,
    scene: sceneDefFromJSON(row.payload),
    contentHash: row.content_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    retiredAt: row.retired_at ? row.retired_at.toISOString() : null,
  };
}

function payloadOf(scene: SceneDef): string {
  return JSON.stringify(sceneDefToJSON(scene));
}

export class PgSceneDefRepository implements SceneDefRepository {
  /** Slug format is enforced by the table CHECK; a duplicate (retired included) by the PK. */
  async create(input: SceneDef): Promise<SceneDefRecord> {
    const scene = normaliseSceneDef(input);
    try {
      const { rows } = await queryOLTP<SceneDefRow>(
        `INSERT INTO planning.scene_defs (slug, schema_version, payload, content_hash)
         VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [scene.slug, SCENE_SCHEMA_VERSION, payloadOf(scene), sceneDefContentHash(scene)],
      );
      return toRecord(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new Error(`Scene def with slug '${scene.slug}' already exists`);
      }
      throw err;
    }
  }

  /** Includes retired scenes (audit trail). */
  async get(slug: string): Promise<SceneDefRecord | undefined> {
    const { rows } = await queryOLTP<SceneDefRow>(
      `SELECT ${COLUMNS} FROM planning.scene_defs WHERE slug = $1`,
      [slug],
    );
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  async list(options: ListSceneDefsOptions = {}): Promise<SceneDefRecord[]> {
    const where = options.includeRetired === true ? '' : 'WHERE retired_at IS NULL';
    const { rows } = await queryOLTP<SceneDefRow>(
      `SELECT ${COLUMNS} FROM planning.scene_defs ${where}
       ORDER BY created_at ASC, slug ASC`,
    );
    return rows.map(toRecord);
  }

  /**
   * One statement: the conflict branch only fires when the hash differs and the row is
   * active, so an unchanged scene is a skip, not a rewrite (no `updated_at` trigger run).
   * `xmax = 0` is true only for a freshly inserted row, which tells created from updated.
   */
  async upsertIfChanged(input: SceneDef): Promise<UpsertResult> {
    const scene = normaliseSceneDef(input);
    const { rows } = await queryOLTP<SceneDefRow & { inserted: boolean }>(
      `INSERT INTO planning.scene_defs (slug, schema_version, payload, content_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
         SET schema_version = EXCLUDED.schema_version,
             payload = EXCLUDED.payload,
             content_hash = EXCLUDED.content_hash
         WHERE planning.scene_defs.content_hash IS DISTINCT FROM EXCLUDED.content_hash
           AND planning.scene_defs.retired_at IS NULL
       RETURNING ${COLUMNS}, (xmax = 0) AS inserted`,
      [scene.slug, SCENE_SCHEMA_VERSION, payloadOf(scene), sceneDefContentHash(scene)],
    );
    if (rows[0]) {
      return { status: rows[0].inserted ? 'created' : 'updated', record: toRecord(rows[0]) };
    }
    // No row written: the slug is retired, or its content is already current.
    const existing = await this.get(scene.slug);
    if (!existing) {
      throw new Error(`Scene def '${scene.slug}' vanished during upsert`);
    }
    if (existing.retiredAt !== null) {
      throw new SceneDefRetiredError(scene.slug);
    }
    return { status: 'unchanged', record: existing };
  }

  /** Single conditional UPDATE: two concurrent retires cannot both report success. */
  async retire(slug: string): Promise<RetireResult> {
    const { rowCount } = await queryOLTP(
      `UPDATE planning.scene_defs SET retired_at = NOW()
       WHERE slug = $1 AND retired_at IS NULL`,
      [slug],
    );
    if (rowCount) {
      return { success: true, retiredSlug: slug };
    }
    const existing = await queryOLTP('SELECT 1 FROM planning.scene_defs WHERE slug = $1', [slug]);
    return existing.rowCount
      ? { success: false, retiredSlug: slug, error: `Scene def '${slug}' is already retired` }
      : { success: false, error: `Scene def '${slug}' not found` };
  }
}
