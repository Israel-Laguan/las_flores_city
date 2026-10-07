import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createSceneDef, type SceneDef } from '@las-flores/api-contracts';
import { sceneDefContentHash, type SceneDefRepository } from '@las-flores/api-planning';

/**
 * Shared behavioural contract for every SceneDefRepository implementation (SC-311).
 * Run against InMemorySceneDefRepository (unit) now and the Postgres adapter (F1,
 * integration) later so the two cannot drift. Same shape as flagRegistryContract (BF-303).
 *
 * Fixtures: every slug carries `slugPrefix` (unique per suite — collision-avoidance so
 * parallel Jest workers never touch each other's rows) and `cleanup()` runs in afterAll.
 */

/** Legacy location row id used by fixtures; planning holds no FK to it (no mirror yet). */
const FIXTURE_LOCATION = 'e9900000-0000-4000-8000-0000000000a1';

function fixtureScene(slug: string, overrides: Partial<SceneDef> = {}): SceneDef {
  return createSceneDef({
    id: 'e9900000-0000-4000-8000-0000000000b1',
    slug,
    title: `Title ${slug}`,
    description: 'fixture',
    location: FIXTURE_LOCATION,
    ...overrides,
  });
}

export function sceneRepositoryContract(
  name: string,
  makeRepository: () => SceneDefRepository,
  opts: { slugPrefix: string; cleanup?: () => Promise<void> },
): void {
  describe(`SceneDefRepository contract: ${name}`, () => {
    const p = opts.slugPrefix;
    let repo: SceneDefRepository;

    beforeAll(() => {
      repo = makeRepository();
    });
    afterAll(async () => {
      await opts.cleanup?.();
    });

    test('create returns the record with hash and timestamps; get reads it back', async () => {
      const scene = fixtureScene(`${p}_a`);
      const created = await repo.create(scene);
      expect(created.slug).toBe(`${p}_a`);
      expect(created.scene).toEqual(scene);
      expect(created.schemaVersion).toBe(1);
      expect(created.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(created.contentHash).toBe(sceneDefContentHash(scene));
      expect(created.retiredAt).toBeNull();
      expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
      expect(Number.isNaN(Date.parse(created.updatedAt))).toBe(false);
      expect(await repo.get(`${p}_a`)).toEqual(created);
    });

    test('get returns undefined for an unknown slug', async () => {
      expect(await repo.get(`${p}_missing`)).toBeUndefined();
    });

    test('create rejects a duplicate slug', async () => {
      await repo.create(fixtureScene(`${p}_dup`));
      await expect(repo.create(fixtureScene(`${p}_dup`, { title: 'other' }))).rejects.toThrow(/already exists/);
    });

    test('create and upsertIfChanged reject an invalid scene', async () => {
      await expect(repo.create(fixtureScene(`${p}-bad slug`))).rejects.toThrow();
      await expect(repo.upsertIfChanged(fixtureScene(`1${p}_bad`))).rejects.toThrow();
      await expect(repo.create(fixtureScene(`${p}_badtime`, { time: 'dawn' as never }))).rejects.toThrow();
      expect(await repo.get(`${p}_badtime`)).toBeUndefined();
    });

    test('list returns scenes oldest first and hides retired ones unless asked', async () => {
      await repo.create(fixtureScene(`${p}_l1`));
      await new Promise((r) => setTimeout(r, 5));
      await repo.create(fixtureScene(`${p}_l2`));
      await new Promise((r) => setTimeout(r, 5));
      await repo.create(fixtureScene(`${p}_l3`));
      await repo.retire(`${p}_l2`);
      const mine = (includeRetired?: boolean) =>
        repo
          .list({ includeRetired })
          .then((rs) => rs.map((r) => r.slug).filter((s) => s.startsWith(`${p}_l`)));
      expect(await mine()).toEqual([`${p}_l1`, `${p}_l3`]);
      expect(await mine(true)).toEqual([`${p}_l1`, `${p}_l2`, `${p}_l3`]);
    });

    test('upsertIfChanged creates when absent', async () => {
      const res = await repo.upsertIfChanged(fixtureScene(`${p}_u1`));
      expect(res.status).toBe('created');
      expect(res.record.slug).toBe(`${p}_u1`);
      expect(await repo.get(`${p}_u1`)).toEqual(res.record);
    });

    test('upsertIfChanged is a no-op for identical content (hash match)', async () => {
      const first = await repo.upsertIfChanged(fixtureScene(`${p}_u2`));
      await new Promise((r) => setTimeout(r, 5));
      const again = await repo.upsertIfChanged(fixtureScene(`${p}_u2`));
      expect(again.status).toBe('unchanged');
      expect(again.record).toEqual(first.record);
      expect(again.record.updatedAt).toBe(first.record.updatedAt);
    });

    test('upsertIfChanged ignores input key order (hash is over canonical JSON)', async () => {
      const scene = fixtureScene(`${p}_u3`, { items: ['b', 'a'] });
      await repo.upsertIfChanged(scene);
      const reordered = Object.fromEntries(Object.entries(scene).reverse()) as unknown as SceneDef;
      expect((await repo.upsertIfChanged(reordered)).status).toBe('unchanged');
    });

    test('upsertIfChanged updates changed content: new hash, same createdAt, later updatedAt', async () => {
      const first = await repo.upsertIfChanged(fixtureScene(`${p}_u4`));
      await new Promise((r) => setTimeout(r, 5));
      const changed = fixtureScene(`${p}_u4`, { title: 'Changed', weather: 'storm' });
      const res = await repo.upsertIfChanged(changed);
      expect(res.status).toBe('updated');
      expect(res.record.scene).toEqual(changed);
      expect(res.record.contentHash).not.toBe(first.record.contentHash);
      expect(res.record.createdAt).toBe(first.record.createdAt);
      expect(Date.parse(res.record.updatedAt)).toBeGreaterThan(Date.parse(first.record.updatedAt));
      expect((await repo.get(`${p}_u4`))?.scene.title).toBe('Changed');
    });

    test('retire keeps the row (never delete) and stamps retiredAt', async () => {
      await repo.create(fixtureScene(`${p}_r1`));
      expect(await repo.retire(`${p}_r1`)).toEqual({ success: true, retiredSlug: `${p}_r1` });
      const kept = await repo.get(`${p}_r1`);
      expect(kept).toBeDefined();
      expect(Number.isNaN(Date.parse(kept?.retiredAt ?? ''))).toBe(false);
    });

    test('retire reports an unknown slug and a double retire without throwing', async () => {
      expect(await repo.retire(`${p}_nope`)).toMatchObject({ success: false });
      await repo.create(fixtureScene(`${p}_r2`));
      await repo.retire(`${p}_r2`);
      expect(await repo.retire(`${p}_r2`)).toMatchObject({ success: false, error: expect.stringMatching(/already retired/) });
    });

    test('a retired slug is terminal: create and upsertIfChanged reject it', async () => {
      await repo.create(fixtureScene(`${p}_r3`));
      await repo.retire(`${p}_r3`);
      await expect(repo.upsertIfChanged(fixtureScene(`${p}_r3`, { title: 'revived' }))).rejects.toThrow(/retired/);
      await expect(repo.create(fixtureScene(`${p}_r3`))).rejects.toThrow();
      expect((await repo.get(`${p}_r3`))?.scene.title).toBe('Title ' + `${p}_r3`);
    });

    test('returned records are the caller’s own copies', async () => {
      await repo.create(fixtureScene(`${p}_c1`, { items: ['x'] }));
      const got = await repo.get(`${p}_c1`);
      got?.scene.items.push('mutated');
      expect((await repo.get(`${p}_c1`))?.scene.items).toEqual(['x']);
    });
  });
}
