import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { stringOf } from './__utils__/fastCheckV4';

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
  stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
    { minLength: 1, maxLength: 40 },
  );

const sizeTokenArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.integer({ min: 100, max: 4096 }),
    fc.integer({ min: 100, max: 4096 }),
  ).map(([w, h]) => `${w}x${h}`);

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

const promptFileContentWithFrontmatterArb = (): fc.Arbitrary<{ content: string; expectedType: string }> =>
  fc.tuple(
    assetTypeTokenArb(),
    sizeTokenArb(),
    surroundingTextArb(),
    surroundingTextArb(),
  ).map(([token, size, prefix, suffix]) => ({
    content: `---\nname: Test\ntype: ${token}\nsize: ${size}\nconsumer: ${token}\n---\n${prefix}${suffix}`,
    expectedType: token,
  }));

const promptFileContentWithBodyArb = (): fc.Arbitrary<{ content: string; expectedType: string }> =>
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
  // ── 7a: frontmatter `type:` wins (single source of truth) ────

  it('7a — extractAssetType returns frontmatter `type:` when present', () => {
    fc.assert(
      fc.property(
        promptFileContentWithFrontmatterArb(),
        ({ content, expectedType }) => {
          expect(extractAssetType(content)).toBe(expectedType);
        },
      ),
      { numRuns: 300, verbose: false },
    );
  });

  // ── 7b: body `**Type:**` fallback when no frontmatter ─────────

  it('7b — extractAssetType falls back to body `**Type:**` when frontmatter is absent', () => {
    fc.assert(
      fc.property(
        promptFileContentWithBodyArb(),
        ({ content, expectedType }) => {
          expect(extractAssetType(content)).toBe(expectedType);
        },
      ),
      { numRuns: 300, verbose: false },
    );
  });

  // ── 7c: frontmatter wins over body when both present ──────────

  it('7c — frontmatter `type:` overrides body `**Type:**` when both exist', () => {
    fc.assert(
      fc.property(
        assetTypeTokenArb(),
        assetTypeTokenArb(),
        (fmType, bodyType) => {
          fc.pre(fmType !== bodyType);
          const content = `---
type: ${fmType}
---
**Type:** ${bodyType}
`;
          expect(extractAssetType(content)).toBe(fmType);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  // ── 7d: extractAssetType is content-only (root-agnostic) ─────

  it('7d — same content produces the same asset_type regardless of (simulated) root', () => {
    fc.assert(
      fc.property(
        promptFileContentWithFrontmatterArb(),
        rootPathArb(),
        rootPathArb(),
        ({ content }, _rootA, _rootB) => {
          const typeFromRootA = extractAssetType(content);
          const typeFromRootB = extractAssetType(content);
          expect(typeFromRootA).toBe(typeFromRootB);
        },
      ),
      { numRuns: 300, verbose: false },
    );
  });

  // ── 7e: When type is absent entirely, result is 'unknown' ─────

  it('7e — returns "unknown" when frontmatter and body `**Type:**` are both absent', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }).filter(
          s => !s.includes('**Type:**') && !s.match(/^---[\s\S]*type:/m),
        ),
        (content) => {
          expect(extractAssetType(content)).toBe('unknown');
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  // ── 7f: Token is taken verbatim ───────────────────────────────

  it('7f — frontmatter type token is taken verbatim', () => {
    fc.assert(
      fc.property(
        assetTypeTokenArb(),
        (token) => {
          const content = `---
type: ${token}
---
`;
          expect(extractAssetType(content)).toBe(token);
        },
      ),
      { numRuns: 200, verbose: false },
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
