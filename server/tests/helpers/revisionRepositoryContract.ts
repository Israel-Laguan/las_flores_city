import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { RevisionArtifactMissingError, manifestHash, type RevisionId } from '@las-flores/api-contracts';
import {
  ArtifactIntegrityError,
  manifestFromRecords,
  type ArtifactStore,
  type RevisionRepository,
} from '@las-flores/api-planning';
import { fixtureRecord } from './artifactStoreContract.js';

/**
 * Shared behavioural contract for every RevisionRepository (SC-404, D1): inert revisions, the
 * compare-and-swap pointer, rollback-by-flip, atomic publish, and concurrency. Run against
 * InMemoryRevisionRepository (unit) and PgRevisionRepository (integration).
 *
 * Isolation: the pointer is a global singleton, so `reset()` runs before EVERY test and must
 * leave no active revision and no revision created by this suite (the Postgres suite also holds
 * a cross-suite advisory lock for its whole run). Every fixture's scene slug starts with
 * `slugPrefix`, and every revision note starts with it too, so cleanup can find them.
 */

export interface RevisionContext {
  repo: RevisionRepository;
  store: ArtifactStore;
}

export function revisionRepositoryContract(
  name: string,
  make: () => RevisionContext,
  opts: { slugPrefix: string; reset?: () => Promise<void>; cleanup?: () => Promise<void> },
): void {
  describe(`RevisionRepository contract: ${name}`, () => {
    const p = opts.slugPrefix;
    let ctx: RevisionContext;
    let n = 0;

    beforeEach(async () => {
      await opts.reset?.();
      ctx = make();
    });
    afterAll(async () => {
      await opts.cleanup?.();
    });

    /** Stores artifacts for the given scene names and creates an inert revision over them. */
    async function revisionOf(...names: string[]): Promise<RevisionId> {
      const records = names.map((s) => fixtureRecord(`${p}_${s}`));
      await ctx.store.putMany(records);
      const rev = await ctx.repo.createRevision({ manifest: manifestFromRecords(records), note: `${p} ${++n}` });
      return rev.revision_id;
    }

    test('nothing is active before the first flip', async () => {
      expect(await ctx.repo.getActive()).toBeUndefined();
    });

    test('createRevision is inert: it stores a revision and changes nothing runtime sees', async () => {
      const id = await revisionOf('a', 'b');
      expect(await ctx.repo.getActive()).toBeUndefined();
      const rev = (await ctx.repo.getRevision(id))!;
      expect(rev.manifest.entries.map((e) => e.name)).toEqual([`${p}_a`, `${p}_b`]);
      expect(rev.manifest_hash).toBe(manifestHash(rev.manifest));
      expect(rev.parent_revision_id).toBeNull();
      expect(await ctx.repo.listFlips()).toEqual([]);
    });

    test('createRevision rejects a manifest that names an artifact that is not stored', async () => {
      const ghost = fixtureRecord(`${p}_ghost`); // never put in the store
      await expect(ctx.repo.createRevision({ manifest: manifestFromRecords([ghost]), note: p })).rejects.toThrow(RevisionArtifactMissingError);
    });

    test('createRevision rejects an unknown parent', async () => {
      const rec = fixtureRecord(`${p}_orphan`);
      await ctx.store.putMany([rec]);
      await expect(
        ctx.repo.createRevision({ manifest: manifestFromRecords([rec]), parentRevisionId: 'e9904000-0000-4000-8000-0000000000ff', note: p }),
      ).rejects.toThrow(/parent revision/);
    });

    test('getRevision is undefined for unknown and malformed ids, and returns an independent copy', async () => {
      expect(await ctx.repo.getRevision('e9904000-0000-4000-8000-0000000000fe')).toBeUndefined();
      expect(await ctx.repo.getRevision('not-a-uuid')).toBeUndefined();
      const id = await revisionOf('c');
      const rev = (await ctx.repo.getRevision(id))!;
      rev.manifest.entries[0].name = 'mutated';
      expect((await ctx.repo.getRevision(id))!.manifest.entries[0].name).toBe(`${p}_c`);
    });

    test('first flip: expectedActive null -> ok, previous null, pointer set, logged', async () => {
      const a = await revisionOf('a');
      const r = await ctx.repo.flip({ to: a, expectedActive: null });
      expect(r).toMatchObject({ ok: true, previous: null, active: { revision_id: a } });
      expect((await ctx.repo.getActive())!.revision_id).toBe(a);
      expect((await ctx.repo.listFlips()).map((f) => [f.from_revision_id, f.to_revision_id])).toEqual([[null, a]]);
    });

    test('CAS: a wrong expectedActive fails, reports what IS active, and changes nothing', async () => {
      const [a, b, c] = [await revisionOf('a'), await revisionOf('b'), await revisionOf('c')];
      await ctx.repo.flip({ to: a, expectedActive: null });
      const before = await ctx.repo.getActive();
      const logBefore = await ctx.repo.listFlips();

      const r = await ctx.repo.flip({ to: c, expectedActive: b }); // b is not active
      expect(r).toMatchObject({ ok: false, code: 'conflict', actual: a });
      expect(await ctx.repo.getActive()).toEqual(before);
      expect(await ctx.repo.listFlips()).toEqual(logBefore);
    });

    test('CAS: expecting "none" while something is active conflicts; so does expecting the target when it is not active', async () => {
      const [a, b] = [await revisionOf('a'), await revisionOf('b')];
      await ctx.repo.flip({ to: a, expectedActive: null });
      expect(await ctx.repo.flip({ to: b, expectedActive: null })).toMatchObject({ ok: false, code: 'conflict', actual: a });
      expect(await ctx.repo.flip({ to: b, expectedActive: b })).toMatchObject({ ok: false, code: 'conflict', actual: a });
      expect((await ctx.repo.getActive())!.revision_id).toBe(a);
    });

    test('CAS: expecting a revision while NOTHING is active conflicts with actual null', async () => {
      const [a, b] = [await revisionOf('a'), await revisionOf('b')];
      expect(await ctx.repo.flip({ to: b, expectedActive: a })).toMatchObject({ ok: false, code: 'conflict', actual: null });
      expect(await ctx.repo.getActive()).toBeUndefined();
    });

    test('flipping to a revision that does not exist (or is not an id) fails with unknown_revision and changes nothing', async () => {
      const a = await revisionOf('a');
      await ctx.repo.flip({ to: a, expectedActive: null });
      expect(await ctx.repo.flip({ to: 'e9904000-0000-4000-8000-0000000000fd', expectedActive: a })).toMatchObject({ ok: false, code: 'unknown_revision', actual: a });
      expect(await ctx.repo.flip({ to: 'nope', expectedActive: a })).toMatchObject({ ok: false, code: 'unknown_revision' });
      expect((await ctx.repo.getActive())!.revision_id).toBe(a);
      expect(await ctx.repo.listFlips()).toHaveLength(1);
    });

    test('flipping to the already-active revision is already_active, not a logged no-op', async () => {
      const a = await revisionOf('a');
      await ctx.repo.flip({ to: a, expectedActive: null });
      expect(await ctx.repo.flip({ to: a, expectedActive: a })).toMatchObject({ ok: false, code: 'already_active', actual: a });
      expect(await ctx.repo.listFlips()).toHaveLength(1);
    });

    test('rollback is flipping again: A -> B -> A, with the log recording every move', async () => {
      const [a, b] = [await revisionOf('a'), await revisionOf('b')];
      expect(await ctx.repo.flip({ to: a, expectedActive: null })).toMatchObject({ ok: true });
      expect(await ctx.repo.flip({ to: b, expectedActive: a })).toMatchObject({ ok: true, previous: a });
      expect((await ctx.repo.getActive())!.revision_id).toBe(b);

      const back = await ctx.repo.flip({ to: a, expectedActive: b }); // the rollback
      expect(back).toMatchObject({ ok: true, previous: b, active: { revision_id: a } });
      expect((await ctx.repo.getActive())!.revision_id).toBe(a);

      // Revisions are untouched by all of it: both still readable, a's manifest unchanged.
      expect((await ctx.repo.getRevision(a))!.manifest.entries.map((e) => e.name)).toEqual([`${p}_a`]);
      expect((await ctx.repo.getRevision(b))!.manifest.entries.map((e) => e.name)).toEqual([`${p}_b`]);
      expect((await ctx.repo.listFlips()).map((f) => [f.from_revision_id, f.to_revision_id])).toEqual([
        [b, a],
        [a, b],
        [null, a],
      ]);
      expect((await ctx.repo.listFlips(2)).length).toBe(2);
    });

    test('CONCURRENCY: N flips racing from the same expectedActive -> exactly one wins, the rest conflict, one log row', async () => {
      const base = await revisionOf('base');
      await ctx.repo.flip({ to: base, expectedActive: null });
      const targets = await Promise.all(Array.from({ length: 12 }, (_, i) => revisionOf(`t${i}`)));
      const logBefore = (await ctx.repo.listFlips()).length;

      const results = await Promise.all(targets.map((to) => ctx.repo.flip({ to, expectedActive: base })));
      const winners = results.filter((r) => r.ok);
      const losers = results.filter((r) => !r.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(11);

      const winner = targets[results.findIndex((r) => r.ok)];
      expect((await ctx.repo.getActive())!.revision_id).toBe(winner);
      for (const l of losers) expect(l).toMatchObject({ ok: false, code: 'conflict' });
      expect((await ctx.repo.listFlips()).length).toBe(logBefore + 1);
    });

    test('CONCURRENCY: racing FIRST flips (expectedActive null) -> exactly one wins', async () => {
      const targets = await Promise.all(Array.from({ length: 8 }, (_, i) => revisionOf(`f${i}`)));
      const results = await Promise.all(targets.map((to) => ctx.repo.flip({ to, expectedActive: null })));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await ctx.repo.listFlips()).toHaveLength(1);
      expect((await ctx.repo.getActive())!.revision_id).toBe(targets[results.findIndex((r) => r.ok)]);
    });

    test('CONCURRENCY: a chain of retries converges: every caller that re-reads and retries eventually flips, none lost', async () => {
      const ids = await Promise.all(Array.from({ length: 6 }, (_, i) => revisionOf(`r${i}`)));
      const flipWithRetry = async (to: RevisionId): Promise<void> => {
        for (;;) {
          const cur = (await ctx.repo.getActive())?.revision_id ?? null;
          const r = await ctx.repo.flip({ to, expectedActive: cur });
          if (r.ok) return;
          if (r.code === 'already_active') return;
        }
      };
      await Promise.all(ids.map(flipWithRetry));
      const log = await ctx.repo.listFlips();
      expect(log).toHaveLength(6);
      // The log is a single unbroken chain: each move starts where the previous ended.
      const chrono = [...log].reverse();
      expect(chrono[0].from_revision_id).toBeNull();
      for (let i = 1; i < chrono.length; i++) expect(chrono[i].from_revision_id).toBe(chrono[i - 1].to_revision_id);
      expect((await ctx.repo.getActive())!.revision_id).toBe(chrono[chrono.length - 1].to_revision_id);
    });

    describe('publish: artifacts + revision + flip as ONE atomic step', () => {
      test('stores the artifacts, creates the revision with the manifest, and activates it', async () => {
        const records = ['x', 'y'].map((s) => fixtureRecord(`${p}_${s}`));
        const r = await ctx.repo.publish({ records, expectedActive: null, note: `${p} publish` });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.previous).toBeNull();
        expect(r.artifacts.created).toHaveLength(2);
        expect((await ctx.repo.getActive())!.revision_id).toBe(r.revision.revision_id);
        expect((await ctx.repo.getRevision(r.revision.revision_id))!.manifest).toEqual(manifestFromRecords(records));
        for (const rec of records) expect(await ctx.store.get(rec.artifact.artifact_id)).toEqual(rec);
      });

      test('a stale expectedActive fails and writes NOTHING: no artifacts, no revision, pointer untouched', async () => {
        const a = await revisionOf('a');
        await ctx.repo.flip({ to: a, expectedActive: null });
        const fresh = fixtureRecord(`${p}_fresh`);
        const r = await ctx.repo.publish({ records: [fresh], expectedActive: null, note: `${p} stale` });
        expect(r).toMatchObject({ ok: false, code: 'conflict', actual: a });
        expect(await ctx.store.get(fresh.artifact.artifact_id)).toBeUndefined();
        expect((await ctx.repo.getActive())!.revision_id).toBe(a);
        expect(await ctx.repo.listFlips()).toHaveLength(1);
      });

      test('an expectedActive that names no revision at all is a conflict, not a crash', async () => {
        const r = await ctx.repo.publish({ records: [fixtureRecord(`${p}_ghostexp`)], expectedActive: 'e9904000-0000-4000-8000-0000000000fc', note: `${p} ghost` });
        expect(r).toMatchObject({ ok: false, code: 'conflict', actual: null });
        expect(await ctx.repo.getActive()).toBeUndefined();
      });

      test('a tampered record rejects the call and writes nothing, not even the valid sibling', async () => {
        const good = fixtureRecord(`${p}_good`);
        const bad = { ...fixtureRecord(`${p}_bad`), payload: '{}' };
        await expect(ctx.repo.publish({ records: [good, bad], expectedActive: null, note: p })).rejects.toThrow(ArtifactIntegrityError);
        expect(await ctx.store.get(good.artifact.artifact_id)).toBeUndefined();
        expect(await ctx.repo.getActive()).toBeUndefined();
      });

      test('republishing identical artifacts creates a NEW revision over unchanged artifacts, and parents it on the old one', async () => {
        const records = [fixtureRecord(`${p}_same`)];
        const first = await ctx.repo.publish({ records, expectedActive: null, note: `${p} one` });
        if (!first.ok) throw new Error('first publish failed');
        const second = await ctx.repo.publish({ records, expectedActive: first.revision.revision_id, note: `${p} two` });
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.artifacts).toEqual({ created: [], unchanged: [records[0].artifact.artifact_id] });
        expect(second.revision.revision_id).not.toBe(first.revision.revision_id);
        expect(second.revision.parent_revision_id).toBe(first.revision.revision_id);
        expect(second.revision.manifest_hash).toBe(first.revision.manifest_hash);
      });

      test('two racing publishes from the same expectedActive: exactly one wins; the loser leaves no revision behind', async () => {
        const a = await revisionOf('base');
        await ctx.repo.flip({ to: a, expectedActive: null });
        const results = await Promise.all(
          ['p1', 'p2', 'p3', 'p4'].map((s) => ctx.repo.publish({ records: [fixtureRecord(`${p}_${s}`)], expectedActive: a, note: `${p} race ${s}` })),
        );
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        for (const r of results) if (!r.ok) expect(r.code).toBe('conflict');
        const winner = results.find((r) => r.ok);
        expect((await ctx.repo.getActive())!.revision_id).toBe(winner && winner.ok ? winner.revision.revision_id : '');
        expect(await ctx.repo.listFlips()).toHaveLength(2); // base + the single winner
      });

      test('publish -> publish -> rollback: the earlier revision serves again, byte for byte', async () => {
        const v1 = [fixtureRecord(`${p}_s`, 'v1')];
        const v2 = [fixtureRecord(`${p}_s`, 'v2')];
        const one = await ctx.repo.publish({ records: v1, expectedActive: null, note: `${p} v1` });
        if (!one.ok) throw new Error('v1 failed');
        const two = await ctx.repo.publish({ records: v2, expectedActive: one.revision.revision_id, note: `${p} v2` });
        if (!two.ok) throw new Error('v2 failed');
        const active = async () => (await ctx.repo.getRevision((await ctx.repo.getActive())!.revision_id))!.manifest.entries[0].artifact_id;
        expect(await active()).toBe(v2[0].artifact.artifact_id);
        expect(await ctx.repo.flip({ to: one.revision.revision_id, expectedActive: two.revision.revision_id })).toMatchObject({ ok: true });
        expect(await active()).toBe(v1[0].artifact.artifact_id);
        expect(await ctx.store.get(v1[0].artifact.artifact_id)).toEqual(v1[0]); // old artifact never mutated or removed
      });
    });
  });
}
