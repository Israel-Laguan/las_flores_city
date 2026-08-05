// ============================================================
// resolveBackgroundUrl() — expression-aware scene variant selection
//
// Unit tests for the client VN viewport resolver
// (client/src/utils/resolvePortraitUrl.ts). The resolver picks a
// dialogue backdrop by priority:
//   1. node.visual.background (authoritative URL/filename)
//   2. a background_urls[].expression match against the scene's
//      variant pool (case-insensitive)
//   3. the first usable entry in background_urls[] (default variant)
//   4. the current scene backdrop fallback
// ============================================================

import { resolveBackgroundUrl } from '../../../client/src/utils/resolvePortraitUrl.js';

describe('resolveBackgroundUrl', () => {
  const VARIANTS = [
    { url: 'https://cdn.test/plaza__default.png', label: 'dev' as const },
    { url: 'https://cdn.test/plaza__night.png', label: 'dev' as const, expression: 'night' },
    { url: 'https://cdn.test/plaza__rain.png', label: 'dev' as const, expression: 'rain' },
  ];

  describe('priority 1 — explicit visual.background', () => {
    it('returns a non-empty visual background verbatim', () => {
      expect(resolveBackgroundUrl('https://cdn.test/x.png', 'https://cdn.test/scene.png'))
        .toBe('https://cdn.test/x.png');
    });

    it('trims surrounding whitespace but returns the value as-is', () => {
      expect(resolveBackgroundUrl('  https://cdn.test/x.png  ', 'https://cdn.test/scene.png'))
        .toBe('https://cdn.test/x.png');
    });

    it('short-circuits the variant pool when a visual background is given', () => {
      expect(resolveBackgroundUrl('https://cdn.test/x.png', 'https://cdn.test/scene.png', 'night', VARIANTS))
        .toBe('https://cdn.test/x.png');
    });
  });

  describe('priority 2 — expression-tagged variant selection', () => {
    it('prefers a matching expression variant over the default', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'rain', VARIANTS);
      expect(url).toBe('https://cdn.test/plaza__rain.png');
    });

    it('matches the expression tag case-insensitively', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'NIGHT', VARIANTS);
      expect(url).toBe('https://cdn.test/plaza__night.png');
    });

    it('ignores pool entries with unusable (empty) urls', () => {
      const pool = [
        { url: 'https://cdn.test/plaza__night.png', label: 'dev' as const, expression: 'night' },
        { url: '', label: 'dev' as const, expression: 'night' },
      ];
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'night', pool);
      expect(url).toBe('https://cdn.test/plaza__night.png');
    });
  });

  describe('priority 3 — default variant fallback', () => {
    it('falls back to the first usable variant when no expression matches', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'sunset', VARIANTS);
      expect(url).toBe('https://cdn.test/plaza__default.png');
    });

    it('falls back to the first usable variant when no expression hint is given', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', undefined, VARIANTS);
      expect(url).toBe('https://cdn.test/plaza__default.png');
    });

    it('returns null when the pool has no usable urls', () => {
      const pool = [{ url: '', label: 'dev' as const, expression: 'night' }];
      expect(resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'night', pool))
        .toBe('https://cdn.test/scene.png');
    });
  });

  describe('priority 4 — scene backdrop fallback', () => {
    it('falls back to the scene backdrop when no pool is provided', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png');
      expect(url).toBe('https://cdn.test/scene.png');
    });

    it('returns null when nothing is resolvable', () => {
      expect(resolveBackgroundUrl(undefined, undefined)).toBeNull();
      expect(resolveBackgroundUrl('', '')).toBeNull();
      expect(resolveBackgroundUrl(undefined, undefined, 'night')).toBeNull();
    });

    it('treats an empty pool array like an absent pool', () => {
      expect(resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'night', []))
        .toBe('https://cdn.test/scene.png');
    });
  });
});
