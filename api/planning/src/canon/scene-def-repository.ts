// api/planning/src/canon/scene-def-repository.ts
// SC-311: planning storage contract for scene definitions (`planning.scene_defs`).
// Repository supports create, read, list, upsertIfChanged, retire (never delete).
// Implemented by InMemorySceneDefRepository here; the Postgres adapter is F1
// (server/src/planning), exactly as FlagRegistry/PgFlagRegistry were done (SC-202/BF-303).
//
// Scope: SceneDef only. `planning.scene_overlays` exists in migration 101 but its
// repository waits for the SceneOverlay contract (Group E, E1).

import { createHash } from 'node:crypto';
import {
  InvalidSceneDefError,
  SCENE_SCHEMA_VERSION,
  sceneDefFromJSON,
  sceneDefToJSON,
  stringifySceneDef,
  validateScene,
  type SceneDef,
} from '@las-flores/api-contracts';
import type { RetireResult } from './flag-registry.js';

/** A stored scene plus the bookkeeping columns of `planning.scene_defs`. */
export interface SceneDefRecord {
  /** Primary key. */
  slug: string;
  /** Schema version the payload was written with (`SCENE_SCHEMA_VERSION`). */
  schemaVersion: number;
  /** The contract payload (`payload jsonb`), parsed. */
  scene: SceneDef;
  /** sha256 hex of the canonical payload bytes — see `sceneDefContentHash`. */
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp once retired; `null` = active. Rows are never deleted. */
  retiredAt: string | null;
}

export type UpsertStatus = 'created' | 'updated' | 'unchanged';

export interface UpsertResult {
  status: UpsertStatus;
  record: SceneDefRecord;
}

export interface ListSceneDefsOptions {
  /** Include retired scenes (audit view). Default: active only. */
  includeRetired?: boolean;
}

/** Thrown when a write targets a retired slug: retirement is terminal. */
export class SceneDefRetiredError extends Error {
  constructor(slug: string) {
    super(`Scene def '${slug}' is retired and cannot be written`);
    this.name = 'SceneDefRetiredError';
  }
}

/**
 * Content hash of a scene: sha256 (hex) of `stringifySceneDef` — sorted keys, no
 * undefined, so it is independent of property order. Every implementation MUST use this
 * so `upsertIfChanged` agrees across adapters; it is the seed of SC-403's idempotency.
 */
export function sceneDefContentHash(scene: SceneDef): string {
  return createHash('sha256').update(stringifySceneDef(scene)).digest('hex');
}

/**
 * Repository for scene definitions (`planning.scene_defs`). Only the planning module
 * has access to it; runtime never reads canon tables (it reads compiled artifacts).
 */
export interface SceneDefRepository {
  /**
   * Insert a new scene. Validates the scene (tier 1) and throws `InvalidSceneDefError`
   * if invalid. Throws if the slug already exists — including a retired slug.
   */
  create(scene: SceneDef): Promise<SceneDefRecord>;

  /** Get by slug; retired scenes are returned (with `retiredAt`) for the audit trail. */
  get(slug: string): Promise<SceneDefRecord | undefined>;

  /** Scenes ordered by `createdAt` ascending (slug breaks ties). Active only by default. */
  list(options?: ListSceneDefsOptions): Promise<SceneDefRecord[]>;

  /**
   * Insert, or update only when `content_hash` differs: identical content returns
   * `unchanged` and leaves `updatedAt` alone. Validates like `create`. Throws
   * `SceneDefRetiredError` for a retired slug.
   */
  upsertIfChanged(scene: SceneDef): Promise<UpsertResult>;

  /**
   * Retire a scene: stamps `retiredAt`, keeps the row (never delete). Unknown slug or
   * double retire returns `success: false` with an `error` instead of throwing.
   */
  retire(slug: string): Promise<RetireResult>;
}

/** Validates (tier 1) and normalises a scene to its canonical, independent copy. */
function normalise(scene: SceneDef): SceneDef {
  const { issues } = validateScene(sceneDefToJSON(scene));
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new InvalidSceneDefError(errors);
  return sceneDefFromJSON(sceneDefToJSON(scene));
}

/** Copy of a stored record: a fetched row is the caller's own object, not live state. */
function copyRecord(record: SceneDefRecord): SceneDefRecord {
  return { ...record, scene: sceneDefFromJSON(sceneDefToJSON(record.scene)) };
}

/**
 * In-memory implementation for unit tests that don't need a database. Must behave
 * like the Postgres adapter — `sceneRepositoryContract` runs against both.
 */
export class InMemorySceneDefRepository implements SceneDefRepository {
  private rows = new Map<string, SceneDefRecord>();

  async create(input: SceneDef): Promise<SceneDefRecord> {
    const scene = normalise(input);
    if (this.rows.has(scene.slug)) {
      throw new Error(`Scene def with slug '${scene.slug}' already exists`);
    }
    const now = new Date().toISOString();
    const record: SceneDefRecord = {
      slug: scene.slug,
      schemaVersion: SCENE_SCHEMA_VERSION,
      scene,
      contentHash: sceneDefContentHash(scene),
      createdAt: now,
      updatedAt: now,
      retiredAt: null,
    };
    this.rows.set(scene.slug, record);
    return copyRecord(record);
  }

  async get(slug: string): Promise<SceneDefRecord | undefined> {
    const record = this.rows.get(slug);
    return record ? copyRecord(record) : undefined;
  }

  async list(options: ListSceneDefsOptions = {}): Promise<SceneDefRecord[]> {
    return [...this.rows.values()]
      .filter((r) => options.includeRetired === true || r.retiredAt === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.slug.localeCompare(b.slug))
      .map(copyRecord);
  }

  async upsertIfChanged(input: SceneDef): Promise<UpsertResult> {
    const scene = normalise(input);
    const existing = this.rows.get(scene.slug);
    if (!existing) {
      return { status: 'created', record: await this.create(scene) };
    }
    if (existing.retiredAt !== null) {
      throw new SceneDefRetiredError(scene.slug);
    }
    const contentHash = sceneDefContentHash(scene);
    if (existing.contentHash === contentHash) {
      return { status: 'unchanged', record: copyRecord(existing) };
    }
    const updated: SceneDefRecord = {
      ...existing,
      scene,
      schemaVersion: SCENE_SCHEMA_VERSION,
      contentHash,
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(scene.slug, updated);
    return { status: 'updated', record: copyRecord(updated) };
  }

  async retire(slug: string): Promise<RetireResult> {
    const record = this.rows.get(slug);
    if (!record) {
      return { success: false, error: `Scene def '${slug}' not found` };
    }
    if (record.retiredAt !== null) {
      return { success: false, retiredSlug: slug, error: `Scene def '${slug}' is already retired` };
    }
    const now = new Date().toISOString();
    this.rows.set(slug, { ...record, retiredAt: now, updatedAt: now });
    return { success: true, retiredSlug: slug };
  }

  /** Clear all scenes (test cleanup). */
  clear(): void {
    this.rows.clear();
  }
}
