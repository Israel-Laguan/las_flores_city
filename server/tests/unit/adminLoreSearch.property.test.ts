import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// Admin Lore Search — Property-Based Tests
//
// Feature: authoring-mvp-phase-0
//
// Properties under test:
//   Property 4: Lore search result correctness
//
// Validates: Requirements 4.1, 4.2, 4.3
//
// No mocking strategy needed: `searchLoreFiles` is a pure function
// with no DB, no network, no filesystem access.
// ============================================================

import { searchLoreFiles } from '../../src/routes/admin-lore.js';
import { LoreFileRecord } from '../../src/routes/admin-lore.js';

// ── Shared arbitraries ────────────────────────────────────────

/** A safe alphanumeric string — used for stems and query tokens. */
const alphaArb = (minLength = 1, maxLength = 30): fc.Arbitrary<string> =>
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
    { minLength, maxLength },
  );

/** A relative lore path of the form "<subdir>/<stem>.md". */
const relativePathArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('figures', 'districts', 'landmarks', 'stories'),
    alphaArb(1, 20),
  ).map(([subdir, stem]) => `${subdir}/${stem}.md`);

/** Generates a single LoreFileRecord whose content CONTAINS the query. */
const matchingFileArb = (query: string): fc.Arbitrary<LoreFileRecord> =>
  fc.tuple(
    relativePathArb(),
    alphaArb(0, 50),   // prefix text before the match
    alphaArb(0, 50),   // suffix text after the match
  ).map(([relativePath, prefix, suffix]) => ({
    relativePath,
    content: `${prefix}${query}${suffix}`,
  }));

/** Generates a single LoreFileRecord whose content does NOT contain the query. */
const nonMatchingFileArb = (query: string): fc.Arbitrary<LoreFileRecord> =>
  fc.tuple(
    relativePathArb(),
    alphaArb(1, 80),
  ).filter(([, content]) =>
    content.toLowerCase().indexOf(query.toLowerCase()) === -1,
  ).map(([relativePath, content]) => ({ relativePath, content }));

// ── Property 4: Lore search result correctness ───────────────
//
// For any search query string q and any set of lore file contents:
//   a) Every result returned by searchLoreFiles SHALL have file content
//      containing q (case-insensitive).
//   b) Every file whose content contains q SHALL appear in the results.
//   c) The `match` field of each result SHALL have a length of at most
//      200 characters.
//
// Validates: Requirements 4.1, 4.2, 4.3
// ─────────────────────────────────────────────────────────────

describe('Property 4: Lore search result correctness', () => {
  it('4a — every returned result contains the query (case-insensitive)', () => {
    fc.assert(
      fc.property(
        alphaArb(1, 20),
        (query) => {
          // Build files: half match, half don't
          fc.assert(
            fc.property(
              fc.array(matchingFileArb(query), { minLength: 1, maxLength: 5 }),
              fc.array(relativePathArb(), { minLength: 0, maxLength: 5 }),
              (matchingFiles, extraPaths) => {
                // Create non-matching files whose content is just extra paths (no query)
                const nonMatchingFiles: LoreFileRecord[] = extraPaths.map((rp, i) => ({
                  relativePath: rp,
                  content: `no_match_content_placeholder_${i}_zzzzz`,
                })).filter(
                  f => f.content.toLowerCase().indexOf(query.toLowerCase()) === -1,
                );

                const allFiles = [...matchingFiles, ...nonMatchingFiles];
                const results = searchLoreFiles(query, allFiles);

                for (const result of results) {
                  // Find the source file for this result
                  const sourceFile = allFiles.find(f => f.relativePath === result.path);
                  expect(sourceFile).toBeDefined();
                  // The source file content must contain the query (case-insensitive)
                  expect(
                    sourceFile!.content.toLowerCase().indexOf(query.toLowerCase()),
                  ).toBeGreaterThanOrEqual(0);
                }
              },
            ),
            { numRuns: 50 },
          );
        },
      ),
      { numRuns: 50, verbose: false },
    );
  });

  it('4b — every matching file appears in the results', () => {
    fc.assert(
      fc.property(
        alphaArb(1, 15),
        fc.array(
          fc.tuple(relativePathArb(), fc.boolean()),
          { minLength: 1, maxLength: 10 },
        ),
        (query, fileSpecs) => {
          // Build files: for each spec, either inject the query or not
          const files: LoreFileRecord[] = fileSpecs.map(([relativePath, includeQuery], i) => ({
            relativePath,
            content: includeQuery
              ? `prefix_${i}_${query}_suffix_${i}`
              : `no_match_content_item_${i}_xzxzxz`,
          }));

          // Filter out files where content accidentally contains query despite !includeQuery
          const trulyMatchingPaths = files
            .filter(f => f.content.toLowerCase().indexOf(query.toLowerCase()) !== -1)
            .map(f => f.relativePath);

          const results = searchLoreFiles(query, files);
          const resultPaths = results.map(r => r.path);

          // Every truly matching file path must appear in results
          for (const p of trulyMatchingPaths) {
            expect(resultPaths).toContain(p);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('4c — every non-matching file is excluded from results', () => {
    fc.assert(
      fc.property(
        alphaArb(1, 15),
        fc.array(
          fc.tuple(
            relativePathArb(),
            alphaArb(1, 80),
          ),
          { minLength: 0, maxLength: 10 },
        ),
        (query, rawNonMatching) => {
          const nonMatchingFiles: LoreFileRecord[] = rawNonMatching
            .filter(([, content]) =>
              content.toLowerCase().indexOf(query.toLowerCase()) === -1,
            )
            .map(([relativePath, content]) => ({ relativePath, content }));

          const results = searchLoreFiles(query, nonMatchingFiles);
          expect(results).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('4d — match.length is at most 200 characters for any input', () => {
    fc.assert(
      fc.property(
        alphaArb(1, 20),
        fc.array(
          fc.tuple(
            relativePathArb(),
            fc.string({ minLength: 0, maxLength: 500 }),
          ),
          { minLength: 1, maxLength: 8 },
        ),
        (query, rawFiles) => {
          const files: LoreFileRecord[] = rawFiles.map(([relativePath, content]) => ({
            relativePath,
            // Force at least one match by injecting query into content
            content: content + query + content,
          }));

          const results = searchLoreFiles(query, files);

          for (const result of results) {
            expect(result.match.length).toBeLessThanOrEqual(200);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('returns empty results when query is empty string', () => {
    const files: LoreFileRecord[] = [
      { relativePath: 'figures/ana_kim.md', content: 'some content here' },
    ];
    expect(searchLoreFiles('', files)).toHaveLength(0);
  });

  it('returns empty results when no files match', () => {
    const files: LoreFileRecord[] = [
      { relativePath: 'figures/ana_kim.md', content: 'totally irrelevant content' },
    ];
    expect(searchLoreFiles('ZZZ_NEVER_MATCH_ZZZ', files)).toHaveLength(0);
  });

  it('match context is centered around the match position', () => {
    // Query at a known position — verify the context window
    // content: "AAAA...AAAA<query>BBBB...BBBB" where prefix/suffix are 100 chars each
    const query = 'FINDME';
    const prefix = 'A'.repeat(100);
    const suffix = 'B'.repeat(100);
    const content = prefix + query + suffix;
    const files: LoreFileRecord[] = [
      { relativePath: 'figures/test.md', content },
    ];

    const results = searchLoreFiles(query, files);
    expect(results).toHaveLength(1);
    // idx = 100, so match = content.substring(0, 200) = prefix + query + suffix[:94]
    const expectedMatch = content.substring(Math.max(0, 100 - 100), 100 + 100);
    expect(results[0].match).toBe(expectedMatch);
  });

  it('handles match at the very start of content (no underflow)', () => {
    const query = 'start';
    const content = 'start of content here with more text after';
    const files: LoreFileRecord[] = [
      { relativePath: 'districts/south.md', content },
    ];
    const results = searchLoreFiles(query, files);
    expect(results).toHaveLength(1);
    // idx=0, so match = content.substring(max(0,0-100), 0+100) = content.substring(0,100)
    expect(results[0].match).toBe(content.substring(0, 100));
    expect(results[0].match.length).toBeLessThanOrEqual(200);
  });

  it('name is the stem of the filename (without .md extension)', () => {
    const query = 'keyword';
    const files: LoreFileRecord[] = [
      { relativePath: 'figures/ana_kim.md', content: 'some keyword here' },
    ];
    const results = searchLoreFiles(query, files);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('ana_kim');
  });
});
