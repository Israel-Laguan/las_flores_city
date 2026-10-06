import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import type { FlagRegistry } from '@las-flores/api-planning';

/**
 * Shared behavioural contract for every FlagRegistry implementation (BF-303).
 * Run against InMemoryFlagRegistry (unit) and PgFlagRegistry (integration) so the
 * two cannot drift.
 *
 * Fixtures: every slug carries `slugPrefix` (unique per suite — collision-avoidance
 * so parallel Jest workers never touch each other's rows) and `cleanup()` runs in
 * afterAll.
 */
export function flagRegistryContract(
  name: string,
  makeRegistry: () => FlagRegistry,
  opts: { slugPrefix: string; cleanup?: () => Promise<void> },
): void {
  describe(`FlagRegistry contract: ${name}`, () => {
    const p = opts.slugPrefix;
    let registry: FlagRegistry;

    beforeAll(() => {
      registry = makeRegistry();
    });
    afterAll(async () => {
      await opts.cleanup?.();
    });

    test('create returns the definition with timestamps; get reads it back', async () => {
      const created = await registry.create({ slug: `${p}_a`, meaning: 'meaning a', semantics: 'latching' });
      expect(created).toMatchObject({ slug: `${p}_a`, meaning: 'meaning a', semantics: 'latching' });
      expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
      expect(Number.isNaN(Date.parse(created.updatedAt))).toBe(false);
      expect(await registry.get(`${p}_a`)).toEqual(created);
    });

    test('get returns undefined for an unknown slug', async () => {
      expect(await registry.get(`${p}_missing`)).toBeUndefined();
    });

    test('create rejects a duplicate slug', async () => {
      await registry.create({ slug: `${p}_dup`, meaning: 'x', semantics: 'latching' });
      await expect(
        registry.create({ slug: `${p}_dup`, meaning: 'y', semantics: 'tracking' }),
      ).rejects.toThrow(/already exists/);
    });

    test('create rejects an invalid slug', async () => {
      await expect(
        registry.create({ slug: `1${p}_bad`, meaning: 'x', semantics: 'latching' }),
      ).rejects.toThrow();
      await expect(
        registry.create({ slug: `${p}-bad`, meaning: 'x', semantics: 'latching' }),
      ).rejects.toThrow();
    });

    test('list returns created flags oldest first', async () => {
      await registry.create({ slug: `${p}_l1`, meaning: 'x', semantics: 'latching' });
      await new Promise((r) => setTimeout(r, 5));
      await registry.create({ slug: `${p}_l2`, meaning: 'x', semantics: 'tracking' });
      const mine = (await registry.list()).map((f) => f.slug).filter((s) => s.startsWith(`${p}_l`));
      expect(mine).toEqual([`${p}_l1`, `${p}_l2`]);
    });

    test('listBySemantics filters by semantics', async () => {
      await registry.create({ slug: `${p}_s1`, meaning: 'x', semantics: 'latching' });
      await registry.create({ slug: `${p}_s2`, meaning: 'x', semantics: 'tracking' });
      const latching = (await registry.listBySemantics('latching')).map((f) => f.slug);
      const tracking = (await registry.listBySemantics('tracking')).map((f) => f.slug);
      expect(latching).toContain(`${p}_s1`);
      expect(latching).not.toContain(`${p}_s2`);
      expect(tracking).toContain(`${p}_s2`);
      expect(tracking).not.toContain(`${p}_s1`);
    });

    test('exists and getAllSlugs reflect active flags', async () => {
      await registry.create({ slug: `${p}_e`, meaning: 'x', semantics: 'latching' });
      expect(await registry.exists(`${p}_e`)).toBe(true);
      expect(await registry.exists(`${p}_nope`)).toBe(false);
      const slugs = await registry.getAllSlugs();
      expect(slugs).toContain(`${p}_e`);
      expect([...slugs].sort()).toEqual(slugs);
    });

    describe('retire', () => {
      const slug = `${p}_r`;

      test('retiring keeps the row but hides it from active views', async () => {
        await registry.create({ slug, meaning: 'x', semantics: 'latching' });
        expect(await registry.retire(slug)).toEqual({ success: true, retiredSlug: slug });

        expect(await registry.get(slug)).toMatchObject({ slug });
        expect((await registry.list()).map((f) => f.slug)).toContain(slug);
        expect(await registry.exists(slug)).toBe(false);
        expect(await registry.getAllSlugs()).not.toContain(slug);
        expect((await registry.listBySemantics('latching')).map((f) => f.slug)).not.toContain(slug);
      });

      test('retiring twice reports already retired', async () => {
        const result = await registry.retire(slug);
        expect(result.success).toBe(false);
        expect(result.retiredSlug).toBe(slug);
        expect(result.error).toMatch(/already retired/);
      });

      test('retiring an unknown slug reports not found', async () => {
        const result = await registry.retire(`${p}_ghost`);
        expect(result.success).toBe(false);
        expect(result.retiredSlug).toBeUndefined();
        expect(result.error).toMatch(/not found/);
      });
    });
  });
}
