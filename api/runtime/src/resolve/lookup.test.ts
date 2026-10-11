// SC-M3 T2 (SC-502): revision-scoped artifact lookup. Runtime resolves by (revisionId, type, name)
// and never reads the active-revision pointer.

import {
  createPersonalityPool,
  stringifyCharacterPoolsArtifact,
  stringifyPersonalityPoolArtifact,
} from '@las-flores/api-contracts';
import { InMemoryArtifactReader, InMemoryRevisionManifestReader } from './in-memory.js';
import { stored } from './test-support.js';
import { ArtifactLookupError, RevisionScopedLookup } from './lookup.js';

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

const pool = (slug: string, text: string) => stored('personality_pool', slug, stringifyPersonalityPoolArtifact(createPersonalityPool({ slug, lines: [{ line_id: 'hello', text, when: {} }] })));

function world() {
  const artifacts = new InMemoryArtifactReader();
  const manifests = new InMemoryRevisionManifestReader();
  const v1 = pool('vendor', 'v1 text');
  const v2 = pool('vendor', 'v2 text');
  const link = stored('character_pools', 'ana', stringifyCharacterPoolsArtifact({ character_slug: 'ana', pools: ['vendor'] }));
  for (const a of [v1, v2, link]) artifacts.add(a);
  manifests.add(R1, [v1, link]);
  manifests.add(R2, [v2]);
  // getActive must never be reached: the lookup type does not even offer it, but fail loudly if it is.
  return { artifacts, manifests, v1, v2, link, lookup: new RevisionScopedLookup({ revisions: manifests, artifacts }) };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return undefined;
  } catch (e) {
    expect(e).toBeInstanceOf(ArtifactLookupError);
    return (e as ArtifactLookupError).code;
  }
};

describe('RevisionScopedLookup', () => {
  test('returns the artifact the revision names, bytes identical', async () => {
    const { lookup, v1, link } = world();
    expect(await lookup.get(R1, 'personality_pool', 'vendor')).toEqual(v1);
    expect((await lookup.get(R1, 'character_pools', 'ana')).payload).toBe(link.payload);
  });

  test('one name, two revisions, two artifacts: resolution follows the revision id only', async () => {
    const { lookup, v1, v2 } = world();
    expect((await lookup.get(R1, 'personality_pool', 'vendor')).artifact.artifact_id).toBe(v1.artifact.artifact_id);
    expect((await lookup.get(R2, 'personality_pool', 'vendor')).artifact.artifact_id).toBe(v2.artifact.artifact_id);
    expect(v1.artifact.artifact_id).not.toBe(v2.artifact.artifact_id);
  });

  test('typed errors, each distinct, none falls back to another revision', async () => {
    const { lookup, artifacts, manifests } = world();
    expect(await code(lookup.get('33333333-3333-4333-8333-333333333333', 'personality_pool', 'vendor'))).toBe('revision_missing');
    expect(await code(lookup.get(R2, 'character_pools', 'ana'))).toBe('artifact_not_in_revision'); // exists in R1 only
    expect(await code(lookup.get(R1, 'scene', 'vendor'))).toBe('artifact_not_in_revision'); // right name, wrong type

    const ghost = stored('personality_pool', 'ghost', '{"ghost":1}');
    manifests.add('44444444-4444-4444-8444-444444444444', [ghost]); // manifest names bytes nobody stored
    expect(await code(lookup.get('44444444-4444-4444-8444-444444444444', 'personality_pool', 'ghost'))).toBe('artifact_missing');

    const good = stored('personality_pool', 'bad', '{"bad":1}');
    artifacts.add({ artifact: good.artifact, payload: '{"bad":2}' }); // bytes no longer hash to the id
    manifests.add('55555555-5555-4555-8555-555555555555', [good]);
    expect(await code(lookup.get('55555555-5555-4555-8555-555555555555', 'personality_pool', 'bad'))).toBe('artifact_corrupt');
  });

  test('an artifact whose stored type disagrees with the manifest entry is corrupt', async () => {
    const { artifacts, manifests, lookup } = world();
    const wrongType = stored('scene', 'x', '{"x":1}');
    artifacts.add(wrongType);
    manifests.addEntries('66666666-6666-4666-8666-666666666666', [{ artifact_type: 'personality_pool', name: 'x', artifact_id: wrongType.artifact.artifact_id }]);
    expect(await code(lookup.get('66666666-6666-4666-8666-666666666666', 'personality_pool', 'x'))).toBe('artifact_corrupt');
  });

  test('typed getters parse strictly; unparseable bytes are artifact_corrupt, absent link is undefined', async () => {
    const { lookup, artifacts, manifests } = world();
    expect((await lookup.getPool(R1, 'vendor')).lines[0].text).toBe('v1 text');
    expect((await lookup.getCharacterPools(R1, 'ana'))?.pools).toEqual(['vendor']);
    expect(await lookup.getCharacterPools(R1, 'nobody')).toBeUndefined();
    expect(await lookup.getCharacterPools(R2, 'ana')).toBeUndefined(); // no link in R2 = no pools, not an error

    const junk = stored('personality_pool', 'junk', '{"not":"a pool"}');
    artifacts.add(junk);
    manifests.add('77777777-7777-4777-8777-777777777777', [junk]);
    expect(await code(lookup.getPool('77777777-7777-4777-8777-777777777777', 'junk'))).toBe('artifact_corrupt');
    // revision-level failures are still errors for the optional getter
    expect(await code(lookup.getCharacterPools('33333333-3333-4333-8333-333333333333', 'ana'))).toBe('revision_missing');
  });

  test('never reads the active-revision pointer: a source whose getActive explodes is never tripped', async () => {
    const { artifacts, manifests } = world();
    const guarded = {
      getRevision: (id: string) => manifests.getRevision(id),
      getActive: () => {
        throw new Error('lookup must not read the active pointer');
      },
    };
    const lookup = new RevisionScopedLookup({ revisions: guarded, artifacts });
    await lookup.get(R1, 'personality_pool', 'vendor');
    await lookup.getPool(R2, 'vendor');
    expect(await lookup.getCharacterPools(R2, 'ana')).toBeUndefined();
  });
});
