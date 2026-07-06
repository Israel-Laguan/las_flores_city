import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// Admin Coverage — Property-Based Tests
//
// Feature: authoring-mvp-phase-0
//
// Properties under test:
//   Property 6: Figures coverage matching by stem
//
// Validates: Requirements 8.2
//
// No mocking strategy needed: `matchFiguresToCharacters` is a pure
// function — no DB, no network, no filesystem access.
// ============================================================

import {
  matchFiguresToCharacters,
  figureStem,
  characterStem,
} from '../../src/routes/admin-coverage.js';

// ── Shared arbitraries ────────────────────────────────────────

/**
 * A safe stem component: alphanumeric + underscores, no dots or slashes.
 * Represents a bare name like "ana_kim".
 */
const stemArb = (): fc.Arbitrary<string> =>
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
    { minLength: 1, maxLength: 30 },
  );

/**
 * Generates a figure lore path in the canonical form "figures/<stem>.md".
 */
const figureLorePathArb = (): fc.Arbitrary<string> =>
  stemArb().map(stem => `figures/${stem}.md`);

/**
 * Generates a character YAML path. With ~50% probability uses the
 * "char_<stem>" convention, otherwise uses just the stem directly.
 */
const characterYamlPathArb = (stem: string): fc.Arbitrary<string> =>
  fc.boolean().map(usePrefix =>
    usePrefix
      ? `characters/char_${stem}.yaml`
      : `characters/${stem}.yaml`,
  );

/**
 * Generates a character YAML path whose stem is UNRELATED to the given
 * figure stem (does not contain it as a substring).
 *
 * We generate an independent stem and filter out any accidental overlaps.
 */
const unrelatedCharacterPathArb = (figureStemValue: string): fc.Arbitrary<string> =>
  stemArb()
    .filter(s => !s.includes(figureStemValue) && !figureStemValue.includes(s))
    .map(s => `characters/${s}.yaml`);

// ── Property 6: Figures coverage matching by stem ────────────
//
// For any set of figure lore stems and character YAML name stems:
//
//   6a — COVERAGE POSITIVE:
//        Every figure for which at least one character stem contains the
//        figure stem (substring match) SHALL have hasCharacterYaml = true.
//
//   6b — COVERAGE NEGATIVE:
//        Every figure for which NO character stem contains the figure stem
//        SHALL have hasCharacterYaml = false.
//
//   6c — COMPLETENESS:
//        The result array SHALL have exactly one entry per figure path.
//
//   6d — NAME FIELD:
//        Each result item's `name` field SHALL equal the stem of the
//        corresponding figure path.
//
// Validates: Requirements 8.2
// ─────────────────────────────────────────────────────────────

describe('Property 6: Figures coverage matching by stem', () => {
  // ── 6a: When a matching character YAML exists, hasCharacterYaml is true ──

  it('6a — hasCharacterYaml is true when a matching character YAML stem contains the figure stem', () => {
    fc.assert(
      fc.property(
        // Generate 1–5 figure stems
        fc.array(stemArb(), { minLength: 1, maxLength: 5 }),
        // For each figure stem, also generate 0–3 unrelated extra character paths
        fc.array(stemArb(), { minLength: 0, maxLength: 3 }),
        (figureStems, extraStems) => {
          const figurePaths = figureStems.map(s => `figures/${s}.md`);

          // Build character paths: for every figure stem, include a matching
          // character path (with or without "char_" prefix, randomly chosen here
          // we always include both variants to keep the test deterministic).
          const matchingCharPaths = figureStems.map(
            s => `characters/char_${s}.yaml`,
          );

          // Add some unrelated character paths to ensure they don't cause false positives
          const extraCharPaths = extraStems
            .filter(s => !figureStems.some(fs => s.includes(fs) || fs.includes(s)))
            .map(s => `characters/${s}.yaml`);

          const characterPaths = [...matchingCharPaths, ...extraCharPaths];
          const results = matchFiguresToCharacters(figurePaths, characterPaths);

          // Every figure that has a matching character YAML should report true
          for (const result of results) {
            const stem = figureStem(result.lorePath);
            const hasMatch = characterPaths.some(cp => {
              const cs = characterStem(cp).toLowerCase();
              return cs.includes(stem.toLowerCase());
            });

            if (hasMatch) {
              expect(result.hasCharacterYaml).toBe(true);
            }
          }
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  // ── 6b: When no matching character YAML exists, hasCharacterYaml is false ──

  it('6b — hasCharacterYaml is false when no character YAML stem contains the figure stem', () => {
    fc.assert(
      fc.property(
        // Generate 1–5 figure stems
        fc.array(stemArb(), { minLength: 1, maxLength: 5 }),
        (figureStems) => {
          const figurePaths = figureStems.map(s => `figures/${s}.md`);

          // Generate character paths whose stems are completely unrelated —
          // we use a distinct suffix to ensure no overlap
          const unrelatedCharPaths = figureStems.map(
            (_, i) => `characters/unrelated_zzz_xox_${i}.yaml`,
          );

          const results = matchFiguresToCharacters(figurePaths, unrelatedCharPaths);

          for (const result of results) {
            const stem = figureStem(result.lorePath).toLowerCase();

            // Verify that none of the character stems actually contain this figure stem
            const actuallyMatches = unrelatedCharPaths.some(cp =>
              characterStem(cp).toLowerCase().includes(stem),
            );

            if (!actuallyMatches) {
              expect(result.hasCharacterYaml).toBe(false);
            }
          }
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  // ── 6c: Result array has exactly one entry per figure path ──

  it('6c — result array has exactly one item per figure path', () => {
    fc.assert(
      fc.property(
        fc.array(figureLorePathArb(), { minLength: 0, maxLength: 10 }),
        fc.array(stemArb(), { minLength: 0, maxLength: 5 }).map(
          stems => stems.map(s => `characters/${s}.yaml`),
        ),
        (figurePaths, characterPaths) => {
          const results = matchFiguresToCharacters(figurePaths, characterPaths);
          expect(results).toHaveLength(figurePaths.length);

          // Each result lorePath must correspond to the input figure path at
          // the same index (results preserve order)
          for (let i = 0; i < figurePaths.length; i++) {
            expect(results[i].lorePath).toBe(figurePaths[i]);
          }
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  // ── 6d: The name field equals the figure stem ──

  it('6d — name field equals the stem derived from the figure path', () => {
    fc.assert(
      fc.property(
        fc.array(figureLorePathArb(), { minLength: 1, maxLength: 10 }),
        fc.array(stemArb(), { minLength: 0, maxLength: 5 }).map(
          stems => stems.map(s => `characters/${s}.yaml`),
        ),
        (figurePaths, characterPaths) => {
          const results = matchFiguresToCharacters(figurePaths, characterPaths);

          for (const result of results) {
            const expectedStem = figureStem(result.lorePath);
            expect(result.name).toBe(expectedStem);
          }
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  // ── 6e: Mutual consistency — hasCharacterYaml matches the expected stem logic ──

  it('6e — hasCharacterYaml is consistent with substring-of-characterStem logic', () => {
    fc.assert(
      fc.property(
        // Generate figure stems and independently generate character paths
        fc.array(stemArb(), { minLength: 1, maxLength: 5 }),
        fc.array(stemArb(), { minLength: 0, maxLength: 8 }),
        (figureStems, charStemValues) => {
          const figurePaths = figureStems.map(s => `figures/${s}.md`);
          const characterPaths = charStemValues.map(s => `characters/char_${s}.yaml`);

          const results = matchFiguresToCharacters(figurePaths, characterPaths);

          // Pre-compute expected coverage by hand using the same stem logic
          const charStemsLower = characterPaths.map(p => characterStem(p).toLowerCase());

          for (const result of results) {
            const fStem = figureStem(result.lorePath).toLowerCase();
            const expectedCovered = charStemsLower.some(cs => cs.includes(fStem));

            expect(result.hasCharacterYaml).toBe(expectedCovered);
          }
        },
      ),
      { numRuns: 300, verbose: false },
    );
  });

  // ── 6f: Empty figure paths → empty result ──

  it('6f — empty figure paths input produces empty result', () => {
    fc.assert(
      fc.property(
        fc.array(stemArb(), { minLength: 0, maxLength: 10 }).map(
          stems => stems.map(s => `characters/${s}.yaml`),
        ),
        (characterPaths) => {
          const results = matchFiguresToCharacters([], characterPaths);
          expect(results).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  // ── 6g: Empty character paths → all items have hasCharacterYaml: false ──

  it('6g — empty character paths → all items have hasCharacterYaml: false', () => {
    fc.assert(
      fc.property(
        fc.array(figureLorePathArb(), { minLength: 1, maxLength: 10 }),
        (figurePaths) => {
          const results = matchFiguresToCharacters(figurePaths, []);
          for (const result of results) {
            expect(result.hasCharacterYaml).toBe(false);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Spot-checks ───────────────────────────────────────────────

describe('matchFiguresToCharacters — spot checks', () => {
  it('matches "ana_kim" figure to "char_ana_kim" character YAML', () => {
    const results = matchFiguresToCharacters(
      ['figures/ana_kim.md'],
      ['characters/char_ana_kim.yaml'],
    );
    expect(results).toHaveLength(1);
    expect(results[0].hasCharacterYaml).toBe(true);
    expect(results[0].name).toBe('ana_kim');
    expect(results[0].lorePath).toBe('figures/ana_kim.md');
  });

  it('matches "ana_kim" figure to "ana_kim" character YAML (no prefix)', () => {
    const results = matchFiguresToCharacters(
      ['figures/ana_kim.md'],
      ['characters/ana_kim.yaml'],
    );
    expect(results[0].hasCharacterYaml).toBe(true);
  });

  it('does not match "ana_kim" figure to "carlos_hernandez" character YAML', () => {
    const results = matchFiguresToCharacters(
      ['figures/ana_kim.md'],
      ['characters/char_carlos_hernandez.yaml'],
    );
    expect(results[0].hasCharacterYaml).toBe(false);
  });

  it('returns one item per figure even when character list is empty', () => {
    const results = matchFiguresToCharacters(
      ['figures/ana_kim.md', 'figures/carlos_hernandez.md'],
      [],
    );
    expect(results).toHaveLength(2);
    expect(results[0].hasCharacterYaml).toBe(false);
    expect(results[1].hasCharacterYaml).toBe(false);
  });

  it('handles multiple figures, some matched some not', () => {
    const results = matchFiguresToCharacters(
      ['figures/ana_kim.md', 'figures/ghost.md', 'figures/ryu.md'],
      ['characters/char_ana_kim.yaml', 'characters/char_ryu.yaml'],
    );
    expect(results[0].hasCharacterYaml).toBe(true);  // ana_kim matched
    expect(results[1].hasCharacterYaml).toBe(false); // ghost not matched
    expect(results[2].hasCharacterYaml).toBe(true);  // ryu matched
  });
});

// ── figureStem helper spot-checks ─────────────────────────────

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

// ── characterStem helper spot-checks ─────────────────────────

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
