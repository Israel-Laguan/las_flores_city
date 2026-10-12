// SC-M3 T2 (SC-502): Postgres-backed RevisionReader over publish.revisions / revision_entries /
// active_revision (migration 105). READ ONLY, `runtime`-role compatible (SELECT grants only).
// `getRevision` is what revision-scoped lookup uses; `getActive` exists for session creation (SC-504)
// and is never called by lookup. Defaults to oltpPool via queryOLTP; the query function is injectable.

import { queryOLTP } from '@las-flores/infra';
import { isRevisionId, normaliseManifest, type ActiveRevision, type Revision, type RevisionId, type RevisionReader } from '@las-flores/api-contracts';
import type { QueryFn } from '../planning/PgArtifactStore.js';

export class PgRevisionReader implements RevisionReader {
  constructor(private readonly query: QueryFn = queryOLTP) {}

  async getActive(): Promise<ActiveRevision | undefined> {
    const { rows } = await this.query('SELECT revision_id, flipped_at FROM publish.active_revision WHERE singleton');
    return rows[0] ? { revision_id: rows[0].revision_id, flipped_at: rows[0].flipped_at.toISOString() } : undefined;
  }

  async getRevision(id: RevisionId): Promise<Revision | undefined> {
    if (!isRevisionId(id)) return undefined;
    const head = await this.query('SELECT revision_id, parent_revision_id, manifest_hash, note, created_at FROM publish.revisions WHERE revision_id = $1', [id]);
    if (!head.rows[0]) return undefined;
    const entries = await this.query('SELECT artifact_type, name, artifact_id FROM publish.revision_entries WHERE revision_id = $1', [id]);
    return {
      revision_id: head.rows[0].revision_id,
      parent_revision_id: head.rows[0].parent_revision_id,
      manifest: normaliseManifest(entries.rows),
      manifest_hash: head.rows[0].manifest_hash,
      note: head.rows[0].note,
      created_at: head.rows[0].created_at.toISOString(),
    };
  }
}
