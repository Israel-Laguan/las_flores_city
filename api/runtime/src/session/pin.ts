// api/runtime/src/session/pin.ts
// SC-504: the session pin is CLIENT-owned (localStorage), so it survives outages and a dead
// laptop. The server keeps no session state: it hands out the active revision id once, and every
// later request carries the pin back. The pin is only an id; revisions and artifacts are immutable,
// so re-presenting it later resolves byte-identically. A pin that no longer names a revision is a
// typed `revision_missing`, never a fallback to the active pointer (R10/R12).

import type { RevisionId, RevisionReader } from '@las-flores/api-contracts';
import { ArtifactLookupError, type RevisionManifestReader } from '../resolve/lookup.js';

export class NoActiveRevisionError extends Error {
  readonly code = 'no_active_revision' as const;
  constructor() {
    super('no_active_revision: nothing has been published yet');
    this.name = 'NoActiveRevisionError';
  }
}

export interface SessionStart {
  /** The revision the client should store as its pin. */
  revisionId: RevisionId;
  /** When the pointer moved to it (informational). */
  flippedAt: string;
}

/** Reads the pointer ONCE (one statement, one snapshot) and returns the revision to pin. */
export async function startSession(revisions: Pick<RevisionReader, 'getActive'>): Promise<SessionStart> {
  const active = await revisions.getActive();
  if (active === undefined) throw new NoActiveRevisionError();
  return { revisionId: active.revision_id, flippedAt: active.flipped_at };
}

/** Validates a client-supplied pin. Unknown / malformed => revision_missing; never substitutes another revision. */
export async function requirePinnedRevision(revisions: RevisionManifestReader, revisionId: RevisionId): Promise<void> {
  if ((await revisions.getRevision(revisionId)) === undefined) {
    throw new ArtifactLookupError('revision_missing', revisionId, `pinned revision ${revisionId} does not exist`);
  }
}
