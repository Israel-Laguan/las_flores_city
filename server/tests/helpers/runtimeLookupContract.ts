import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  createPersonalityPool,
  type RevisionId,
} from '@las-flores/api-contracts';
import {
  InMemoryCharacterPoolRepository,
  InMemoryContentLookup,
  InMemoryPersonalityPoolRepository,
  compilePools,
  type ArtifactRecord,
  type RevisionRepository,
} from '@las-flores/api-planning';
import { ArtifactLookupError, RevisionScopedLookup, resolveCharacterLineAt } from '@las-flores/api-runtime';
import { fixtureRecord } from './artifactStoreContract.js';

/**
 * Shared behavioural contract for runtime's revision-scoped lookup (SC-502) over whatever
 * ArtifactReader / RevisionReader pair backs it. `repo` is the PLANNING side used only to publish
 * fixtures (it moves the pointer on every publish); `lookup` is the RUNTIME side under test. Run
 * against planning's in-memory implementations (unit), and the Postgres adapters over the app pool
 * and over a connection logged in as the `runtime` role (integration).
 *
 * Isolation: every artifact name and revision note starts with `slugPrefix` (unique per suite), the
 * pointer is global so Postgres suites hold the shared pointer lock, and `reset()` runs before every
 * test and must leave no active revision and no rows of this suite.
 */
export interface LookupContext {
  repo: RevisionRepository;
  lookup: RevisionScopedLookup;
}

export function runtimeLookupContract(
  name: string,
  make: () => LookupContext,
  opts: { slugPrefix: string; reset?: () => Promise<void> },
): void {
  describe(`RevisionScopedLookup contract: ${name}`, () => {
    const p = opts.slugPrefix;
    const SCENE = `${p}_scene`;
    const POOL = `${p}_vendor`;
    const ANA = `${p}_ana`;
    const BO = `${p}_bo`;
    let ctx: LookupContext;

    beforeEach(async () => {
      await opts.reset?.();
      ctx = make();
    });

    /** Publishes `records` as a new revision and flips the pointer to it. */
    async function publish(records: ArtifactRecord[], note: string): Promise<RevisionId> {
      const active = await ctx.repo.getActive();
      const res = await ctx.repo.publish({ records, expectedActive: active?.revision_id ?? null, note: `${p} ${note}` });
      if (!res.ok) throw new Error(`publish failed: ${res.message}`);
      return res.revision.revision_id;
    }

    /** Pool canon -> records, through the real compile step. */
    async function compileVendor(opts2: { text: string; retired?: boolean }): Promise<ArtifactRecord[]> {
      const pools = new InMemoryPersonalityPoolRepository();
      const links = new InMemoryCharacterPoolRepository(pools);
      await pools.create(
        createPersonalityPool({
          slug: POOL,
          lines: [
            { line_id: 'a_hello', text: opts2.text, when: {} },
            { line_id: 'b_rain', text: 'Wet day, hot soup.', when: { weather: ['rain'] } },
          ],
        }),
      );
      await links.link(ANA, POOL);
      await links.link(BO, POOL);
      if (opts2.retired) await pools.retire(POOL);
      const { ok, records } = await compilePools({ pools, links, content: new InMemoryContentLookup({ characters: [ANA, BO] }) });
      if (!ok) throw new Error('pool compile failed');
      return records;
    }

    test('every artifact kind a revision names comes back byte for byte', async () => {
      const scene = fixtureRecord(SCENE, 'v1 title');
      const records = [scene, ...(await compileVendor({ text: 'Fresh today!' }))];
      const r1 = await publish(records, 'bytes');
      for (const rec of records) {
        const got = await ctx.lookup.get(r1, rec.artifact.artifact_type, rec.artifact.name);
        expect(got.payload).toBe(rec.payload);
        expect(got.artifact.artifact_id).toBe(rec.artifact.artifact_id);
      }
      expect((await ctx.lookup.getScene(r1, SCENE)).scene.base.title).toBe('v1 title');
      expect((await ctx.lookup.getPool(r1, POOL)).slug).toBe(POOL);
      expect((await ctx.lookup.getCharacterPools(r1, ANA))?.pools).toEqual([POOL]);
    });

    test('a pointer flip, and a rollback, never change what an earlier revision resolves to', async () => {
      const v1 = fixtureRecord(SCENE, 'v1 title');
      const v2 = fixtureRecord(SCENE, 'v2 title');
      const r1 = await publish([v1], 'v1');
      const r2 = await publish([v2], 'v2'); // pointer now at r2
      expect((await ctx.lookup.getScene(r1, SCENE)).scene.base.title).toBe('v1 title');
      expect((await ctx.lookup.getScene(r2, SCENE)).scene.base.title).toBe('v2 title');

      const back = await ctx.repo.flip({ to: r1, expectedActive: r2 }); // rollback
      expect(back.ok).toBe(true);
      expect((await ctx.lookup.getScene(r2, SCENE)).scene.base.title).toBe('v2 title'); // r2 is no longer active, still resolves
      expect((await ctx.lookup.getScene(r1, SCENE)).scene.base.title).toBe('v1 title');
    });

    test('typed errors: unknown revision, name absent from the manifest, malformed id', async () => {
      const r1 = await publish([fixtureRecord(SCENE)], 'errors');
      const code = async (run: () => Promise<unknown>) => {
        try {
          await run();
          return undefined;
        } catch (e) {
          expect(e).toBeInstanceOf(ArtifactLookupError);
          return (e as ArtifactLookupError).code;
        }
      };
      expect(await code(() => ctx.lookup.get('e9909900-0000-4000-8000-0000000000aa', 'scene', SCENE))).toBe('revision_missing');
      expect(await code(() => ctx.lookup.get('not-a-uuid', 'scene', SCENE))).toBe('revision_missing');
      expect(await code(() => ctx.lookup.get(r1, 'scene', `${p}_nope`))).toBe('artifact_not_in_revision');
      expect(await code(() => ctx.lookup.get(r1, 'personality_pool', SCENE))).toBe('artifact_not_in_revision');
    });

    test('a pool shared by two characters resolves for both, from artifacts alone', async () => {
      const r1 = await publish(await compileVendor({ text: 'Fresh today!' }), 'shared');
      for (const c of [ANA, BO]) {
        expect((await resolveCharacterLineAt(ctx.lookup, r1, { characterSlug: c, ctx: {} }))?.text).toBe('Fresh today!');
        expect(await resolveCharacterLineAt(ctx.lookup, r1, { characterSlug: c, ctx: { weather: 'rain' } })).toMatchObject({ line_id: 'b_rain', source: POOL });
      }
    });

    test('a pool retired in the next revision is gone there and still served from the earlier one', async () => {
      const r1 = await publish(await compileVendor({ text: 'Fresh today!' }), 'before');
      const r2 = await publish([fixtureRecord(SCENE)], 'after retire'); // retired pool: no pool, no links
      expect(await resolveCharacterLineAt(ctx.lookup, r2, { characterSlug: ANA, ctx: {} })).toBeUndefined();
      expect((await resolveCharacterLineAt(ctx.lookup, r1, { characterSlug: ANA, ctx: {} }))?.text).toBe('Fresh today!');
      // the compile step itself drops a retired pool: nothing to publish for it
      expect(await compileVendor({ text: 'x', retired: true })).toEqual([]);
    });

    test('editing a pool: each revision serves its own text to both characters', async () => {
      const r1 = await publish(await compileVendor({ text: 'old text' }), 'old');
      const r2 = await publish(await compileVendor({ text: 'new text' }), 'new');
      for (const c of [ANA, BO]) {
        expect((await resolveCharacterLineAt(ctx.lookup, r1, { characterSlug: c, ctx: {} }))?.text).toBe('old text');
        expect((await resolveCharacterLineAt(ctx.lookup, r2, { characterSlug: c, ctx: {} }))?.text).toBe('new text');
      }
    });
  });
}
