import { describe, test, expect, beforeEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import type { RevisionId, RevisionReader } from '@las-flores/api-contracts';
import type { ArtifactRecord, RevisionRepository } from '@las-flores/api-planning';
import { ArtifactLookupError, NoActiveRevisionError, RevisionScopedLookup, requirePinnedRevision, startSession } from '@las-flores/api-runtime';
import { fixtureRecord } from './artifactStoreContract.js';

/**
 * Shared contract for client-owned session pins (SC-504). The pin lives in the CLIENT (localStorage),
 * so the server stores nothing: `startSession` reads the active revision once and returns its id,
 * and every later lookup is addressed by the pin the client sends back. `repo` is the planning side
 * used to publish fixtures and flip the pointer; `revisions`/`lookup` are the runtime side under test.
 * Pointer is global: Postgres suites hold the shared pointer lock; `reset()` must leave no active
 * revision and none of this suite's rows.
 */
export interface SessionPinContext {
  repo: RevisionRepository;
  revisions: RevisionReader;
  lookup: RevisionScopedLookup;
}

export function sessionPinContract(
  name: string,
  make: () => SessionPinContext,
  opts: { slugPrefix: string; reset?: () => Promise<void> },
): void {
  describe(`Session pin contract: ${name}`, () => {
    const SCENE = `${opts.slugPrefix}_scene`;
    let ctx: SessionPinContext;

    beforeEach(async () => {
      await opts.reset?.();
      ctx = make();
    });

    async function publish(records: ArtifactRecord[], note: string): Promise<RevisionId> {
      const active = await ctx.repo.getActive();
      const res = await ctx.repo.publish({ records, expectedActive: active?.revision_id ?? null, note: `${opts.slugPrefix} ${note}` });
      if (!res.ok) throw new Error(`publish failed: ${res.message}`);
      return res.revision.revision_id;
    }
    const title = async (rev: RevisionId) => (await ctx.lookup.getScene(rev, SCENE)).scene.base.title;
    const v = (t: string) => [fixtureRecord(SCENE, t)];

    test('startSession returns the revision active at that moment', async () => {
      const r1 = await publish(v('one'), 'r1');
      expect((await startSession(ctx.revisions)).revisionId).toBe(r1);
    });

    test('no active revision is a typed no_active_revision and nothing is written', async () => {
      await expect(startSession(ctx.revisions)).rejects.toBeInstanceOf(NoActiveRevisionError);
    });

    test('after a flip the client\'s pin still resolves the old content; a new session pins the new revision', async () => {
      const r1 = await publish(v('one'), 'r1');
      const pin = (await startSession(ctx.revisions)).revisionId;
      const r2 = await publish(v('two'), 'r2');
      expect(await title(pin)).toBe('one');
      expect(pin).toBe(r1);
      expect((await startSession(ctx.revisions)).revisionId).toBe(r2);
    });

    test('after a rollback the old pin is unchanged and a new session pins the rolled-back target', async () => {
      const r1 = await publish(v('one'), 'r1');
      const pin = (await startSession(ctx.revisions)).revisionId;
      const r2 = await publish(v('two'), 'r2');
      const back = await ctx.repo.flip({ to: r1, expectedActive: r2 });
      expect(back.ok).toBe(true);
      expect(await title(pin)).toBe('one');
      expect((await startSession(ctx.revisions)).revisionId).toBe(r1);
    });

    test('a pin survives an "outage": it is only an id, so re-presenting it later resolves identically', async () => {
      await publish(v('one'), 'r1');
      const stored = JSON.stringify(await startSession(ctx.revisions)); // what the client puts in localStorage
      await publish(v('two'), 'r2');
      const restored = JSON.parse(stored) as { revisionId: RevisionId };
      expect(await title(restored.revisionId)).toBe('one');
    });

    test('requirePinnedRevision accepts an existing pin and throws revision_missing for an unknown one, never falling back', async () => {
      const r1 = await publish(v('one'), 'r1');
      await expect(requirePinnedRevision(ctx.revisions, r1)).resolves.toBeUndefined();
      await publish(v('two'), 'r2'); // a different revision is active: must not be substituted
      const err = await requirePinnedRevision(ctx.revisions, randomUUID()).catch((e) => e);
      expect(err).toBeInstanceOf(ArtifactLookupError);
      expect((err as ArtifactLookupError).code).toBe('revision_missing');
      const junk = await requirePinnedRevision(ctx.revisions, 'not-a-uuid').catch((e) => e);
      expect((junk as ArtifactLookupError).code).toBe('revision_missing');
    });

    test('N parallel startSession calls racing a flip each get exactly R or R2, and each pin resolves to its own content', async () => {
      const r1 = await publish(v('one'), 'r1');
      const flip = publish(v('two'), 'r2');
      const starts = await Promise.all(Array.from({ length: 12 }, () => startSession(ctx.revisions)));
      const r2 = await flip;
      for (const s of starts) {
        expect([r1, r2]).toContain(s.revisionId);
        expect(await title(s.revisionId)).toBe(s.revisionId === r1 ? 'one' : 'two');
      }
    });
  });
}
