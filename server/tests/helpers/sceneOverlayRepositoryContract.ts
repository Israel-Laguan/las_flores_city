import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createSceneOverlay, type SceneOverlay } from '@las-flores/api-contracts';
import { sceneOverlayContentHash, type SceneOverlayRepository } from '@las-flores/api-planning';

/**
 * Shared behavioural contract for every SceneOverlayRepository implementation (SC-314).
 * Run against InMemorySceneOverlayRepository (unit) and PgSceneOverlayRepository
 * (integration) so the two cannot drift. Mirrors sceneRepositoryContract (SC-311).
 *
 * Fixtures: every slug carries `slugPrefix` (unique per suite, collision avoidance) and
 * `seedBase` creates the base scenes the overlays point at. The Pg run seeds real
 * scene rows because of the FK; the in-memory run seeds nothing.
 */

function fixtureOverlay(slug: string, base: string, overrides: Partial<SceneOverlay> = {}): SceneOverlay {
  return createSceneOverlay({
    slug,
    base_scene_slug: base,
    ops: [{ op: 'set_weather', weather: 'rain' }],
    ...overrides,
  });
}

export function sceneOverlayRepositoryContract(
  name: string,
  makeRepository: () => SceneOverlayRepository,
  opts: {
    slugPrefix: string;
    seedBase: (slug: string) => Promise<void>;
    cleanup?: () => Promise<void>;
  },
): void {
  describe(`SceneOverlayRepository contract: ${name}`, () => {
    const p = opts.slugPrefix;
    const base = `${p}_base`;
    const baseList = `${p}_base_list`;
    let repo: SceneOverlayRepository;

    beforeAll(async () => {
      repo = makeRepository();
      await opts.seedBase(base);
      await opts.seedBase(baseList);
    });
    afterAll(async () => {
      await opts.cleanup?.();
    });

    test('create returns the record with hash and timestamps; get reads it back', async () => {
      const overlay = fixtureOverlay(`${p}_a`, base, { priority: 3 });
      const created = await repo.create(overlay);
      expect(created.slug).toBe(`${p}_a`);
      expect(created.baseSceneSlug).toBe(base);
      expect(created.priority).toBe(3);
      expect(created.overlay).toEqual(overlay);
      expect(created.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(created.contentHash).toBe(sceneOverlayContentHash(overlay));
      expect(created.retiredAt).toBeNull();
      expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
      expect(Number.isNaN(Date.parse(created.updatedAt))).toBe(false);
      expect(await repo.get(`${p}_a`)).toEqual(created);
    });

    test('get returns undefined for an unknown slug', async () => {
      expect(await repo.get(`${p}_missing`)).toBeUndefined();
    });

    test('create rejects a duplicate slug', async () => {
      await repo.create(fixtureOverlay(`${p}_dup`, base));
      await expect(repo.create(fixtureOverlay(`${p}_dup`, base, { priority: 9 }))).rejects.toThrow(/already exists/);
    });

    test('create and upsertIfChanged reject an invalid overlay', async () => {
      // Two set_weather ops in one overlay contradict each other (validated, SC-303a).
      const twoWeathers = fixtureOverlay(`${p}_badops`, base, {
        ops: [
          { op: 'set_weather', weather: 'rain' },
          { op: 'set_weather', weather: 'fog' },
        ],
      });
      await expect(repo.create(twoWeathers)).rejects.toThrow();
      await expect(repo.upsertIfChanged(fixtureOverlay(`${p}-bad slug`, base))).rejects.toThrow();
      expect(await repo.get(`${p}_badops`)).toBeUndefined();
    });

    test('listByBase orders by priority then slug and hides retired unless asked', async () => {
      await repo.create(fixtureOverlay(`${p}_lo_hi`, baseList, { priority: 5 }));
      await repo.create(fixtureOverlay(`${p}_lo_b`, baseList, { priority: 1 }));
      await repo.create(fixtureOverlay(`${p}_lo_a`, baseList, { priority: 1 }));
      await repo.retire(`${p}_lo_b`);
      const slugs = (includeRetired?: boolean) =>
        repo.listByBase(baseList, { includeRetired }).then((rs) => rs.map((r) => r.slug));
      expect(await slugs()).toEqual([`${p}_lo_a`, `${p}_lo_hi`]);
      expect(await slugs(true)).toEqual([`${p}_lo_a`, `${p}_lo_b`, `${p}_lo_hi`]);
    });

    test('upsertIfChanged creates when absent', async () => {
      const res = await repo.upsertIfChanged(fixtureOverlay(`${p}_u1`, base));
      expect(res.status).toBe('created');
      expect(res.record.slug).toBe(`${p}_u1`);
      expect(await repo.get(`${p}_u1`)).toEqual(res.record);
    });

    test('upsertIfChanged is a no-op for identical content (hash match)', async () => {
      const first = await repo.upsertIfChanged(fixtureOverlay(`${p}_u2`, base));
      await new Promise((r) => setTimeout(r, 5));
      const again = await repo.upsertIfChanged(fixtureOverlay(`${p}_u2`, base));
      expect(again.status).toBe('unchanged');
      expect(again.record).toEqual(first.record);
      expect(again.record.updatedAt).toBe(first.record.updatedAt);
    });

    test('upsertIfChanged updates changed content: new hash, same createdAt, later updatedAt', async () => {
      const first = await repo.upsertIfChanged(fixtureOverlay(`${p}_u3`, base));
      await new Promise((r) => setTimeout(r, 5));
      const changed = fixtureOverlay(`${p}_u3`, base, { priority: 7 });
      const res = await repo.upsertIfChanged(changed);
      expect(res.status).toBe('updated');
      expect(res.record.overlay).toEqual(changed);
      expect(res.record.priority).toBe(7);
      expect(res.record.contentHash).not.toBe(first.record.contentHash);
      expect(res.record.createdAt).toBe(first.record.createdAt);
      expect(Date.parse(res.record.updatedAt)).toBeGreaterThan(Date.parse(first.record.updatedAt));
    });

    test('retire keeps the row (never delete) and stamps retiredAt', async () => {
      await repo.create(fixtureOverlay(`${p}_r1`, base));
      expect(await repo.retire(`${p}_r1`)).toEqual({ success: true, retiredSlug: `${p}_r1` });
      const kept = await repo.get(`${p}_r1`);
      expect(kept).toBeDefined();
      expect(Number.isNaN(Date.parse(kept?.retiredAt ?? ''))).toBe(false);
    });

    test('retire reports an unknown slug and a double retire without throwing', async () => {
      expect(await repo.retire(`${p}_nope`)).toMatchObject({ success: false });
      await repo.create(fixtureOverlay(`${p}_r2`, base));
      await repo.retire(`${p}_r2`);
      expect(await repo.retire(`${p}_r2`)).toMatchObject({ success: false, error: expect.stringMatching(/already retired/) });
    });

    test('a retired slug is terminal: create and upsertIfChanged reject it', async () => {
      await repo.create(fixtureOverlay(`${p}_r3`, base));
      await repo.retire(`${p}_r3`);
      await expect(repo.upsertIfChanged(fixtureOverlay(`${p}_r3`, base, { priority: 2 }))).rejects.toThrow(/retired/);
      await expect(repo.create(fixtureOverlay(`${p}_r3`, base))).rejects.toThrow();
    });

    test('returned records are the caller’s own copies', async () => {
      await repo.create(fixtureOverlay(`${p}_c1`, base, { ops: [{ op: 'add_items', items: ['x'] }] }));
      const got = await repo.get(`${p}_c1`);
      if (got?.overlay.ops[0].op === 'add_items') got.overlay.ops[0].items.push('mutated');
      const again = await repo.get(`${p}_c1`);
      expect(again?.overlay.ops).toEqual([{ op: 'add_items', items: ['x'] }]);
    });
  });
}
