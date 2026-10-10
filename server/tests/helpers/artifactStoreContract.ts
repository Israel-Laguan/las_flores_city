import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TRUE, createSceneDef, type SceneArtifactPayload } from '@las-flores/api-contracts';
import {
  ArtifactIntegrityError,
  buildSceneArtifactRecord,
  composeScene,
  type ArtifactRecord,
  type ArtifactStore,
} from '@las-flores/api-planning';

/**
 * Shared behavioural contract for every ArtifactStore implementation (SC-402/406). Run
 * against InMemoryArtifactStore (unit) and PgArtifactStore (integration) so the two cannot
 * drift. Same shape as sceneRepositoryContract.
 *
 * Fixtures: artifacts are content-addressed, so a fixture's id is fixed by its content; every
 * fixture's scene slug starts with `slugPrefix` (unique per suite — collision avoidance so
 * parallel Jest workers never share a row) and `cleanup()` runs in afterAll.
 */

const LOCATION = 'e9900000-0000-4000-8000-0000000000a1';
const CREATED = '2026-10-10T00:00:00.000Z';

export function fixtureRecord(slug: string, title = slug, createdAt = CREATED): ArtifactRecord {
  const def = createSceneDef({
    id: 'e9900000-0000-4000-8000-0000000000b1',
    slug,
    title,
    description: 'fixture',
    location: LOCATION,
    availability: TRUE,
  });
  const payload: SceneArtifactPayload = { scene: composeScene(def, []).scene, district_weather: 'clear' };
  return buildSceneArtifactRecord(payload, createdAt);
}

export function artifactStoreContract(
  name: string,
  makeStore: () => ArtifactStore,
  opts: { slugPrefix: string; cleanup?: () => Promise<void> },
): void {
  describe(`ArtifactStore contract: ${name}`, () => {
    const p = opts.slugPrefix;
    let store: ArtifactStore;

    beforeAll(() => {
      store = makeStore();
    });
    afterAll(async () => {
      await opts.cleanup?.();
    });

    test('putMany creates; get returns the exact bytes and metadata; has sees it', async () => {
      const r = fixtureRecord(`${p}_a`);
      const id = r.artifact.artifact_id;
      expect(await store.putMany([r])).toEqual({ created: [id], unchanged: [] });
      const got = await store.get(id);
      expect(got).toEqual(r);
      expect(got!.payload).toBe(r.payload);
      expect(await store.has([id])).toEqual(new Set([id]));
    });

    test('putting the same artifact again is unchanged and keeps the first created_at', async () => {
      const first = fixtureRecord(`${p}_b`, 'b', '2026-01-01T00:00:00.000Z');
      const again = fixtureRecord(`${p}_b`, 'b', '2030-01-01T00:00:00.000Z');
      const id = first.artifact.artifact_id;
      expect(again.artifact.artifact_id).toBe(id);
      await store.putMany([first]);
      expect(await store.putMany([again])).toEqual({ created: [], unchanged: [id] });
      expect((await store.get(id))!.artifact.created_at).toBe('2026-01-01T00:00:00.000Z');
    });

    test('duplicates inside one call count once; mixed new and existing split correctly', async () => {
      const existing = fixtureRecord(`${p}_c1`);
      const fresh = fixtureRecord(`${p}_c2`);
      await store.putMany([existing]);
      const result = await store.putMany([fresh, existing, fresh]);
      expect(result).toEqual({ created: [fresh.artifact.artifact_id], unchanged: [existing.artifact.artifact_id] });
    });

    test('is all-or-nothing: one tampered record rejects the call and writes NOTHING', async () => {
      const good = fixtureRecord(`${p}_d1`);
      const tampered = { ...fixtureRecord(`${p}_d2`), payload: '{"tampered":true}' };
      await expect(store.putMany([good, tampered])).rejects.toThrow(ArtifactIntegrityError);
      expect(await store.get(good.artifact.artifact_id)).toBeUndefined();
    });

    test.each([
      ['wrong size', (r: ArtifactRecord) => ({ ...r, artifact: { ...r.artifact, size_bytes: r.artifact.size_bytes + 1 } })],
      ['id differs from content_hash', (r: ArtifactRecord) => ({ ...r, artifact: { ...r.artifact, content_hash: 'b'.repeat(64) } })],
      ['uppercase id', (r: ArtifactRecord) => ({ ...r, artifact: { ...r.artifact, artifact_id: r.artifact.artifact_id.toUpperCase(), content_hash: r.artifact.artifact_id.toUpperCase() } })],
    ])('rejects %s', async (_n, mutate) => {
      await expect(store.putMany([mutate(fixtureRecord(`${p}_e`))])).rejects.toThrow(ArtifactIntegrityError);
    });

    test('get returns undefined for unknown and malformed ids; has returns only existing ids', async () => {
      const r = fixtureRecord(`${p}_f`);
      await store.putMany([r]);
      expect(await store.get('c'.repeat(64))).toBeUndefined();
      expect(await store.get('not-an-id')).toBeUndefined();
      expect(await store.has([r.artifact.artifact_id, 'c'.repeat(64), 'bad'])).toEqual(new Set([r.artifact.artifact_id]));
    });

    test('an empty call is a no-op', async () => {
      expect(await store.putMany([])).toEqual({ created: [], unchanged: [] });
      expect(await store.has([])).toEqual(new Set());
    });

    test('a large batch lands in one call, sorted', async () => {
      const batch = Array.from({ length: 60 }, (_, i) => fixtureRecord(`${p}_g${String(i).padStart(2, '0')}`));
      const result = await store.putMany(batch);
      expect(result.created).toEqual(batch.map((r) => r.artifact.artifact_id).sort());
      expect(result.unchanged).toEqual([]);
    });

    test('get returns an independent copy', async () => {
      const r = fixtureRecord(`${p}_h`);
      await store.putMany([r]);
      const got = (await store.get(r.artifact.artifact_id))!;
      got.artifact.name = 'mutated';
      got.artifact.dependencies.push('x');
      expect((await store.get(r.artifact.artifact_id))!.artifact).toEqual(r.artifact);
    });
  });
}
