// SC-M3 T1: compile personality pools + character links into content-addressed artifacts.

import {
  characterPoolsArtifactFromBytes,
  createPersonalityPool,
  personalityPoolArtifactFromBytes,
  type PersonalityPool,
} from '@las-flores/api-contracts';
import { InMemoryCharacterPoolRepository, InMemoryPersonalityPoolRepository, personalityPoolContentHash } from '../canon/personality-pool-repository.js';
import { InMemoryArtifactStore } from './artifact-store.js';
import { compilePools, type CompilePoolsDeps } from './compile-pools.js';
import { InMemoryContentLookup } from './content-lookup.js';
import { InMemoryRevisionRepository, manifestFromRecords } from './revision-repository.js';

const FIXED = () => new Date('2026-10-10T00:00:00.000Z');
const pool = (slug: string, text = 'hi'): PersonalityPool =>
  createPersonalityPool({ slug, lines: [{ line_id: 'hello', text, when: {} }] });

async function setup(characters: readonly string[] = ['ana', 'bo', 'cy']) {
  const pools = new InMemoryPersonalityPoolRepository();
  const links = new InMemoryCharacterPoolRepository(pools);
  const content = new InMemoryContentLookup({ characters });
  const deps: CompilePoolsDeps = { pools, links, content, now: FIXED };
  return { pools, links, deps };
}

describe('compilePools', () => {
  test('a pool shared by two characters: one pool artifact, one link artifact per character', async () => {
    const { pools, links, deps } = await setup();
    await pools.create(pool('vendor'));
    await links.link('ana', 'vendor');
    await links.link('bo', 'vendor');

    const { ok, issues, records } = await compilePools(deps);
    expect(ok).toBe(true);
    expect(issues).toEqual([]);
    const byKey = new Map(records.map((r) => [`${r.artifact.artifact_type}:${r.artifact.name}`, r]));
    expect([...byKey.keys()].sort()).toEqual(['character_pools:ana', 'character_pools:bo', 'personality_pool:vendor']);

    const poolRec = byKey.get('personality_pool:vendor')!;
    // Identity: the artifact id IS the planning content hash (one identity per pool).
    expect(poolRec.artifact.artifact_id).toBe(personalityPoolContentHash(pool('vendor')));
    expect(personalityPoolArtifactFromBytes(poolRec.payload)).toEqual(pool('vendor'));
    expect(characterPoolsArtifactFromBytes(byKey.get('character_pools:ana')!.payload).pools).toEqual(['vendor']);
    expect(characterPoolsArtifactFromBytes(byKey.get('character_pools:bo')!.payload).pools).toEqual(['vendor']);
  });

  test('a character in two pools gets one link naming both, sorted', async () => {
    const { pools, links, deps } = await setup();
    await pools.create(pool('zeta'));
    await pools.create(pool('alpha'));
    await links.link('ana', 'zeta');
    await links.link('ana', 'alpha');
    const { records } = await compilePools(deps);
    const link = records.find((r) => r.artifact.artifact_type === 'character_pools')!;
    expect(characterPoolsArtifactFromBytes(link.payload).pools).toEqual(['alpha', 'zeta']);
  });

  test('only ACTIVE pools compile; a character whose pools are all retired gets no link artifact', async () => {
    const { pools, links, deps } = await setup();
    await pools.create(pool('live'));
    await pools.create(pool('gone'));
    await links.link('ana', 'live');
    await links.link('ana', 'gone');
    await links.link('bo', 'gone');
    await pools.retire('gone');
    const { records } = await compilePools(deps);
    expect(records.map((r) => `${r.artifact.artifact_type}:${r.artifact.name}`).sort()).toEqual(['character_pools:ana', 'personality_pool:live']);
    expect(characterPoolsArtifactFromBytes(records.find((r) => r.artifact.name === 'ana')!.payload).pools).toEqual(['live']);
  });

  test('a pool with no characters still compiles; no pools = no records', async () => {
    const { pools, deps } = await setup();
    expect((await compilePools(deps)).records).toEqual([]);
    await pools.create(pool('lonely'));
    const { records } = await compilePools(deps);
    expect(records.map((r) => r.artifact.name)).toEqual(['lonely']);
  });

  test('R10: a link to a character that does not exist fails the whole compile (no records)', async () => {
    const { pools, links, deps } = await setup(['ana']);
    await pools.create(pool('vendor'));
    await links.link('ana', 'vendor');
    await links.link('ghost', 'vendor');
    const { ok, issues, records } = await compilePools(deps);
    expect(ok).toBe(false);
    expect(records).toEqual([]);
    expect(issues).toEqual([expect.objectContaining({ code: 'COMPILE_POOL_CHARACTER_MISSING', severity: 'error', path: 'character:ghost' })]);
  });

});

describe('compilePools: identity and publishing', () => {
  test('deterministic and idempotent: same canon -> identical ids, in the same order; timestamps are metadata only', async () => {
    const { pools, links, deps } = await setup();
    await pools.create(pool('b'));
    await pools.create(pool('a'));
    await links.link('bo', 'a');
    await links.link('ana', 'b');
    const first = await compilePools(deps);
    const second = await compilePools({ ...deps, now: () => new Date('2030-01-01T00:00:00Z') });
    expect(second.records.map((r) => r.artifact.artifact_id)).toEqual(first.records.map((r) => r.artifact.artifact_id));
    expect(first.records.map((r) => `${r.artifact.artifact_type}:${r.artifact.name}`)).toEqual([
      'character_pools:ana',
      'character_pools:bo',
      'personality_pool:a',
      'personality_pool:b',
    ]);
    const store = new InMemoryArtifactStore();
    expect((await store.putMany(first.records)).created).toHaveLength(4);
    expect((await store.putMany(second.records)).created).toEqual([]);
  });

  test('editing a pool changes only that pool id; linking another character changes no pool id', async () => {
    const { pools, links, deps } = await setup();
    await pools.create(pool('vendor'));
    await links.link('ana', 'vendor');
    const before = await compilePools(deps);
    await links.link('bo', 'vendor');
    const afterLink = await compilePools(deps);
    const idOf = (r: typeof before, name: string) => r.records.find((x) => x.artifact.name === name)!.artifact.artifact_id;
    expect(idOf(afterLink, 'vendor')).toBe(idOf(before, 'vendor'));
    expect(idOf(afterLink, 'ana')).toBe(idOf(before, 'ana'));
    await pools.upsertIfChanged(pool('vendor', 'changed'));
    const afterEdit = await compilePools(deps);
    expect(idOf(afterEdit, 'vendor')).not.toBe(idOf(afterLink, 'vendor'));
    expect(idOf(afterEdit, 'ana')).toBe(idOf(afterLink, 'ana'));
  });

  test('slugs option compiles only those pools (and links computed from them)', async () => {
    const { pools, links, deps } = await setup();
    await pools.create(pool('one'));
    await pools.create(pool('two'));
    await links.link('ana', 'one');
    await links.link('ana', 'two');
    const { records } = await compilePools(deps, { slugs: ['one'] });
    expect(records.map((r) => `${r.artifact.artifact_type}:${r.artifact.name}`).sort()).toEqual(['character_pools:ana', 'personality_pool:one']);
    expect(characterPoolsArtifactFromBytes(records.find((r) => r.artifact.name === 'ana')!.payload).pools).toEqual(['one']);
  });

  test('pool records join a scene-style publish: the manifest is just more entries', async () => {
    const { pools, links, deps } = await setup();
    await pools.create(pool('vendor'));
    await links.link('ana', 'vendor');
    const { records } = await compilePools(deps);
    const store = new InMemoryArtifactStore();
    const repo = new InMemoryRevisionRepository(store);
    const res = await repo.publish({ records, expectedActive: null, note: 't' });
    expect(res.ok).toBe(true);
    expect(manifestFromRecords(records).entries.map((e) => `${e.artifact_type}:${e.name}`)).toEqual(['character_pools:ana', 'personality_pool:vendor']);
  });
});
