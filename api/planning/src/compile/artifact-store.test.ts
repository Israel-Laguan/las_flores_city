// api/planning/src/compile/artifact-store.test.ts
// SC-402/406: the integrity rules every ArtifactStore must enforce (in-memory here; the
// shared contract suite in server/tests/helpers runs them against Postgres too).

import { createHash } from 'node:crypto';
import { TRUE, createSceneDef, type SceneArtifactPayload } from '@las-flores/api-contracts';
import { ArtifactIntegrityError, InMemoryArtifactStore, buildSceneArtifactRecord, verifyArtifactRecord } from './artifact-store.js';
import { composeScene } from '../scene/compose-scene.js';

const payload = (title = 'T'): SceneArtifactPayload => {
  const def = createSceneDef({ id: 'c3000000-0000-4000-8000-000000000003', slug: 'gate', title, description: 'd', location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001', availability: TRUE });
  return { scene: composeScene(def, []).scene, district_weather: 'clear' };
};

describe('buildSceneArtifactRecord', () => {
  test('is self-consistent and verifies', () => {
    const r = buildSceneArtifactRecord(payload(), '2026-10-10T00:00:00.000Z');
    expect(() => verifyArtifactRecord(r)).not.toThrow();
    expect(r.artifact.artifact_id).toBe(createHash('sha256').update(r.payload).digest('hex'));
    expect(r.artifact).toMatchObject({ artifact_type: 'scene', name: 'gate', manifest_version: 1, dependencies: [] });
  });

  test('created_at is metadata only: it never changes id or bytes', () => {
    const a = buildSceneArtifactRecord(payload(), '2026-01-01T00:00:00.000Z');
    const b = buildSceneArtifactRecord(payload(), '2030-01-01T00:00:00.000Z');
    expect(a.artifact.artifact_id).toBe(b.artifact.artifact_id);
    expect(a.payload).toBe(b.payload);
  });
});

describe('verifyArtifactRecord rejects', () => {
  const good = () => buildSceneArtifactRecord(payload(), '2026-10-10T00:00:00.000Z');
  test.each([
    ['tampered payload', (r: ReturnType<typeof good>) => ({ ...r, payload: r.payload.replace('"T"', '"U"') })],
    ['wrong size', (r: ReturnType<typeof good>) => ({ ...r, artifact: { ...r.artifact, size_bytes: 1 } })],
    ['id != content_hash', (r: ReturnType<typeof good>) => ({ ...r, artifact: { ...r.artifact, content_hash: 'b'.repeat(64) } })],
    ['uppercase id', (r: ReturnType<typeof good>) => ({ ...r, artifact: { ...r.artifact, artifact_id: r.artifact.artifact_id.toUpperCase(), content_hash: r.artifact.artifact_id.toUpperCase() } })],
  ])('%s', (_n, mutate) => {
    expect(() => verifyArtifactRecord(mutate(good()))).toThrow(ArtifactIntegrityError);
  });

  test('non-JSON payload whose hash matches', () => {
    const bytes = 'not json';
    const id = createHash('sha256').update(bytes).digest('hex');
    const r = { artifact: { ...good().artifact, artifact_id: id, content_hash: id, size_bytes: bytes.length }, payload: bytes };
    expect(() => verifyArtifactRecord(r)).toThrow(/valid JSON/);
  });
});

describe('InMemoryArtifactStore.putMany', () => {
  test('all-or-nothing: one bad record rejects the whole call and writes nothing', async () => {
    const store = new InMemoryArtifactStore();
    const good = buildSceneArtifactRecord(payload('A'), '2026-10-10T00:00:00.000Z');
    const bad = { ...buildSceneArtifactRecord(payload('B'), '2026-10-10T00:00:00.000Z'), payload: '{}' };
    await expect(store.putMany([good, bad])).rejects.toThrow(ArtifactIntegrityError);
    expect(store.size).toBe(0);
  });

  test('duplicates inside one call count once; a second call is unchanged and keeps the first created_at', async () => {
    const store = new InMemoryArtifactStore();
    const first = buildSceneArtifactRecord(payload(), '2026-01-01T00:00:00.000Z');
    const again = buildSceneArtifactRecord(payload(), '2030-01-01T00:00:00.000Z');
    const id = first.artifact.artifact_id;
    expect(await store.putMany([first, again])).toEqual({ created: [id], unchanged: [] });
    expect(await store.putMany([again])).toEqual({ created: [], unchanged: [id] });
    expect((await store.get(id))!.artifact.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  test('get returns a copy: mutating it does not change the store', async () => {
    const store = new InMemoryArtifactStore();
    const r = buildSceneArtifactRecord(payload(), '2026-10-10T00:00:00.000Z');
    await store.putMany([r]);
    const got = (await store.get(r.artifact.artifact_id))!;
    got.artifact.name = 'mutated';
    expect((await store.get(r.artifact.artifact_id))!.artifact.name).toBe('gate');
  });

  test('has returns only existing ids; empty input is fine', async () => {
    const store = new InMemoryArtifactStore();
    const r = buildSceneArtifactRecord(payload(), '2026-10-10T00:00:00.000Z');
    await store.putMany([r]);
    expect(await store.has([r.artifact.artifact_id, 'c'.repeat(64)])).toEqual(new Set([r.artifact.artifact_id]));
    expect(await store.putMany([])).toEqual({ created: [], unchanged: [] });
  });
});
