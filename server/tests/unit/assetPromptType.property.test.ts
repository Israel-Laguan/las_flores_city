import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// Asset Prompt Catalog — Property-Based Tests
//
// Feature: authoring-mvp-phase-0
//
// Properties under test:
//   Property 7: Prompt file asset_type from content
//
// Validates: Requirements 9.4
//
// No mocking strategy needed: `extractAssetType` is a pure function
// — no DB, no network, no filesystem access.
// ============================================================

import { extractAssetType } from '../../src/routes/assets.helpers.js';

// ── Shared arbitraries ────────────────────────────────────────

/**
 * Generates a valid asset_type token: alphanumeric + hyphens, at least 1 char.
 * Examples: "portrait", "background", "html-background", "tile".
 */
const assetTypeTokenArb = (): fc.Arbitrary<string> =>
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
    { minLength: 1, maxLength: 40 },
  );

/**
 * Generates arbitrary "surrounding" text for the prompt file (e.g. a name
 * heading, description paragraphs, dimension lines) that does NOT contain
 * a `**Type:**` line — so it can be freely mixed in without interfering
 * with the extracted type.
 */
const surroundingTextArb = (): fc.Arbitrary<string> =>
  fc.array(
    fc.oneof(
      fc.constant('## Prompt — Default\nA vivid scene in a neon-lit alley.\n'),
      fc.constant('**Dimensions:** 1024x1024\n'),
      fc.constant('# My Portrait\nSome description text here.\n'),
      fc.constant('\nExtra blank lines and random prose.\n'),
    ),
    { minLength: 0, maxLength: 5 },
  ).map(parts => parts.join(''));

/**
 * Builds a complete prompt file content string containing a `**Type:** <token>`
 * line, optionally surrounded by arbitrary other content.
 */
const promptFileContentWithTypeArb = (): fc.Arbitrary<{ content: string; expectedType: string }> =>
  fc.tuple(
    assetTypeTokenArb(),
    surroundingTextArb(),
    surroundingTextArb(),
  ).map(([token, prefix, suffix]) => ({
    content: `${prefix}**Type:** ${token}\n${suffix}`,
    expectedType: token,
  }));

/**
 * Generates fake root directory paths to verify that the result is
 * independent of which root is supplied. We generate absolute-looking
 * paths so they look realistic without referencing real filesystem paths.
 */
const rootPathArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('/app/content/characters'),
    fc.constant('/app/content/districts/city/locations'),
    fc.constant('/app/content/scenes'),
    fc.constantFrom(
      '/some/other/root',
      '/completely/different/path',
      '/tmp/test-root',
    ),
  );

// ============================================================
// Property 7: Prompt file asset_type from content
//
// For any prompt file content string that contains a `**Type:**` field,
// `extractAssetType()` SHALL extract `asset_type` from that field value,
// regardless of which root directory the file originated from. Two prompt
// files with identical content but located in different root directories
// SHALL produce the same `asset_type`.
//
// Validates: Requirements 9.4
// ============================================================

describe('Property 7: Prompt file asset_type from content', () => {
  // ── 7a: extractAssetType returns the **Type:** field value ──

  it('7a — extractAssetType returns the value from the **Type:** field', () => {
    fc.assert(
      fc.property(
        promptFileContentWithTypeArb(),
        ({ content, expectedType }) => {
          expect(extractAssetType(content)).toBe(expectedType);
        },
      ),
      { numRuns: 300, verbose: false },
    );
  });

  // ── 7b: Result is root-independent ──
  //
  // extractAssetType reads only from the content string. Calling it twice
  // on the same content (simulating two files with the same text but from
  // different root directories) must always produce identical results.

  it('7b — same content produces the same asset_type regardless of (simulated) root', () => {
    fc.assert(
      fc.property(
        promptFileContentWithTypeArb(),
        rootPathArb(),
        rootPathArb(),
        ({ content }, _rootA, _rootB) => {
          // extractAssetType is content-only; roots are irrelevant.
          // We call it twice to confirm referential transparency.
          const typeFromRootA = extractAssetType(content);
          const typeFromRootB = extractAssetType(content);
          expect(typeFromRootA).toBe(typeFromRootB);
        },
      ),
      { numRuns: 300, verbose: false },
    );
  });

  // ── 7c: When **Type:** is absent, result is 'unknown' ──

  it('7c — returns "unknown" when the **Type:** field is absent', () => {
    fc.assert(
      fc.property(
        // Content that never contains '**Type:**'
        fc.string({ minLength: 0, maxLength: 500 }).filter(
          s => !s.includes('**Type:**'),
        ),
        (content) => {
          expect(extractAssetType(content)).toBe('unknown');
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  // ── 7d: Token is taken verbatim (no extra whitespace trimmed into it) ──

  it('7d — the extracted type token matches the value immediately after **Type:** ', () => {
    fc.assert(
      fc.property(
        assetTypeTokenArb(),
        (token) => {
          const content = `**Type:** ${token}\n`;
          expect(extractAssetType(content)).toBe(token);
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  // ── 7e: When multiple **Type:** lines exist, the first one wins ──

  it('7e — when multiple **Type:** lines exist, the first match is returned', () => {
    fc.assert(
      fc.property(
        assetTypeTokenArb(),
        assetTypeTokenArb(),
        (firstToken, secondToken) => {
          fc.pre(firstToken !== secondToken);
          const content = `**Type:** ${firstToken}\nSome text.\n**Type:** ${secondToken}\n`;
          expect(extractAssetType(content)).toBe(firstToken);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Spot-checks ───────────────────────────────────────────────

describe('extractAssetType — spot checks', () => {
  it('extracts "portrait" from a typical prompt file header', () => {
    const content = '# Ana Kim — Portrait\n**Type:** portrait\n**Dimensions:** 832x1248\n';
    expect(extractAssetType(content)).toBe('portrait');
  });

  it('extracts "background" from a scene prompt file', () => {
    const content = '# City Plaza\n**Type:** background\n**Dimensions:** 1392x752\n';
    expect(extractAssetType(content)).toBe('background');
  });

  it('extracts "html-background" with a hyphenated type token', () => {
    const content = '**Type:** html-background\n';
    expect(extractAssetType(content)).toBe('html-background');
  });

  it('extracts "tile" from a minimal one-line content', () => {
    expect(extractAssetType('**Type:** tile')).toBe('tile');
  });

  it('returns "unknown" for empty content', () => {
    expect(extractAssetType('')).toBe('unknown');
  });

  it('returns "unknown" when only a description is present', () => {
    expect(extractAssetType('## Prompt — Default\nA beautiful scene.\n')).toBe('unknown');
  });

  it('is not confused by "Type:" without bold markers', () => {
    // Plain "Type:" without ** markers should not match
    expect(extractAssetType('Type: background\n')).toBe('unknown');
  });
});
