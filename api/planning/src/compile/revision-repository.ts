// api/planning/src/compile/revision-repository.ts
// SC-404/406 (D1): revisions, the compare-and-swap pointer, and the atomic publish.
// A port: the Postgres adapter is server/src/planning/PgRevisionRepository.ts (schema
// `publish`, migration 105). The contract types live in api/contracts/src/revision.

import {
  RevisionArtifactMissingError,
  isRevisionId,
  manifestHash,
  normaliseManifest,
  type ActiveRevision,
  type CreateRevisionInput,
  type FlipInput,
  type FlipRecord,
  type FlipResult,
  type ManifestEntry,
  type Revision,
  type RevisionId,
  type RevisionManifest,
  type RevisionReader,
  type RevisionWriter,
} from '@las-flores/api-contracts';
import { randomUUID } from 'node:crypto';
import { InMemoryArtifactStore, verifyArtifactRecord, type ArtifactRecord, type PutManyResult } from './artifact-store.js';

export interface PublishInput {
  /** The COMPLETE artifact set of the new revision (a compile covers every active scene). */
  records: ReadonlyArray<ArtifactRecord>;
  /** The revision the caller believes is active now (`null` = none). Compare-and-swap. */
  expectedActive: RevisionId | null;
  note?: string | null;
}

export type PublishResult =
  | {
      ok: true;
      revision: Revision;
      /** What the flip replaced (null on the first publish). */
      previous: RevisionId | null;
      active: ActiveRevision;
      artifacts: PutManyResult;
    }
  | { ok: false; code: Extract<FlipResult, { ok: false }>['code']; actual: RevisionId | null; message: string };

/**
 * Revisions + pointer. `publish` is the one operation that writes artifacts, creates the
 * revision and moves the pointer, as ONE atomic step: either all of it happens or none of
 * it does (no orphan artifacts, no inert revision, pointer untouched). A stale
 * `expectedActive` fails the publish and writes nothing.
 */
export interface RevisionRepository extends RevisionReader, RevisionWriter {
  publish(input: PublishInput): Promise<PublishResult>;
}

/** The manifest a set of artifact records implies: (artifact_type, name) -> artifact_id. */
export function manifestFromRecords(records: ReadonlyArray<ArtifactRecord>): RevisionManifest {
  const entries: ManifestEntry[] = records.map((r) => ({
    artifact_type: r.artifact.artifact_type,
    name: r.artifact.name,
    artifact_id: r.artifact.artifact_id,
  }));
  return normaliseManifest(entries);
}

const copyRevision = (r: Revision): Revision => ({ ...r, manifest: { entries: r.manifest.entries.map((e) => ({ ...e })) } });

/** In-memory implementation. Must behave like the Postgres adapter: `revisionRepositoryContract` runs against both. */
export class InMemoryRevisionRepository implements RevisionRepository {
  private revisions = new Map<RevisionId, Revision>();
  private active: ActiveRevision | undefined;
  private flips: FlipRecord[] = [];
  /** Serialises operations: the in-memory equivalent of the database's row lock. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: InMemoryArtifactStore) {}

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }

  async getActive(): Promise<ActiveRevision | undefined> {
    return this.active ? { ...this.active } : undefined;
  }

  async getRevision(id: RevisionId): Promise<Revision | undefined> {
    const r = this.revisions.get(id);
    return r ? copyRevision(r) : undefined;
  }

  createRevision(input: CreateRevisionInput): Promise<Revision> {
    return this.serial(() => this.create(input));
  }

  private async create(input: CreateRevisionInput): Promise<Revision> {
    const manifest = normaliseManifest(input.manifest.entries);
    const ids = manifest.entries.map((e) => e.artifact_id);
    const present = await this.store.has(ids);
    const missing = [...new Set(ids)].filter((id) => !present.has(id)).sort();
    if (missing.length > 0) throw new RevisionArtifactMissingError(missing);
    const parent = input.parentRevisionId ?? null;
    if (parent !== null && !this.revisions.has(parent)) throw new Error(`parent revision '${parent}' does not exist`);
    const revision: Revision = {
      revision_id: randomUUID(),
      parent_revision_id: parent,
      manifest,
      manifest_hash: manifestHash(manifest),
      note: input.note ?? null,
      created_at: new Date().toISOString(),
    };
    this.revisions.set(revision.revision_id, revision);
    return copyRevision(revision);
  }

  flip(input: FlipInput): Promise<FlipResult> {
    return this.serial(async () => this.doFlip(input));
  }

  private doFlip({ to, expectedActive }: FlipInput): FlipResult {
    const actual = this.active?.revision_id ?? null;
    const fail = (code: 'conflict' | 'unknown_revision' | 'already_active', message: string): FlipResult => ({ ok: false, code, actual, message });
    if (!isRevisionId(to) || !this.revisions.has(to)) return fail('unknown_revision', `revision '${to}' does not exist`);
    if (expectedActive === to) {
      return actual === to ? fail('already_active', `revision '${to}' is already active`) : fail('conflict', `expected '${to}' to be active, but ${actual === null ? 'nothing' : `'${actual}'`} is`);
    }
    if (expectedActive !== actual) {
      return fail('conflict', `expected ${expectedActive === null ? 'no active revision' : `'${expectedActive}'`}, but ${actual === null ? 'nothing' : `'${actual}'`} is active`);
    }
    const flippedAt = new Date().toISOString();
    this.active = { revision_id: to, flipped_at: flippedAt };
    this.flips.push({ flip_id: this.flips.length + 1, from_revision_id: actual, to_revision_id: to, flipped_at: flippedAt });
    return { ok: true, previous: actual, active: { ...this.active } };
  }

  async listFlips(limit = 100): Promise<FlipRecord[]> {
    return [...this.flips].reverse().slice(0, limit).map((f) => ({ ...f }));
  }

  publish(input: PublishInput): Promise<PublishResult> {
    return this.serial(async () => {
      // Validate everything that can throw BEFORE any write, so a bad call changes nothing.
      for (const r of input.records) verifyArtifactRecord(r);
      const manifest = manifestFromRecords(input.records);
      const actual = this.active?.revision_id ?? null;
      if (input.expectedActive !== actual) {
        return {
          ok: false,
          code: 'conflict',
          actual,
          message: `expected ${input.expectedActive === null ? 'no active revision' : `'${input.expectedActive}'`}, but ${actual === null ? 'nothing' : `'${actual}'`} is active`,
        } satisfies PublishResult;
      }
      const artifacts = await this.store.putMany(input.records);
      const revision = await this.create({ manifest, parentRevisionId: input.expectedActive, note: input.note ?? null });
      const flipped = this.doFlip({ to: revision.revision_id, expectedActive: input.expectedActive });
      if (!flipped.ok) throw new Error(`publish flip failed unexpectedly: ${flipped.message}`);
      return { ok: true, revision, previous: flipped.previous, active: flipped.active, artifacts };
    });
  }
}
