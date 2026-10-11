// api/contracts/src/revision/revision.ts
// SC-404 (D1): revisions and the active-revision pointer.
//
// Replaces the earlier per-entity `RevisionPointer` contract (never implemented or used) with
// the model architecture.md §4 actually describes: a REVISION is an immutable manifest over a
// set of artifacts, and exactly ONE pointer says which revision is active. Per-entity pointers
// could not flip a multi-scene plan atomically, and a session pinned to one entity's revision
// would see a mixed world.
//
// Rules (all enforced by the implementations' shared contract suite):
// - Revisions are immutable and inert: creating one never changes what runtime sees.
// - The pointer moves only by `flip`, which is COMPARE-AND-SWAP: the caller states the
//   revision it believes is active (`expectedActive`, `null` = none yet). On mismatch nothing
//   changes and the result says what is actually active. There is no "flip whatever is active".
// - Rollback is not a special operation: it is a flip back to an earlier revision.
// - Planning writes; runtime has the read interface only.

import { isArtifactId, type ArtifactId, type ArtifactType } from '../artifact/artifact.js';
import { sha256Hex } from '../artifact/scene-artifact.js';

/** UUID of a revision (assigned by the store when the revision is created). */
export type RevisionId = string;

const REVISION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isRevisionId = (value: unknown): value is RevisionId => typeof value === 'string' && REVISION_ID.test(value);

/** One artifact in a revision, addressed by what it is (`artifact_type` + `name`). */
export interface ManifestEntry {
  artifact_type: ArtifactType;
  name: string;
  artifact_id: ArtifactId;
}

/** The artifact set of a revision: sorted by (artifact_type, name), unique on that pair. */
export interface RevisionManifest {
  entries: ManifestEntry[];
}

export class InvalidManifestError extends Error {
  constructor(message: string) {
    super(`Invalid revision manifest: ${message}`);
    this.name = 'InvalidManifestError';
  }
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Canonical manifest: entries sorted by (artifact_type, name). Rejects a non-canonical artifact
 * id and two entries for the same (artifact_type, name) — a name resolves to exactly one artifact
 * in a revision. An identical repeated entry is collapsed.
 */
export function normaliseManifest(entries: ReadonlyArray<ManifestEntry>): RevisionManifest {
  const byKey = new Map<string, ManifestEntry>();
  for (const e of entries) {
    if (!isArtifactId(e.artifact_id)) throw new InvalidManifestError(`'${e.artifact_id}' is not an artifact id`);
    if (typeof e.name !== 'string' || e.name === '') throw new InvalidManifestError('entry name must be non-empty');
    const key = `${e.artifact_type}\u0000${e.name}`;
    const existing = byKey.get(key);
    if (existing !== undefined && existing.artifact_id !== e.artifact_id) {
      throw new InvalidManifestError(`${e.artifact_type} '${e.name}' maps to two different artifacts`);
    }
    byKey.set(key, { artifact_type: e.artifact_type, name: e.name, artifact_id: e.artifact_id });
  }
  return { entries: [...byKey.values()].sort((a, b) => cmp(a.artifact_type, b.artifact_type) || cmp(a.name, b.name)) };
}

/** sha256 hex of the canonical manifest JSON. Equal manifests hash equal; informational, not identity. */
export function manifestHash(manifest: RevisionManifest): string {
  return sha256Hex(
    JSON.stringify(normaliseManifest(manifest.entries).entries.map((e) => ({ artifact_id: e.artifact_id, artifact_type: e.artifact_type, name: e.name }))),
  );
}

export interface Revision {
  revision_id: RevisionId;
  /** The revision this one was built from (informational lineage), or null. */
  parent_revision_id: RevisionId | null;
  manifest: RevisionManifest;
  manifest_hash: string;
  note: string | null;
  /** ISO 8601 UTC. */
  created_at: string;
}

export interface ActiveRevision {
  revision_id: RevisionId;
  /** ISO 8601 UTC: when the pointer last moved. */
  flipped_at: string;
}

export type FlipFailureCode =
  /** `expectedActive` is not what is active. Nothing changed. */
  | 'conflict'
  /** `to` is not a revision. Nothing changed. */
  | 'unknown_revision'
  /** `to` is already active (flipping to it would only add noise to the log). Nothing changed. */
  | 'already_active';

export type FlipResult =
  | { ok: true; previous: RevisionId | null; active: ActiveRevision }
  | { ok: false; code: FlipFailureCode; /** What is active right now (null = nothing). */ actual: RevisionId | null; message: string };

/** One row of the append-only flip log, newest first when listed. */
export interface FlipRecord {
  flip_id: number;
  from_revision_id: RevisionId | null;
  to_revision_id: RevisionId;
  flipped_at: string;
}

export interface FlipInput {
  /** The revision to make active. */
  to: RevisionId;
  /** The revision the caller believes is active now; `null` = the caller believes none is. Required. */
  expectedActive: RevisionId | null;
}

export interface CreateRevisionInput {
  manifest: RevisionManifest;
  parentRevisionId?: RevisionId | null;
  note?: string | null;
}

/** Thrown by `createRevision` when a manifest names an artifact that is not stored. */
export class RevisionArtifactMissingError extends Error {
  readonly missing: ArtifactId[];
  constructor(missing: ArtifactId[]) {
    super(`Revision references ${missing.length} artifact(s) that are not stored: ${missing.join(', ')}`);
    this.name = 'RevisionArtifactMissingError';
    this.missing = missing;
  }
}

/**
 * Read side: everything runtime may do. Runtime has SELECT on these tables and nothing else;
 * it cannot create revisions or move the pointer.
 */
export interface RevisionReader {
  /** The active revision pointer, or undefined before the first flip. */
  getActive(): Promise<ActiveRevision | undefined>;
  getRevision(id: RevisionId): Promise<Revision | undefined>;
}

/** Write side: planning only. */
export interface RevisionWriter {
  /** Stores an inert revision. Does not change what is active. */
  createRevision(input: CreateRevisionInput): Promise<Revision>;
  /** Compare-and-swap move of the pointer. Atomic: it either fully happens or changes nothing. */
  flip(input: FlipInput): Promise<FlipResult>;
  /** The flip log, newest first. */
  listFlips(limit?: number): Promise<FlipRecord[]>;
}
