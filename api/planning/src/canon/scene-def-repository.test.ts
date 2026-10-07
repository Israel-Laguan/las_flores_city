// api/planning/src/canon/scene-def-repository.test.ts
// SC-311: hash + error specifics. Full behaviour is in the shared contract
// (server/tests/helpers/sceneRepositoryContract.ts), run by server/tests/unit.

import { describe, test, expect } from '@jest/globals';
import { createSceneDef, type SceneDef } from '@las-flores/api-contracts';
import {
  InMemorySceneDefRepository,
  SceneDefRetiredError,
  sceneDefContentHash,
} from './scene-def-repository.js';

const scene = (overrides: Partial<SceneDef> = {}): SceneDef =>
  createSceneDef({
    id: 'c3000000-0000-4000-8000-000000000020',
    slug: 'hash_scene',
    title: 't',
    description: 'd',
    location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    ...overrides,
  });

describe('sceneDefContentHash', () => {
  test('is a stable sha256 hex digest', () => {
    expect(sceneDefContentHash(scene())).toMatch(/^[0-9a-f]{64}$/);
    expect(sceneDefContentHash(scene())).toBe(sceneDefContentHash(scene()));
  });

  test('differs when content differs, including array order', () => {
    expect(sceneDefContentHash(scene({ items: ['a', 'b'] }))).not.toBe(sceneDefContentHash(scene({ items: ['b', 'a'] })));
    expect(sceneDefContentHash(scene({ title: 'x' }))).not.toBe(sceneDefContentHash(scene()));
  });
});

describe('InMemorySceneDefRepository', () => {
  test('upsertIfChanged on a retired slug throws SceneDefRetiredError', async () => {
    const repo = new InMemorySceneDefRepository();
    await repo.create(scene());
    await repo.retire('hash_scene');
    await expect(repo.upsertIfChanged(scene({ title: 'again' }))).rejects.toBeInstanceOf(SceneDefRetiredError);
  });

  test('clear empties the store', async () => {
    const repo = new InMemorySceneDefRepository();
    await repo.create(scene());
    repo.clear();
    expect(await repo.list({ includeRetired: true })).toEqual([]);
  });
});
