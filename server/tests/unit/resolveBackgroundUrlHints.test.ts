// ============================================================
// Phase 4 — game-driven environment hints for scene variants
//
// Unit tests for:
//   - getTimeOfDay(timeBlocks)          — real in-game clock → day/dusk/night
//   - buildBackgroundHints(...)         — weather > time-of-day > mood chain
//   - resolveBackgroundUrl(...) hints   — ordered hint resolution, node
//     authoring (visual.background) still wins, default variant + scene
//     backdrop fallbacks stay intact.
//
// Imports the client utils directly (the client has no unit-test infra).
// ============================================================

import { resolveBackgroundUrl, buildBackgroundHints } from '../../../client/src/utils/resolvePortraitUrl.js';
import { getTimeOfDay, calculateInGameTime } from '../../../client/src/utils/time.js';

describe('getTimeOfDay (game clock → time-of-day band)', () => {
  it('matches the documented clock displayed by calculateInGameTime', () => {
    // Sanity: the band derivation must agree with the status-bar clock.
    expect(calculateInGameTime(48)).toBe('08:00 AM');
    expect(calculateInGameTime(28)).toBe('06:00 PM');
    expect(calculateInGameTime(12)).toBe('02:00 AM');
  });

  it('maps the full 48-TB cycle to day/dusk/night', () => {
    // TB=48 → 08:00 (day start)
    expect(getTimeOfDay(48)).toBe('day');
    // TB=32 → 16:00
    expect(getTimeOfDay(32)).toBe('day');
    // TB=28 → 18:00 (sunset/dusk band starts)
    expect(getTimeOfDay(28)).toBe('dusk');
    // TB=26 → 19:00
    expect(getTimeOfDay(26)).toBe('dusk');
    // TB=24 → 20:00 (night band starts)
    expect(getTimeOfDay(24)).toBe('night');
    // TB=20 → 22:00
    expect(getTimeOfDay(20)).toBe('night');
    // TB=12 → 02:00
    expect(getTimeOfDay(12)).toBe('night');
    // TB=8 → 04:00
    expect(getTimeOfDay(8)).toBe('night');
    // TB=4 → 06:00 (still before the 08:00 day start)
    expect(getTimeOfDay(4)).toBe('night');
    // TB=0 → 08:00 next day
    expect(getTimeOfDay(0)).toBe('day');
  });
});

describe('buildBackgroundHints (weather > time-of-day > mood)', () => {
  it('orders weather before time-of-day before mood', () => {
    expect(buildBackgroundHints('night', 'rain', 'tense')).toEqual(['rain', 'night', 'tense']);
  });

  it('skips clear/undefined weather and the none mood', () => {
    expect(buildBackgroundHints('day', 'clear', 'none')).toEqual(['day']);
    expect(buildBackgroundHints('day', undefined, undefined)).toEqual(['day']);
  });

  it('maps the dusk time-of-day to the sunset asset vocabulary tag', () => {
    expect(buildBackgroundHints('dusk')).toEqual(['sunset']);
    expect(buildBackgroundHints('night')).toEqual(['night']);
    expect(buildBackgroundHints('day')).toEqual(['day']);
  });

  it('trims and dedupes case-insensitively, preserving first occurrence', () => {
    expect(buildBackgroundHints('night', undefined, 'night')).toEqual(['night']);
    // Matching is case-insensitive, so the original casing is preserved.
    expect(buildBackgroundHints('day', 'RAIN', 'rain')).toEqual(['RAIN', 'day']);
    expect(buildBackgroundHints('day', ' snow ', undefined)).toEqual(['snow', 'day']);
  });
});
describe('resolveBackgroundUrl with ordered game hints', () => {
  const VARIANTS = [
    { url: 'https://cdn.test/plaza__default.png', label: 'dev' as const },
    { url: 'https://cdn.test/plaza__night.png', label: 'dev' as const, variant: 'night' },
    { url: 'https://cdn.test/plaza__sunset.png', label: 'dev' as const, variant: 'sunset' },
    { url: 'https://cdn.test/plaza__rain.png', label: 'dev' as const, variant: 'rain' },
  ];
  const SCENE = 'https://cdn.test/scene.png';

  it('explicit visual.background stays authoritative over game hints', () => {
    const hints = buildBackgroundHints('night', 'rain');
    expect(resolveBackgroundUrl('https://cdn.test/x.png', SCENE, hints, VARIANTS))
      .toBe('https://cdn.test/x.png');
  });

  it('weather hint wins over time-of-day (rain at night → rain variant)', () => {
    const hints = buildBackgroundHints('night', 'rain');
    expect(resolveBackgroundUrl(undefined, SCENE, hints, VARIANTS))
      .toBe('https://cdn.test/plaza__rain.png');
  });

  it('time-of-day picks the matching variant when weather is clear', () => {
    const hints = buildBackgroundHints('night', 'clear');
    expect(resolveBackgroundUrl(undefined, SCENE, hints, VARIANTS))
      .toBe('https://cdn.test/plaza__night.png');
  });

  it('dusk auto-drives the sunset variant', () => {
    const hints = buildBackgroundHints('dusk');
    expect(resolveBackgroundUrl(undefined, SCENE, hints, VARIANTS))
      .toBe('https://cdn.test/plaza__sunset.png');
  });

  it('game-driven hint beats the soft mood hint', () => {
    // night + mood:rain → the night variant wins (time-of-day rank > mood).
    const hints = buildBackgroundHints('night', undefined, 'rain');
    expect(resolveBackgroundUrl(undefined, SCENE, hints, VARIANTS))
      .toBe('https://cdn.test/plaza__night.png');
  });

  it('mood hint still matches when no env tag matches (Phase 1–3 backward compat)', () => {
    // day + mood:rain → 'day' matches nothing, 'rain' picks the wet variant.
    const hints = buildBackgroundHints('day', undefined, 'rain');
    expect(resolveBackgroundUrl(undefined, SCENE, hints, VARIANTS))
      .toBe('https://cdn.test/plaza__rain.png');
  });

  it('treats a plain string hint as a one-element chain (backward compat)', () => {
    expect(resolveBackgroundUrl(undefined, SCENE, 'rain', VARIANTS))
      .toBe('https://cdn.test/plaza__rain.png');
  });

  it('falls back to the default variant when no hint matches the pool', () => {
    const hints = buildBackgroundHints('day', undefined, 'tense');
    expect(resolveBackgroundUrl(undefined, SCENE, hints, VARIANTS))
      .toBe('https://cdn.test/plaza__default.png');
  });

  it('falls back to the scene backdrop when the pool has no usable urls', () => {
    const pool = [{ url: '', label: 'dev' as const, variant: 'night' }];
    const hints = buildBackgroundHints('night', 'rain');
    expect(resolveBackgroundUrl(undefined, SCENE, hints, pool))
      .toBe(SCENE);
  });
});