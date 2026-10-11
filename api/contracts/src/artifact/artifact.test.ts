// api/contracts/src/artifact/artifact.test.ts
// D3: one identity per artifact — lowercase hex sha256, id === content_hash.

import { ARTIFACT_ID_PATTERN, createArtifactId, isArtifact, isArtifactId, isArtifactManifest, validateContentHash } from './artifact.js';

const HEX = 'a'.repeat(64);

describe('createArtifactId (D3)', () => {
  test('returns lowercase hex unchanged', () => {
    expect(createArtifactId(HEX)).toBe(HEX);
  });

  test('lowercases uppercase hex', () => {
    expect(createArtifactId('ABCDEF0123456789'.repeat(4))).toBe('abcdef0123456789'.repeat(4));
  });

  test.each([
    ['empty', ''],
    ['too short', 'abc'],
    ['too long', 'a'.repeat(65)],
    ['non-hex', 'g'.repeat(64)],
    ['base64url sha256', 'A'.repeat(43)],
    ['padded base64url', `${'A'.repeat(43)}=`],
    ['whitespace', ` ${'a'.repeat(63)}`],
  ])('throws on %s', (_name, input) => {
    expect(() => createArtifactId(input)).toThrow(TypeError);
  });

  test('throws on non-strings', () => {
    expect(() => createArtifactId(undefined as never)).toThrow(TypeError);
  });
});

describe('isArtifactId', () => {
  test('accepts only canonical lowercase hex', () => {
    expect(isArtifactId(HEX)).toBe(true);
    expect(isArtifactId(HEX.toUpperCase())).toBe(false);
    expect(isArtifactId('A'.repeat(43))).toBe(false);
    expect(isArtifactId(7)).toBe(false);
    expect(ARTIFACT_ID_PATTERN.test(HEX)).toBe(true);
  });
});

const artifact = (over: Record<string, unknown> = {}) => ({
  manifest_version: 1,
  artifact_id: HEX,
  artifact_type: 'scene',
  content_hash: HEX,
  name: 'x',
  created_at: '2026-10-10T00:00:00.000Z',
  size_bytes: 3,
  dependencies: [],
  ...over,
});

describe('isArtifact identity rule', () => {
  test('accepts id === content_hash', () => {
    expect(isArtifact(artifact())).toBe(true);
  });
  test('rejects an id that differs from the content hash', () => {
    expect(isArtifact(artifact({ content_hash: 'b'.repeat(64) }))).toBe(false);
  });
  test('rejects a non-canonical id', () => {
    expect(isArtifact(artifact({ artifact_id: 'A'.repeat(43), content_hash: 'A'.repeat(43) }))).toBe(false);
  });
  test('manifest guard applies the same rule', () => {
    const { manifest_version: _v, ...body } = artifact();
    expect(isArtifactManifest({ manifest_version: 1, artifact: body, content_url: 'file:///x' })).toBe(true);
    expect(isArtifactManifest({ manifest_version: 1, artifact: { ...body, artifact_id: 'x' }, content_url: 'file:///x' })).toBe(false);
  });
});

describe('validateContentHash (read side stays lenient)', () => {
  test('still accepts hex and base64url', () => {
    expect(validateContentHash(HEX)).toBe(true);
    expect(validateContentHash('A'.repeat(43))).toBe(true);
    expect(validateContentHash('nope')).toBe(false);
  });
});
