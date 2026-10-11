// api/planning/src/canon/scene-overlay-repository.ts
// SC-314: planning storage contract for scene overlays (`planning.scene_overlays`).
// Mirrors scene-def-repository.ts: create, read, list-by-base, upsertIfChanged, retire
// (never delete). Implemented by InMemorySceneOverlayRepository here; the Postgres
// adapter lives in server/src/planning (PgSceneOverlayRepository).
//
// Known parity gap: `base_scene_slug` is a foreign key in Postgres, so an overlay for an
// unknown scene is rejected by the database. The in-memory double does not model that
// FK; the integration suite (sceneOverlayRepository.pg.test.ts) covers it.

import { createHash } from 'node:crypto';
import {
  sceneOverlayFromJSON,
  sceneOverlayToJSON,
  stringifySceneOverlay,
  type SceneOverlay,
} from '@las-flores/api-contracts';
import type { RetireResult } from './flag-registry.js';
import type { UpsertResult } from './scene-def-repository.js';

/** A stored overlay plus the bookkeeping columns of `planning.scene_overlays`. */
export interface SceneOverlayRecord {
  /** Primary key. */
  slug: string;
  /** The scene this overlay layers onto (`planning.scene_overlays.base_scene_slug`). */
  baseSceneSlug: string;
  /** Precedence among active overlays on the same base; higher wins (SC-S13). */
  priority: number;
  /** The contract payload, parsed. */
  overlay: SceneOverlay;
  /** sha256 hex of the canonical overlay bytes — see `sceneOverlayContentHash`. */
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp once retired; `null` = active. Rows are never deleted. */
  retiredAt: string | null;
}

export interface ListSceneOverlaysOptions {
  /** Include retired overlays (audit view). Default: active only. */
  includeRetired?: boolean;
}

/** Thrown when a write targets a retired overlay slug: retirement is terminal. */
export class SceneOverlayRetiredError extends Error {
  constructor(slug: string) {
    super(`Scene overlay '${slug}' is retired and cannot be written`);
    this.name = 'SceneOverlayRetiredError';
  }
}

/**
 * Content hash of an overlay: sha256 (hex) of `stringifySceneOverlay`. Every
 * implementation MUST use this so `upsertIfChanged` agrees across adapters.
 */
export function sceneOverlayContentHash(overlay: SceneOverlay): string {
  return createHash('sha256').update(stringifySceneOverlay(overlay)).digest('hex');
}

/** Repository for scene overlays (`planning.scene_overlays`). Planning-only access. */
export interface SceneOverlayRepository {
  /**
   * Insert a new overlay. Validates it and throws `InvalidSceneOverlayError` if invalid.
   * Throws if the slug already exists, including a retired slug.
   */
  create(overlay: SceneOverlay): Promise<SceneOverlayRecord>;

  /** Get by slug; retired overlays are returned (with `retiredAt`) for the audit trail. */
  get(slug: string): Promise<SceneOverlayRecord | undefined>;

  /**
   * Overlays on one base scene, ordered by `priority` ascending then `slug` ascending
   * (compose order). Active only by default.
   */
  listByBase(baseSceneSlug: string, options?: ListSceneOverlaysOptions): Promise<SceneOverlayRecord[]>;

  /**
   * Insert, or update only when `content_hash` differs: identical content returns
   * `unchanged` and leaves `updatedAt` alone. Throws `SceneOverlayRetiredError` for a
   * retired slug.
   */
  upsertIfChanged(overlay: SceneOverlay): Promise<UpsertResult<SceneOverlayRecord>>;

  /**
   * Retire an overlay: stamps `retiredAt`, keeps the row. Unknown slug or double retire
   * returns `success: false` with an `error` instead of throwing.
   */
  retire(slug: string): Promise<RetireResult>;
}

/** Validates (tier 1) and normalises an overlay to its canonical, independent copy. */
export function normaliseSceneOverlay(overlay: SceneOverlay): SceneOverlay {
  return sceneOverlayFromJSON(sceneOverlayToJSON(overlay));
}

/** Copy of a stored record: a fetched row is the caller's own object, not live state. */
function copyRecord(record: SceneOverlayRecord): SceneOverlayRecord {
  return { ...record, overlay: normaliseSceneOverlay(record.overlay) };
}

/** In-memory implementation for unit tests. Must behave like the Postgres adapter. */
export class InMemorySceneOverlayRepository implements SceneOverlayRepository {
  private rows = new Map<string, SceneOverlayRecord>();

  async create(input: SceneOverlay): Promise<SceneOverlayRecord> {
    const overlay = normaliseSceneOverlay(input);
    if (this.rows.has(overlay.slug)) {
      throw new Error(`Scene overlay with slug '${overlay.slug}' already exists`);
    }
    const now = new Date().toISOString();
    const record: SceneOverlayRecord = {
      slug: overlay.slug,
      baseSceneSlug: overlay.base_scene_slug,
      priority: overlay.priority,
      overlay,
      contentHash: sceneOverlayContentHash(overlay),
      createdAt: now,
      updatedAt: now,
      retiredAt: null,
    };
    this.rows.set(overlay.slug, record);
    return copyRecord(record);
  }

  async get(slug: string): Promise<SceneOverlayRecord | undefined> {
    const record = this.rows.get(slug);
    return record ? copyRecord(record) : undefined;
  }

  async listByBase(baseSceneSlug: string, options: ListSceneOverlaysOptions = {}): Promise<SceneOverlayRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.baseSceneSlug === baseSceneSlug)
      .filter((r) => options.includeRetired === true || r.retiredAt === null)
      .sort((a, b) => a.priority - b.priority || a.slug.localeCompare(b.slug))
      .map(copyRecord);
  }

  async upsertIfChanged(input: SceneOverlay): Promise<UpsertResult<SceneOverlayRecord>> {
    const overlay = normaliseSceneOverlay(input);
    const existing = this.rows.get(overlay.slug);
    if (!existing) {
      return { status: 'created', record: await this.create(overlay) };
    }
    if (existing.retiredAt !== null) {
      throw new SceneOverlayRetiredError(overlay.slug);
    }
    const contentHash = sceneOverlayContentHash(overlay);
    if (existing.contentHash === contentHash) {
      return { status: 'unchanged', record: copyRecord(existing) };
    }
    const updated: SceneOverlayRecord = {
      ...existing,
      baseSceneSlug: overlay.base_scene_slug,
      priority: overlay.priority,
      overlay,
      contentHash,
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(overlay.slug, updated);
    return { status: 'updated', record: copyRecord(updated) };
  }

  async retire(slug: string): Promise<RetireResult> {
    const record = this.rows.get(slug);
    if (!record) {
      return { success: false, error: `Scene overlay '${slug}' not found` };
    }
    if (record.retiredAt !== null) {
      return { success: false, retiredSlug: slug, error: `Scene overlay '${slug}' is already retired` };
    }
    const now = new Date().toISOString();
    this.rows.set(slug, { ...record, retiredAt: now, updatedAt: now });
    return { success: true, retiredSlug: slug };
  }

  /** Clear all overlays (test cleanup). */
  clear(): void {
    this.rows.clear();
  }
}
