// SC-M3 T2: the personality rung served from artifacts of ONE revision (SC-M2 exit criterion 4,
// now at runtime level): a pool shared by two characters resolves for both, and a pool retired
// in a later revision is still served from the earlier one.

import {
  createPersonalityPool,
  stringifyCharacterPoolsArtifact,
  stringifyPersonalityPoolArtifact,
  type ComposedScene,
} from '@las-flores/api-contracts';
import { resolveCharacterLineAt } from './character-line.js';
import { InMemoryArtifactReader, InMemoryRevisionManifestReader } from './in-memory.js';
import { RevisionScopedLookup } from './lookup.js';
import { stored } from './test-support.js';

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

const vendor = stored(
  'personality_pool',
  'vendor',
  stringifyPersonalityPoolArtifact(
    createPersonalityPool({
      slug: 'vendor',
      lines: [
        { line_id: 'a_hello', text: 'Fresh today!', when: {} },
        { line_id: 'b_rain', text: 'Wet day, hot soup.', when: { weather: ['rain'] } },
      ],
    }),
  ),
);
const link = (c: string, pools: string[]) => stored('character_pools', c, stringifyCharacterPoolsArtifact({ character_slug: c, pools }));

function setup() {
  const artifacts = new InMemoryArtifactReader();
  const manifests = new InMemoryRevisionManifestReader();
  const ana = link('ana', ['vendor']);
  const bo = link('bo', ['vendor']);
  for (const a of [vendor, ana, bo]) artifacts.add(a);
  manifests.add(R1, [vendor, ana, bo]); // pool shared by two characters
  manifests.add(R2, []); // pool retired and links dropped in the next revision
  return new RevisionScopedLookup({ revisions: manifests, artifacts });
}

describe('resolveCharacterLineAt', () => {
  test('a pool shared by two characters resolves for both, by context', async () => {
    const lookup = setup();
    for (const c of ['ana', 'bo']) {
      expect((await resolveCharacterLineAt(lookup, R1, { characterSlug: c, ctx: {} }))?.text).toBe('Fresh today!');
      const rain = await resolveCharacterLineAt(lookup, R1, { characterSlug: c, ctx: { weather: 'rain' } });
      expect(rain).toMatchObject({ rung: 'personality', line_id: 'b_rain', source: 'vendor' });
    }
  });

  test('a character with no link artifact has no personality line; an unknown revision is an error', async () => {
    const lookup = setup();
    expect(await resolveCharacterLineAt(lookup, R1, { characterSlug: 'cy', ctx: {} })).toBeUndefined();
    await expect(resolveCharacterLineAt(lookup, '33333333-3333-4333-8333-333333333333', { characterSlug: 'ana', ctx: {} })).rejects.toMatchObject({ code: 'revision_missing' });
  });

  test('revision-scoped: the pool retired in R2 is gone there but still served from R1', async () => {
    const lookup = setup();
    expect(await resolveCharacterLineAt(lookup, R2, { characterSlug: 'ana', ctx: {} })).toBeUndefined();
    expect((await resolveCharacterLineAt(lookup, R1, { characterSlug: 'ana', ctx: {} }))?.text).toBe('Fresh today!');
  });

  test('the scene rung beats the personality rung; scene and slotId come together', async () => {
    const lookup = setup();
    const scene: Pick<ComposedScene, 'slot_lines'> = { slot_lines: [{ slot_id: 'stall', line_id: 'special', text: 'Today only!', when: {} }] };
    const line = await resolveCharacterLineAt(lookup, R1, { characterSlug: 'ana', ctx: {}, scene, slotId: 'stall' });
    expect(line).toMatchObject({ rung: 'scene', text: 'Today only!' });
    await expect(resolveCharacterLineAt(lookup, R1, { characterSlug: 'ana', ctx: {}, scene })).rejects.toThrow(/together/);
  });

  test('a link naming a pool the revision does not contain is an inconsistent revision, not a silent skip', async () => {
    const artifacts = new InMemoryArtifactReader();
    const manifests = new InMemoryRevisionManifestReader();
    const dangling = link('ana', ['missing_pool']);
    artifacts.add(dangling);
    manifests.add(R1, [dangling]);
    await expect(resolveCharacterLineAt(new RevisionScopedLookup({ revisions: manifests, artifacts }), R1, { characterSlug: 'ana', ctx: {} })).rejects.toMatchObject({
      code: 'artifact_not_in_revision',
    });
  });
});
