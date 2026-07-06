import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// Admin Lore — Property-Based Tests
//
// Feature: authoring-mvp-phase-0
//
// Properties under test:
//   Property 2: Lore tree file filter
//   Property 3: Type inference from subdirectory
//
// Validates: Requirements 2.2, 2.4, 5.4
//
// No mocking strategy needed: all functions under test are pure
// functions — no DB, no network, no filesystem.
// ============================================================

import { inferLoreType, validateLorePath, LORE_SUBDIRS } from '../../src/routes/admin-lore.js';

// ── Shared arbitraries ────────────────────────────────────────

/** A safe filename component (alphanumeric + underscores, no dots or slashes). */
const filenameStemArb = (): fc.Arbitrary<string> =>
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
    { minLength: 1, maxLength: 40 },
  );

/** Generates a filename ending with ".md" but NOT ".prompt.md". */
const validMdFilenameArb = (): fc.Arbitrary<string> =>
  filenameStemArb().map(stem => `${stem}.md`);

/** Generates a filename ending with ".prompt.md". */
const promptMdFilenameArb = (): fc.Arbitrary<string> =>
  filenameStemArb().map(stem => `${stem}.prompt.md`);

/** Generates a filename with a non-markdown extension. */
const nonMdFilenameArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    filenameStemArb(),
    fc.constantFrom('.png', '.jpg', '.jpeg', '.txt', '.yaml', '.json', '.gif', '.svg'),
  ).map(([stem, ext]) => `${stem}${ext}`);

/** Generates any filename that should NOT pass the lore tree filter. */
const excludedFilenameArb = (): fc.Arbitrary<string> =>
  fc.oneof(promptMdFilenameArb(), nonMdFilenameArb());

// ── The lore tree file filter predicate ──────────────────────
//
// This predicate mirrors what the GET /admin/lore/tree handler will use.
// It is defined here (not imported) so we can property-test it in isolation
// as a pure function, independent of any future handler implementation.
// ─────────────────────────────────────────────────────────────

function isLoreFile(filename: string): boolean {
  return filename.endsWith('.md') && !filename.endsWith('.prompt.md');
}

// ============================================================
// Property 2: Lore tree file filter
//
// For any set of filenames in a directory, the lore tree walker SHALL
// include exactly those filenames that end with `.md` and do not end
// with `.prompt.md`. Files ending with `.prompt.md`, `.png`, `.jpg`,
// or any non-`.md` extension SHALL NOT appear in the tree.
//
// Validates: Requirement 2.2
// ============================================================

describe('Property 2: Lore tree file filter', () => {
  it('accepts filenames ending with .md that are not .prompt.md', () => {
    fc.assert(
      fc.property(validMdFilenameArb(), (filename) => {
        expect(isLoreFile(filename)).toBe(true);
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('rejects filenames ending with .prompt.md', () => {
    fc.assert(
      fc.property(promptMdFilenameArb(), (filename) => {
        expect(isLoreFile(filename)).toBe(false);
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('rejects filenames with non-.md extensions (.png, .jpg, .yaml, etc.)', () => {
    fc.assert(
      fc.property(nonMdFilenameArb(), (filename) => {
        expect(isLoreFile(filename)).toBe(false);
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('for any mixed list of filenames, filter retains exactly the compliant ones', () => {
    fc.assert(
      fc.property(
        fc.array(validMdFilenameArb(), { minLength: 0, maxLength: 10 }),
        fc.array(excludedFilenameArb(), { minLength: 0, maxLength: 10 }),
        (validFiles, excludedFiles) => {
          const allFiles = [...validFiles, ...excludedFiles];
          const filtered = allFiles.filter(isLoreFile);

          // Every file in the filtered result must be a valid .md (non-prompt) file
          for (const f of filtered) {
            expect(f.endsWith('.md')).toBe(true);
            expect(f.endsWith('.prompt.md')).toBe(false);
          }

          // Every valid .md file must appear in the filtered result
          for (const f of validFiles) {
            expect(filtered).toContain(f);
          }

          // No excluded file must appear in the filtered result
          for (const f of excludedFiles) {
            expect(filtered).not.toContain(f);
          }
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('filter result length equals count of compliant filenames in any list', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(validMdFilenameArb(), excludedFilenameArb()),
          { minLength: 0, maxLength: 20 },
        ),
        (filenames) => {
          const filtered = filenames.filter(isLoreFile);
          const expectedCount = filenames.filter(
            f => f.endsWith('.md') && !f.endsWith('.prompt.md'),
          ).length;
          expect(filtered).toHaveLength(expectedCount);
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });
});

// ============================================================
// Property 3: Type inference from subdirectory
//
// For any relative file path of the form <subdir>/<filename> or
// <subdir>/<nested>/<filename>, the inferLoreType function SHALL return
// the singular form of the first path segment (stripping a trailing 's'
// where applicable). The result must be consistent: the same subdir
// always maps to the same type.
//
// Validates: Requirements 2.4, 5.4
// ============================================================

describe('Property 3: Type inference from subdirectory', () => {
  // Build the expected singular form for each known subdir
  const LORE_SUBDIRS_ARRAY = LORE_SUBDIRS as readonly string[];

  function expectedSingular(subdir: string): string {
    // Match inferLoreType: -ies → -y, -s → strip trailing s
    return subdir.endsWith('ies')
      ? `${subdir.slice(0, -3)}y`
      : subdir.endsWith('s')
        ? subdir.slice(0, -1)
        : subdir;
  }

  it('returns the consistent singular form for every known LORE_SUBDIR (flat path)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LORE_SUBDIRS_ARRAY),
        validMdFilenameArb(),
        (subdir, filename) => {
          const relPath = `${subdir}/${filename}`;
          const result = inferLoreType(relPath);
          expect(result).toBe(expectedSingular(subdir));
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('returns the consistent singular form for every known LORE_SUBDIR (nested path)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LORE_SUBDIRS_ARRAY),
        filenameStemArb(),
        validMdFilenameArb(),
        (subdir, nested, filename) => {
          const relPath = `${subdir}/${nested}/${filename}`;
          const result = inferLoreType(relPath);
          expect(result).toBe(expectedSingular(subdir));
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('maps the same subdir to the same type on every invocation (consistency)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LORE_SUBDIRS_ARRAY),
        validMdFilenameArb(),
        validMdFilenameArb(),
        (subdir, filename1, filename2) => {
          const type1 = inferLoreType(`${subdir}/${filename1}`);
          const type2 = inferLoreType(`${subdir}/${filename2}`);
          // Same subdir → same type, regardless of filename
          expect(type1).toBe(type2);
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('spot-check: known subdirs map to their expected singular types', () => {
    // inferLoreType handles common plural forms: -ies → -y, -s → strip trailing s.
    // e.g. "figures" → "figure", "stories" → "story", "communities" → "community".
    // Subdirs without trailing 's' (humanity_first, media, governance) are unchanged.
    const cases: [string, string][] = [
      ['figures/ana_kim.md', 'figure'],
      ['districts/south.md', 'district'],
      ['landmarks/city/foo.md', 'landmark'],
      // 'stories' → strip trailing 's' → 'story'
      ['stories/the_fall.md', 'story'],
      // 'communities' → strip trailing 's' → 'communitie'
      ['communities/barrio_verde.md', 'community'],
      ['companies/omnicorp.md', 'company'],
      ['events/the_riots.md', 'event'],
      ['organizations/police.md', 'organization'],
      ['families/the_kims.md', 'family'],
      // 'media' has no trailing 's' — unchanged
      ['media/news_net.md', 'media'],
      ['platforms/social_net.md', 'platform'],
      ['partnerships/alliance.md', 'partnership'],
      // 'humanity_first' has no trailing 's' — stays as-is
      ['humanity_first/about.md', 'humanity_first'],
      ['assets/logo.md', 'asset'],
      ['guides/intro.md', 'guide'],
      ['conflicts/war.md', 'conflict'],
      // 'governance' has no trailing 's' — unchanged
      ['governance/law.md', 'governance'],
    ];

    for (const [relPath, expectedType] of cases) {
      expect(inferLoreType(relPath)).toBe(expectedType);
    }
  });
});

// ============================================================
// Additional: validateLorePath covers all four rejection rules
//
// These are deterministic checks (not property-based), verifying
// that validateLorePath correctly rejects each invalid input class
// and accepts valid ones.
// ============================================================

describe('validateLorePath — all four rejection rules', () => {
  it('rejects paths containing ".."', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LORE_SUBDIRS as readonly string[]),
        filenameStemArb(),
        (subdir, stem) => {
          const result = validateLorePath(`${subdir}/../${stem}.md`);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toMatch(/\.\./);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('rejects paths not starting with a known lore subdirectory', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          s => !(LORE_SUBDIRS as readonly string[]).includes(s) && !s.includes('..') && !s.includes('/'),
        ),
        validMdFilenameArb(),
        (unknownDir, filename) => {
          const result = validateLorePath(`${unknownDir}/${filename}`);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toMatch(/known lore subdirectory/);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('rejects paths not ending with .md', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LORE_SUBDIRS as readonly string[]),
        nonMdFilenameArb(),
        (subdir, filename) => {
          const result = validateLorePath(`${subdir}/${filename}`);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toMatch(/\.md/);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('rejects paths ending with .prompt.md', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LORE_SUBDIRS as readonly string[]),
        promptMdFilenameArb(),
        (subdir, filename) => {
          const result = validateLorePath(`${subdir}/${filename}`);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toMatch(/prompt/i);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('accepts valid paths (known subdir, .md, no .prompt.md, no ..)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LORE_SUBDIRS as readonly string[]),
        validMdFilenameArb(),
        (subdir, filename) => {
          const result = validateLorePath(`${subdir}/${filename}`);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });
});
