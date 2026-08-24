// ============================================================
// resolveBackgroundUrl() — variant-aware backdrop selection
//
// Unit tests for the client VN viewport resolver
// (client/src/utils/resolvePortraitUrl.ts). The resolver picks a
// dialogue backdrop by priority:
//   1. node.visual.background (authoritative URL/filename)
//   2. a background_urls[].variant match against the scene's
//      variant pool (case-insensitive)
//   3. the first usable entry in background_urls[] (default variant)
//   4. the current scene backdrop fallback
// ============================================================

import { resolveBackgroundUrl, resolvePortraitUrl } from '../../../client/src/utils/resolvePortraitUrl.js';

describe('resolveBackgroundUrl', () => {
  const VARIANTS = [
    { url: 'https://cdn.test/plaza__default.png', label: 'dev' as const },
    { url: 'https://cdn.test/plaza__night.png', label: 'dev' as const, variant: 'night' },
    { url: 'https://cdn.test/plaza__rain.png', label: 'dev' as const, variant: 'rain' },
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

  describe('priority 2 — variant-tagged selection', () => {
    it('prefers a matching variant over the default', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'rain', VARIANTS);
      expect(url).toBe('https://cdn.test/plaza__rain.png');
    });

    it('matches the variant tag case-insensitively', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'NIGHT', VARIANTS);
      expect(url).toBe('https://cdn.test/plaza__night.png');
    });

    it('ignores pool entries with unusable (empty) urls', () => {
      const pool = [
        { url: 'https://cdn.test/plaza__night.png', label: 'dev' as const, variant: 'night' },
        { url: '', label: 'dev' as const, variant: 'night' },
      ];
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'night', pool);
      expect(url).toBe('https://cdn.test/plaza__night.png');
    });
  });

  describe('priority 3 — default variant fallback', () => {
    it('falls back to the first usable variant when no variant matches', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'sunset', VARIANTS);
      expect(url).toBe('https://cdn.test/plaza__default.png');
    });

    it('falls back to the first usable variant when no variant hint is given', () => {
      const url = resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', undefined, VARIANTS);
      expect(url).toBe('https://cdn.test/plaza__default.png');
    });

    it('skips variant-tagged entries in the fallback (untagged default only)', () => {
      // Stage ordering can place a themed (rain) variant before the untagged
      // default. When no hint matches, the fallback must NOT return the rain
      // asset — that would render rain without a matching game hint.
      const pool = [
        { url: 'https://cdn.test/plaza__rain.png', label: 'dev' as const, variant: 'rain' },
        { url: 'https://cdn.test/plaza__default.png', label: 'dev' as const },
      ];
      expect(resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'day', pool))
        .toBe('https://cdn.test/plaza__default.png');
    });

    it('falls back to the scene backdrop when the pool has only variant-tagged entries', () => {
      const pool = [
        { url: 'https://cdn.test/plaza__rain.png', label: 'dev' as const, variant: 'rain' },
      ];
      expect(resolveBackgroundUrl(undefined, 'https://cdn.test/scene.png', 'day', pool))
        .toBe('https://cdn.test/scene.png');
    });

    it('falls back to the scene backdrop when the pool has no usable urls', () => {
      const pool = [{ url: '', label: 'dev' as const, variant: 'night' }];
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

describe('resolvePortraitUrl', () => {
  it('returns null when there is no speaker', () => {
    expect(resolvePortraitUrl(undefined)).toBeNull();
    expect(resolvePortraitUrl(null)).toBeNull();
  });

  it('returns the expression-tagged portrait url', () => {
    const speaker = {
      name: 'A',
      portrait_urls: [
        { url: 'https://cdn.test/a__default.png', label: 'dev' as const },
        { url: 'https://cdn.test/a__neutral.png', label: 'dev' as const, expression: 'neutral' },
      ],
    };
    expect(resolvePortraitUrl(speaker, 'neutral')).toBe('https://cdn.test/a__neutral.png');
  });

  it('skips a malformed (empty-url) expression entry and uses the next matching one', () => {
    // A first entry tagged `calculating` with an empty URL must not hide the
    // valid later entry for the same expression.
    const speaker = {
      name: 'A',
      portrait_urls: [
        { url: '', label: 'dev' as const, expression: 'calculating' },
        { url: 'https://cdn.test/a__calculating.png', label: 'dev' as const, expression: 'calculating' },
        { url: 'https://cdn.test/a__default.png', label: 'dev' as const },
      ],
    };
    expect(resolvePortraitUrl(speaker, 'calculating')).toBe('https://cdn.test/a__calculating.png');
  });

  it('falls back to the untagged default entry when no expression matches', () => {
    const speaker = {
      name: 'A',
      portrait_urls: [
        { url: 'https://cdn.test/a__default.png', label: 'dev' as const },
      ],
    };
    expect(resolvePortraitUrl(speaker, 'smirk')).toBe('https://cdn.test/a__default.png');
  });

  it('never promotes an expression variant to the default portrait', () => {
    // A partial publish that ships only mood variants must not make e.g.
    // `shocked` the character's resting portrait — the untagged entry wins
    // even when it is listed after the tagged ones.
    const speaker = {
      name: 'A',
      portrait_urls: [
        { url: 'https://cdn.test/a__shocked.png', label: 'dev' as const, expression: 'shocked' },
        { url: 'https://cdn.test/a__default.png', label: 'dev' as const },
      ],
    };
    expect(resolvePortraitUrl(speaker, 'smirk')).toBe('https://cdn.test/a__default.png');
    expect(resolvePortraitUrl(speaker)).toBe('https://cdn.test/a__default.png');
  });

  it('prefers the expression-neutral avatar_url over a mood variant when no default exists', () => {
    const speaker = {
      name: 'A',
      portrait_urls: [
        { url: 'https://cdn.test/a__shocked.png', label: 'dev' as const, expression: 'shocked' },
      ],
      avatar_url: 'https://cdn.test/avatar.png',
    };
    expect(resolvePortraitUrl(speaker, 'smirk')).toBe('https://cdn.test/avatar.png');
  });

  it('degrades to any usable entry when neither a default nor an avatar exists', () => {
    // Last resort: showing a mood variant beats rendering an empty portrait slot.
    const speaker = {
      name: 'A',
      portrait_urls: [
        { url: 'https://cdn.test/a__shocked.png', label: 'dev' as const, expression: 'shocked' },
      ],
    };
    expect(resolvePortraitUrl(speaker, 'smirk')).toBe('https://cdn.test/a__shocked.png');
  });

  it('falls back to avatar_url when portrait_urls is empty', () => {
    const speaker = { name: 'A', portrait_urls: [], avatar_url: 'https://cdn.test/avatar.png' };
    expect(resolvePortraitUrl(speaker, 'neutral')).toBe('https://cdn.test/avatar.png');
  });
});
