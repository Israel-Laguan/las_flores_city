import { describe, it, expect } from '@jest/globals';

import {
  matchStoriesToMissions,
  figureStem,
  characterStem,
  normalizeName,
} from '../../src/routes/admin-coverage.js';

// ── figureStem helper spot-checks ───────────────────────

describe('figureStem helper', () => {
  it('extracts stem from "figures/ana_kim.md"', () => {
    expect(figureStem('figures/ana_kim.md')).toBe('ana_kim');
  });

  it('extracts stem from a deeply nested path', () => {
    expect(figureStem('figures/sub/foo.md')).toBe('foo');
  });

  it('extracts stem when there is no directory prefix', () => {
    expect(figureStem('standalone.md')).toBe('standalone');
  });
});

// ── characterStem helper spot-checks ────────────────────

describe('characterStem helper', () => {
  it('strips char_ prefix from "characters/char_ana_kim.yaml"', () => {
    expect(characterStem('characters/char_ana_kim.yaml')).toBe('ana_kim');
  });

  it('returns stem as-is when no char_ prefix', () => {
    expect(characterStem('characters/ana_kim.yaml')).toBe('ana_kim');
  });

  it('handles a path without directory', () => {
    expect(characterStem('char_ryu.yaml')).toBe('ryu');
  });

  it('returns stem for non-prefixed filename', () => {
    expect(characterStem('characters/carlos_hernandez.yaml')).toBe('carlos_hernandez');
  });
});

// ── normalizeName helper spot-checks ────────────────────

describe('normalizeName helper', () => {
  it('lowercases and replaces non-alphanumeric with spaces', () => {
    expect(normalizeName('Hello_World')).toBe('hello world');
  });

  it('trims leading and trailing spaces', () => {
    expect(normalizeName('  hello  ')).toBe('hello');
  });
});

// ── matchStoriesToMissions properties ───────────────────

describe('matchStoriesToMissions', () => {
  it('matches a story lore stem to a mission title containing the same words', () => {
    const results = matchStoriesToMissions(
      ['stories/great_migration.md'],
      [{ title: 'The Great Migration' }],
    );
    expect(results).toHaveLength(1);
    expect(results[0].hasMissionYaml).toBe(true);
    expect(results[0].name).toBe('great_migration');
  });

  it('returns hasMissionYaml false when no mission title matches', () => {
    const results = matchStoriesToMissions(
      ['stories/unrelated_story.md'],
      [{ title: 'The Great Migration' }],
    );
    expect(results).toHaveLength(1);
    expect(results[0].hasMissionYaml).toBe(false);
  });

  it('returns one item per story path', () => {
    const storyPaths = ['stories/alpha.md', 'stories/beta.md'];
    const results = matchStoriesToMissions(storyPaths, [{ title: 'Alpha Mission' }]);
    expect(results).toHaveLength(2);
  });

  it('returns empty array when story paths is empty', () => {
    const results = matchStoriesToMissions([], [{ title: 'Some Mission' }]);
    expect(results).toHaveLength(0);
  });

  it('handles multiple missions with substring matching', () => {
    const results = matchStoriesToMissions(
      ['stories/lithium_vein.md'],
      [{ title: 'Lithium Vein Discovery' }, { title: 'Unrelated Mission' }],
    );
    expect(results).toHaveLength(1);
    expect(results[0].hasMissionYaml).toBe(true);
  });
});