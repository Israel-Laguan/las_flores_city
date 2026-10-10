// SC-314: Postgres-backed SceneOverlayRepository over planning.scene_overlays.
// Uses the existing oltpPool via queryOLTP — no new pools (AGENTS hard constraint).
//
// Self-contained in server/src/planning so it can relocate into the `db` package later.
// Runtime imports from api/ are deliberate: the content hash and normalisation must match
// InMemorySceneOverlayRepository exactly (see PgSceneDefRepository for the same rule).

import { queryOLTP } from '@las-flores/infra';
import { sceneOverlayFromJSON, sceneOverlayToJSON, type SceneOverlay } from '@las-flores/api-contracts';
import {
  normaliseSceneOverlay,
  sceneOverlayContentHash,
  SceneOverlayRetiredError,
  type ListSceneOverlaysOptions,
  type RetireResult,
  type SceneOverlayRecord,
  type SceneOverlayRepository,
  type UpsertResult,
} from '@las-flores/api-planning';

interface SceneOverlayRow {
  slug: string;
  base_scene_slug: string;
  priority: number;
  payload: Record<string, unknown>;
  content_hash: string;
  created_at: Date;
  updated_at: Date;
  retired_at: Date | null;
}

const COLUMNS = 'slug, base_scene_slug, priority, payload, content_hash, created_at, updated_at, retired_at';

function toRecord(row: SceneOverlayRow): SceneOverlayRecord {
  return {
    slug: row.slug,
    baseSceneSlug: row.base_scene_slug,
    priority: row.priority,
    overlay: sceneOverlayFromJSON(row.payload),
    contentHash: row.content_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    retiredAt: row.retired_at ? row.retired_at.toISOString() : null,
  };
}

function paramsOf(overlay: SceneOverlay): unknown[] {
  return [
    overlay.slug,
    overlay.base_scene_slug,
    overlay.priority,
    JSON.stringify(sceneOverlayToJSON(overlay)),
    sceneOverlayContentHash(overlay),
  ];
}

/** 23503 = foreign_key_violation: the base scene does not exist. */
function baseSceneError(err: unknown, overlay: SceneOverlay): unknown {
  if ((err as { code?: string }).code === '23503') {
    return new Error(`Base scene '${overlay.base_scene_slug}' does not exist`);
  }
  return err;
}

export class PgSceneOverlayRepository implements SceneOverlayRepository {
  async create(input: SceneOverlay): Promise<SceneOverlayRecord> {
    const overlay = normaliseSceneOverlay(input);
    try {
      const { rows } = await queryOLTP<SceneOverlayRow>(
        `INSERT INTO planning.scene_overlays (slug, base_scene_slug, priority, payload, content_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        paramsOf(overlay),
      );
      return toRecord(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new Error(`Scene overlay with slug '${overlay.slug}' already exists`);
      }
      throw baseSceneError(err, overlay);
    }
  }

  /** Includes retired overlays (audit trail). */
  async get(slug: string): Promise<SceneOverlayRecord | undefined> {
    const { rows } = await queryOLTP<SceneOverlayRow>(
      `SELECT ${COLUMNS} FROM planning.scene_overlays WHERE slug = $1`,
      [slug],
    );
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  async listByBase(baseSceneSlug: string, options: ListSceneOverlaysOptions = {}): Promise<SceneOverlayRecord[]> {
    const retired = options.includeRetired === true ? '' : 'AND retired_at IS NULL';
    const { rows } = await queryOLTP<SceneOverlayRow>(
      `SELECT ${COLUMNS} FROM planning.scene_overlays
       WHERE base_scene_slug = $1 ${retired}
       ORDER BY priority ASC, slug ASC`,
      [baseSceneSlug],
    );
    return rows.map(toRecord);
  }

  /**
   * Same single-statement shape as PgSceneDefRepository.upsertIfChanged: the conflict
   * branch fires only for a changed hash on an active row.
   */
  async upsertIfChanged(input: SceneOverlay): Promise<UpsertResult<SceneOverlayRecord>> {
    const overlay = normaliseSceneOverlay(input);
    let rows: (SceneOverlayRow & { inserted: boolean })[];
    try {
      ({ rows } = await queryOLTP<SceneOverlayRow & { inserted: boolean }>(
        `INSERT INTO planning.scene_overlays (slug, base_scene_slug, priority, payload, content_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE
           SET base_scene_slug = EXCLUDED.base_scene_slug,
               priority = EXCLUDED.priority,
               payload = EXCLUDED.payload,
               content_hash = EXCLUDED.content_hash
           WHERE planning.scene_overlays.content_hash IS DISTINCT FROM EXCLUDED.content_hash
             AND planning.scene_overlays.retired_at IS NULL
         RETURNING ${COLUMNS}, (xmax = 0) AS inserted`,
        paramsOf(overlay),
      ));
    } catch (err) {
      throw baseSceneError(err, overlay);
    }
    if (rows[0]) {
      return { status: rows[0].inserted ? 'created' : 'updated', record: toRecord(rows[0]) };
    }
    // No row written: the slug is retired, or its content is already current.
    const existing = await this.get(overlay.slug);
    if (!existing) {
      throw new Error(`Scene overlay '${overlay.slug}' vanished during upsert`);
    }
    if (existing.retiredAt !== null) {
      throw new SceneOverlayRetiredError(overlay.slug);
    }
    return { status: 'unchanged', record: existing };
  }

  async retire(slug: string): Promise<RetireResult> {
    const { rowCount } = await queryOLTP(
      `UPDATE planning.scene_overlays SET retired_at = NOW()
       WHERE slug = $1 AND retired_at IS NULL`,
      [slug],
    );
    if (rowCount) {
      return { success: true, retiredSlug: slug };
    }
    const existing = await queryOLTP('SELECT 1 FROM planning.scene_overlays WHERE slug = $1', [slug]);
    return existing.rowCount
      ? { success: false, retiredSlug: slug, error: `Scene overlay '${slug}' is already retired` }
      : { success: false, error: `Scene overlay '${slug}' not found` };
  }
}
