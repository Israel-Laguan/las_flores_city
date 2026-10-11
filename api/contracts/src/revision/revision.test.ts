// api/contracts/src/revision/revision.test.ts
// SC-404: manifest canonicalisation, hash, id guard.

import { InvalidManifestError, isRevisionId, manifestHash, normaliseManifest, type ManifestEntry } from './revision.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const e = (name: string, artifact_id = A, artifact_type: ManifestEntry['artifact_type'] = 'scene'): ManifestEntry => ({ artifact_type, name, artifact_id });

describe('normaliseManifest', () => {
  test('sorts by (artifact_type, name), independent of input order', () => {
    const m = normaliseManifest([e('z'), e('a', B), e('m', A, 'dialogue')]);
    expect(m.entries.map((x) => `${x.artifact_type}:${x.name}`)).toEqual(['dialogue:m', 'scene:a', 'scene:z']);
  });

  test('collapses an identical repeated entry', () => {
    expect(normaliseManifest([e('a'), e('a')]).entries).toHaveLength(1);
  });

  test('rejects one name mapping to two artifacts', () => {
    expect(() => normaliseManifest([e('a', A), e('a', B)])).toThrow(InvalidManifestError);
  });

  test('the same name under different types is fine', () => {
    expect(normaliseManifest([e('a', A, 'scene'), e('a', B, 'dialogue')]).entries).toHaveLength(2);
  });

  test.each([
    ['uppercase id', e('a', 'A'.repeat(64))],
    ['short id', e('a', 'abc')],
    ['empty name', e('')],
  ])('rejects %s', (_n, entry) => {
    expect(() => normaliseManifest([entry])).toThrow(InvalidManifestError);
  });

  test('does not mutate its input and returns fresh entries', () => {
    const input = [e('b'), e('a')];
    const out = normaliseManifest(input);
    expect(input.map((x) => x.name)).toEqual(['b', 'a']);
    out.entries[0].name = 'changed';
    expect(input[1].name).toBe('a');
  });
});

describe('manifestHash', () => {
  test('is order-independent and 64-hex', () => {
    const h = manifestHash({ entries: [e('b'), e('a')] });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(manifestHash({ entries: [e('a'), e('b')] }));
  });
  test('changes when any entry changes', () => {
    expect(manifestHash({ entries: [e('a', A)] })).not.toBe(manifestHash({ entries: [e('a', B)] }));
    expect(manifestHash({ entries: [e('a')] })).not.toBe(manifestHash({ entries: [e('a'), e('b')] }));
  });
});

describe('isRevisionId', () => {
  test('accepts a lowercase uuid only', () => {
    expect(isRevisionId('e9904000-0000-4000-8000-000000000001')).toBe(true);
    expect(isRevisionId('E9904000-0000-4000-8000-000000000001')).toBe(false);
    expect(isRevisionId('nope')).toBe(false);
    expect(isRevisionId(5)).toBe(false);
  });
});
