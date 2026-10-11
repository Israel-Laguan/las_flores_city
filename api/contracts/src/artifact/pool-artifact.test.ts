// api/contracts/src/artifact/pool-artifact.test.ts
// SC-M3 T1: canonical bytes, identity and strict parsing of the two pool artifact kinds.

import { createHash } from 'node:crypto';
import { ARTIFACT_TYPES } from './artifact.js';
import {
  CHARACTER_POOLS_ARTIFACT_SCHEMA_VERSION,
  InvalidPoolArtifactError,
  characterPoolsArtifactContentHash,
  characterPoolsArtifactFromBytes,
  personalityPoolArtifactContentHash,
  personalityPoolArtifactFromBytes,
  stringifyCharacterPoolsArtifact,
  stringifyPersonalityPoolArtifact,
} from './pool-artifact.js';
import { createPersonalityPool, stringifyPersonalityPool } from '../dialogue/personality-pool.js';

const pool = () =>
  createPersonalityPool({
    slug: 'street_vendor',
    lines: [
      { line_id: 'hello', text: 'Fresh today!', when: {} },
      { line_id: 'rain_hello', text: 'Wet day.', when: { weather: ['rain'] } },
    ],
  });
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('artifact types', () => {
  test('personality_pool and character_pools are artifact types; existing ones stay', () => {
    for (const t of ['scene', 'dialogue', 'mission', 'character', 'overlay', 'personality_pool', 'character_pools']) {
      expect(ARTIFACT_TYPES.has(t)).toBe(true);
    }
    expect(ARTIFACT_TYPES.size).toBe(7);
  });
});

describe('personality_pool artifact', () => {
  test('bytes are exactly the planning canonical pool bytes, so id == the pool content hash', () => {
    expect(stringifyPersonalityPoolArtifact(pool())).toBe(stringifyPersonalityPool(pool()));
    expect(personalityPoolArtifactContentHash(pool())).toBe(sha(stringifyPersonalityPool(pool())));
  });

  test('round trips through strict parse; authoring key order does not change the id', () => {
    const bytes = stringifyPersonalityPoolArtifact(pool());
    expect(personalityPoolArtifactFromBytes(bytes)).toEqual(pool());
    const reordered = JSON.stringify({ slug: 'street_vendor', schema_version: 1, lines: JSON.parse(bytes).lines });
    expect(personalityPoolArtifactFromBytes(reordered)).toEqual(pool());
  });

  test('rejects non-JSON and invalid pools with InvalidPoolArtifactError', () => {
    expect(() => personalityPoolArtifactFromBytes('{nope')).toThrow(InvalidPoolArtifactError);
    expect(() => personalityPoolArtifactFromBytes(JSON.stringify({ slug: 'x', schema_version: 1, lines: [], traits: [] }))).toThrow(
      InvalidPoolArtifactError,
    );
  });
});

describe('character_pools artifact', () => {
  const payload = { character_slug: 'valentina_quan', pools: ['street_vendor', 'night_owl'] };

  test('canonical bytes: sorted keys, pool slugs sorted + de-duplicated, versioned', () => {
    const bytes = stringifyCharacterPoolsArtifact({ character_slug: 'valentina_quan', pools: ['street_vendor', 'night_owl', 'street_vendor'] });
    expect(bytes).toBe(
      JSON.stringify({ character_slug: 'valentina_quan', pools: ['night_owl', 'street_vendor'], schema_version: CHARACTER_POOLS_ARTIFACT_SCHEMA_VERSION }),
    );
    expect(characterPoolsArtifactContentHash(payload)).toBe(sha(stringifyCharacterPoolsArtifact(payload)));
  });

  test('round trips; pool order in the input never changes the id', () => {
    const a = characterPoolsArtifactContentHash({ character_slug: 'c', pools: ['b', 'a'] });
    const b = characterPoolsArtifactContentHash({ character_slug: 'c', pools: ['a', 'b'] });
    expect(a).toBe(b);
    expect(characterPoolsArtifactFromBytes(stringifyCharacterPoolsArtifact(payload))).toEqual({
      character_slug: 'valentina_quan',
      pools: ['night_owl', 'street_vendor'],
    });
  });

  test.each([
    ['not json', '{x'],
    ['not an object', '[]'],
    ['unknown field', JSON.stringify({ character_slug: 'c', pools: ['a'], schema_version: 1, extra: 1 })],
    ['missing pools', JSON.stringify({ character_slug: 'c', schema_version: 1 })],
    ['empty pools (a link artifact with no pools must not exist)', JSON.stringify({ character_slug: 'c', pools: [], schema_version: 1 })],
    ['bad character slug', JSON.stringify({ character_slug: 'Bad Slug', pools: ['a'], schema_version: 1 })],
    ['bad pool slug', JSON.stringify({ character_slug: 'c', pools: ['no spaces'], schema_version: 1 })],
    ['wrong version', JSON.stringify({ character_slug: 'c', pools: ['a'], schema_version: 2 })],
    ['unsorted pools', JSON.stringify({ character_slug: 'c', pools: ['b', 'a'], schema_version: 1 })],
    ['duplicate pools', JSON.stringify({ character_slug: 'c', pools: ['a', 'a'], schema_version: 1 })],
  ])('rejects %s', (_name, bytes) => {
    expect(() => characterPoolsArtifactFromBytes(bytes)).toThrow(InvalidPoolArtifactError);
  });

  test('stringify refuses an empty or invalid link', () => {
    expect(() => stringifyCharacterPoolsArtifact({ character_slug: 'c', pools: [] })).toThrow(InvalidPoolArtifactError);
    expect(() => stringifyCharacterPoolsArtifact({ character_slug: 'Bad Slug', pools: ['a'] })).toThrow(InvalidPoolArtifactError);
  });
});
