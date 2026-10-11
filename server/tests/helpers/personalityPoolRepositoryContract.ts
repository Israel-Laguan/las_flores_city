import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createPersonalityPool, InvalidPersonalityPoolError, type PersonalityPool } from '@las-flores/api-contracts';
import {
  PersonalityPoolRetiredError,
  PoolLinkError,
  personalityPoolContentHash,
  type CharacterPoolRepository,
  type PersonalityPoolRepository,
} from '@las-flores/api-planning';

/**
 * Shared behavioural contract for every PersonalityPoolRepository + CharacterPoolRepository
 * (SC-306). Run against the in-memory implementations (unit) and the Postgres adapters
 * (integration) so they cannot drift. Same shape as sceneRepositoryContract.
 *
 * Fixtures: every pool slug and character slug carries `slugPrefix` (unique per suite — collision
 * avoidance so parallel Jest workers never touch each other's rows); `cleanup()` runs in afterAll.
 */

export interface PoolRepos {
  pools: PersonalityPoolRepository;
  links: CharacterPoolRepository;
}

const fixturePool = (slug: string, over: Partial<PersonalityPool> = {}): PersonalityPool =>
  createPersonalityPool({
    slug,
    lines: [
      { line_id: 'hello', text: `Hello from ${slug}`, when: {} },
      { line_id: 'rain', text: 'Wet day.', when: { weather: ['rain'], time: ['night', 'day'] } },
    ],
    ...over,
  });

export function personalityPoolRepositoryContract(
  name: string,
  make: () => PoolRepos,
  opts: { slugPrefix: string; cleanup?: () => Promise<void> },
): void {
  describe(`PersonalityPoolRepository contract: ${name}`, () => {
    const p = opts.slugPrefix;
    let repos: PoolRepos;
    beforeAll(() => {
      repos = make();
    });
    afterAll(async () => {
      await opts.cleanup?.();
    });

    describe('pools', () => {
      test('create returns the record with hash and timestamps; get reads it back', async () => {
        const pool = fixturePool(`${p}_a`);
        const created = await repos.pools.create(pool);
        expect(created.slug).toBe(`${p}_a`);
        expect(created.schemaVersion).toBe(1);
        expect(created.contentHash).toMatch(/^[0-9a-f]{64}$/);
        expect(created.contentHash).toBe(personalityPoolContentHash(created.pool));
        expect(created.retiredAt).toBeNull();
        expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
        // `when` lists are canonicalised (sorted) on the way in, so compare canonical forms.
        expect(created.pool.lines.map((l) => l.line_id)).toEqual(['hello', 'rain']);
        expect(created.pool.lines[1].when).toEqual({ time: ['day', 'night'], weather: ['rain'] });
        expect(await repos.pools.get(`${p}_a`)).toEqual(created);
      });

      test('get returns undefined for an unknown slug, and an independent copy otherwise', async () => {
        expect(await repos.pools.get(`${p}_missing`)).toBeUndefined();
        await repos.pools.create(fixturePool(`${p}_copy`));
        const got = (await repos.pools.get(`${p}_copy`))!;
        got.pool.lines[0].text = 'mutated';
        expect((await repos.pools.get(`${p}_copy`))!.pool.lines[0].text).toBe(`Hello from ${p}_copy`);
      });

      test('create rejects a duplicate slug', async () => {
        await repos.pools.create(fixturePool(`${p}_dup`));
        await expect(repos.pools.create(fixturePool(`${p}_dup`, { lines: [{ line_id: 'x', text: 'other', when: {} }] }))).rejects.toThrow(/already exists/);
      });

      test('create and upsertIfChanged reject an invalid pool and write nothing', async () => {
        await expect(repos.pools.create(fixturePool(`${p}-bad slug`))).rejects.toThrow(InvalidPersonalityPoolError);
        await expect(repos.pools.create(fixturePool(`${p}_empty`, { lines: [] }))).rejects.toThrow(InvalidPersonalityPoolError);
        await expect(
          repos.pools.upsertIfChanged(fixturePool(`${p}_dupline`, { lines: [{ line_id: 'x', text: 'a', when: {} }, { line_id: 'x', text: 'b', when: {} }] })),
        ).rejects.toThrow(InvalidPersonalityPoolError);
        await expect(
          repos.pools.create(fixturePool(`${p}_badwhen`, { lines: [{ line_id: 'x', text: 'a', when: { weather: ['hail' as never] } }] })),
        ).rejects.toThrow(InvalidPersonalityPoolError);
        expect(await repos.pools.get(`${p}_empty`)).toBeUndefined();
        expect(await repos.pools.get(`${p}_badwhen`)).toBeUndefined();
      });

      test('list returns pools oldest first and hides retired ones unless asked', async () => {
        await repos.pools.create(fixturePool(`${p}_l1`));
        await new Promise((r) => setTimeout(r, 5));
        await repos.pools.create(fixturePool(`${p}_l2`));
        await new Promise((r) => setTimeout(r, 5));
        await repos.pools.create(fixturePool(`${p}_l3`));
        await repos.pools.retire(`${p}_l2`);
        const mine = (includeRetired?: boolean) =>
          repos.pools.list({ includeRetired }).then((rs) => rs.map((r) => r.slug).filter((s) => s.startsWith(`${p}_l`)));
        expect(await mine()).toEqual([`${p}_l1`, `${p}_l3`]);
        expect(await mine(true)).toEqual([`${p}_l1`, `${p}_l2`, `${p}_l3`]);
      });

      test('upsertIfChanged: created, then unchanged (row untouched), then updated', async () => {
        const first = await repos.pools.upsertIfChanged(fixturePool(`${p}_u`));
        expect(first.status).toBe('created');
        await new Promise((r) => setTimeout(r, 15));
        const same = await repos.pools.upsertIfChanged(fixturePool(`${p}_u`));
        expect(same.status).toBe('unchanged');
        expect(same.record.updatedAt).toBe(first.record.updatedAt);
        // Authoring order of a `when` list is not a content change.
        const reordered = await repos.pools.upsertIfChanged(
          fixturePool(`${p}_u`, { lines: [fixturePool(`${p}_u`).lines[0], { line_id: 'rain', text: 'Wet day.', when: { weather: ['rain'], time: ['day', 'night'] } }] }),
        );
        expect(reordered.status).toBe('unchanged');
        const changed = await repos.pools.upsertIfChanged(fixturePool(`${p}_u`, { lines: [{ line_id: 'hello', text: 'New text', when: {} }] }));
        expect(changed.status).toBe('updated');
        expect(changed.record.contentHash).not.toBe(first.record.contentHash);
        expect(changed.record.createdAt).toBe(first.record.createdAt);
        expect((await repos.pools.get(`${p}_u`))!.pool.lines[0].text).toBe('New text');
      });

      test('retire stamps retiredAt, keeps the row, and a retired slug can never be written again', async () => {
        await repos.pools.create(fixturePool(`${p}_r`));
        expect(await repos.pools.retire(`${p}_r`)).toEqual({ success: true, retiredSlug: `${p}_r` });
        const row = (await repos.pools.get(`${p}_r`))!;
        expect(row.retiredAt).not.toBeNull();
        await expect(repos.pools.upsertIfChanged(fixturePool(`${p}_r`))).rejects.toThrow(PersonalityPoolRetiredError);
        await expect(repos.pools.create(fixturePool(`${p}_r`))).rejects.toThrow(/already exists/);
      });

      test('retire reports unknown and already-retired pools without throwing', async () => {
        expect(await repos.pools.retire(`${p}_nope`)).toMatchObject({ success: false, error: expect.stringMatching(/not found/) });
        await repos.pools.create(fixturePool(`${p}_r2`));
        await repos.pools.retire(`${p}_r2`);
        expect(await repos.pools.retire(`${p}_r2`)).toMatchObject({ success: false, retiredSlug: `${p}_r2`, error: expect.stringMatching(/already retired/) });
      });
    });

    describe('links (many-to-many)', () => {
      test('a pool is SHARED: two characters link to one pool and both read it; no copy is made', async () => {
        await repos.pools.create(fixturePool(`${p}_shared`));
        expect(await repos.links.link(`${p}_ana`, `${p}_shared`)).toBe('linked');
        expect(await repos.links.link(`${p}_bo`, `${p}_shared`)).toBe('linked');
        const forAna = await repos.links.poolsFor(`${p}_ana`);
        const forBo = await repos.links.poolsFor(`${p}_bo`);
        expect(forAna.map((r) => r.slug)).toEqual([`${p}_shared`]);
        expect(forBo).toEqual(forAna);
        expect(await repos.links.charactersFor(`${p}_shared`)).toEqual([`${p}_ana`, `${p}_bo`]);
        // Editing the pool is visible to both: there is exactly one pool row.
        await repos.pools.upsertIfChanged(fixturePool(`${p}_shared`, { lines: [{ line_id: 'hello', text: 'Edited', when: {} }] }));
        expect((await repos.links.poolsFor(`${p}_ana`))[0].pool.lines[0].text).toBe('Edited');
        expect((await repos.links.poolsFor(`${p}_bo`))[0].pool.lines[0].text).toBe('Edited');
      });

      test('linking twice is idempotent', async () => {
        await repos.pools.create(fixturePool(`${p}_idem`));
        expect(await repos.links.link(`${p}_c1`, `${p}_idem`)).toBe('linked');
        expect(await repos.links.link(`${p}_c1`, `${p}_idem`)).toBe('already_linked');
        expect(await repos.links.charactersFor(`${p}_idem`)).toEqual([`${p}_c1`]);
      });

      test('linking an unknown pool, a retired pool, or a malformed character slug fails', async () => {
        await expect(repos.links.link(`${p}_c2`, `${p}_no_such_pool`)).rejects.toThrow(PoolLinkError);
        await repos.pools.create(fixturePool(`${p}_gone`));
        await repos.pools.retire(`${p}_gone`);
        await expect(repos.links.link(`${p}_c2`, `${p}_gone`)).rejects.toThrow(PoolLinkError);
        await expect(repos.links.link('bad slug', `${p}_idem`)).rejects.toThrow(PoolLinkError);
        expect(await repos.links.poolsFor(`${p}_c2`)).toEqual([]);
      });

      test('a character can use several pools; poolsFor is ordered by slug and omits RETIRED pools', async () => {
        for (const s of ['m', 'k', 'z']) await repos.pools.create(fixturePool(`${p}_multi_${s}`));
        for (const s of ['m', 'k', 'z']) await repos.links.link(`${p}_poly`, `${p}_multi_${s}`);
        expect((await repos.links.poolsFor(`${p}_poly`)).map((r) => r.slug)).toEqual([`${p}_multi_k`, `${p}_multi_m`, `${p}_multi_z`]);
        await repos.pools.retire(`${p}_multi_m`);
        expect((await repos.links.poolsFor(`${p}_poly`)).map((r) => r.slug)).toEqual([`${p}_multi_k`, `${p}_multi_z`]);
        // Retired pool still records who was linked (audit), and cannot be linked anew.
        expect(await repos.links.charactersFor(`${p}_multi_m`)).toEqual([`${p}_poly`]);
        await expect(repos.links.link(`${p}_poly`, `${p}_multi_m`)).rejects.toThrow(PoolLinkError);
      });

      test('poolsFor an unlinked character, and charactersFor an unlinked pool, are empty', async () => {
        expect(await repos.links.poolsFor(`${p}_nobody`)).toEqual([]);
        await repos.pools.create(fixturePool(`${p}_lonely`));
        expect(await repos.links.charactersFor(`${p}_lonely`)).toEqual([]);
      });
    });
  });
}
