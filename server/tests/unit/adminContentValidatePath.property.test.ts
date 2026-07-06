import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import path from 'node:path';

// ============================================================
// Admin Content — validateContentPath Property-Based Tests
//
// Feature: authoring-mvp-phase-0
//
// Properties under test:
//   Property: validateContentPath rejects all unsafe / invalid paths
//
// Validates: Requirements 6.2, 6.3, 6.4, 7.3, 7.4, 7.5
//
// No mocking needed: validateContentPath is a pure function
// (all filesystem logic is in the handler, not the validator).
// ============================================================

import { validateContentPath, resolveContentDir } from '../../src/routes/admin-content.js';

// ── Shared arbitraries ────────────────────────────────────────

/** A safe path segment (alphanumeric + underscores, no dots or slashes). */
const safeSegmentArb = (): fc.Arbitrary<string> =>
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
    { minLength: 1, maxLength: 30 },
  );

/**
 * A valid-looking content path: `<dir>/<name>.yaml`.
 * These should all PASS validateContentPath (no traversal, ends with .yaml,
 * stays inside ContentDir when resolved).
 */
const validRelPathArb = (): fc.Arbitrary<string> =>
  fc.tuple(safeSegmentArb(), safeSegmentArb()).map(
    ([dir, name]) => `${dir}/${name}.yaml`,
  );

/**
 * A path that contains ".." somewhere — must always fail.
 * We embed ".." as a segment in various positions.
 */
const dotDotPathArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    // classical traversal prefix
    safeSegmentArb().map(stem => `../outside/${stem}.yaml`),
    // traversal in the middle
    fc.tuple(safeSegmentArb(), safeSegmentArb()).map(
      ([dir, stem]) => `${dir}/../../${stem}.yaml`,
    ),
    // traversal suffix (still contains "..")
    safeSegmentArb().map(stem => `characters/${stem}/../../../etc/passwd.yaml`),
    // any position
    fc.tuple(safeSegmentArb(), safeSegmentArb(), safeSegmentArb()).map(
      ([a, b, c]) => `${a}/../${b}/${c}.yaml`,
    ),
  );

/**
 * A path that does NOT end with ".yaml" — must always fail.
 */
const nonYamlExtArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    safeSegmentArb(),
    safeSegmentArb(),
    fc.constantFrom('.md', '.txt', '.json', '.png', '.yaml.bak', '.yml', ''),
  ).map(([dir, name, ext]) => `${dir}/${name}${ext}`);

/**
 * A path that resolves to outside ContentDir. We do this by building an
 * absolute path to a directory that is NOT under ContentDir and then making
 * it relative from ContentDir using `path.relative`, which produces a
 * traversal-based relative path.
 *
 * e.g. if ContentDir = /project/content
 *   path.relative('/project/content', '/etc/passwd.yaml')
 *   → '../../etc/passwd.yaml'
 *
 * We then add .yaml so the extension check passes before the guard runs.
 */
const escapingPathArb = (): fc.Arbitrary<string> => {
  const contentDir = resolveContentDir();
  // Build paths that are siblings or parents of contentDir
  return fc.oneof(
    // sibling directory
    safeSegmentArb().map(name => {
      const sibling = path.join(contentDir, '..', name, 'file.yaml');
      return path.relative(contentDir, sibling); // will contain ".."
    }),
    // two levels up
    fc.constant(
      path.relative(contentDir, path.join(contentDir, '..', '..', 'secret.yaml')),
    ),
  );
};

// ── Falsy / empty inputs ──────────────────────────────────────

describe('validateContentPath — falsy inputs always return valid: false', () => {
  it('rejects empty string', () => {
    const result = validateContentPath('');
    expect(result.valid).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }),
        (ws) => {
          const result = validateContentPath(ws);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('rejects null', () => {
    const result = validateContentPath(null);
    expect(result.valid).toBe(false);
  });

  it('rejects undefined', () => {
    const result = validateContentPath(undefined);
    expect(result.valid).toBe(false);
  });

  it('rejects numeric values', () => {
    fc.assert(
      fc.property(fc.double(), (n) => {
        const result = validateContentPath(n);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});

// ── Requirement 6.2 / 7.3 — paths containing ".." ────────────

describe('validateContentPath — paths containing ".." always return valid: false (Req 6.2, 7.3)', () => {
  it('rejects any path containing ".."', () => {
    fc.assert(
      fc.property(dotDotPathArb(), (relPath) => {
        const result = validateContentPath(relPath);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          // The reason must mention traversal sequences
          expect(result.reason.toLowerCase()).toMatch(/traversal|\.\.|\.\./);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('rejects the minimal traversal path "../x.yaml"', () => {
    expect(validateContentPath('../x.yaml').valid).toBe(false);
  });

  it('rejects "characters/../../etc/passwd.yaml"', () => {
    expect(validateContentPath('characters/../../etc/passwd.yaml').valid).toBe(false);
  });
});

// ── Requirement 6.3 / 7.4 — paths not ending with ".yaml" ────

describe('validateContentPath — paths not ending in ".yaml" always return valid: false (Req 6.3, 7.4)', () => {
  it('rejects any path with a non-.yaml extension', () => {
    fc.assert(
      fc.property(nonYamlExtArb(), (relPath) => {
        // Skip any that accidentally end with .yaml (empty ext edge case)
        if (relPath.endsWith('.yaml')) return;
        const result = validateContentPath(relPath);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.reason.toLowerCase()).toMatch(/yaml/);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('rejects a plain .md file', () => {
    expect(validateContentPath('characters/ana_kim.md').valid).toBe(false);
  });

  it('rejects a .yml file (must be .yaml, not .yml)', () => {
    expect(validateContentPath('characters/ana_kim.yml').valid).toBe(false);
  });

  it('rejects a path with no extension', () => {
    expect(validateContentPath('characters/ana_kim').valid).toBe(false);
  });
});

// ── Requirement 6.4 / 7.5 — paths that escape ContentDir ─────

describe('validateContentPath — paths that resolve outside ContentDir always return valid: false (Req 6.4, 7.5)', () => {
  it('rejects any path whose resolved absolute path escapes ContentDir', () => {
    fc.assert(
      fc.property(escapingPathArb(), (relPath) => {
        // Only test paths that actually contain ".." (skip any that don't — which
        // would indicate path.relative produced a non-traversal, meaning we stayed
        // inside ContentDir)
        if (!relPath.includes('..')) return;
        const result = validateContentPath(relPath);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects a crafted path that escapes via many "..": "../../../../etc/passwd.yaml"', () => {
    expect(validateContentPath('../../../../etc/passwd.yaml').valid).toBe(false);
  });
});

// ── Valid paths pass all rules ────────────────────────────────

describe('validateContentPath — well-formed paths return valid: true', () => {
  it('accepts valid paths of the form <subdir>/<name>.yaml', () => {
    fc.assert(
      fc.property(validRelPathArb(), (relPath) => {
        const result = validateContentPath(relPath);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('spot-check: known good content paths pass', () => {
    const goodPaths = [
      'characters/char_ana_kim.yaml',
      'scenes/sc_barrio_verde.yaml',
      'mysteries/myst_001.yaml',
      'dialogues/dlg_intro.yaml',
      'locations/loc_south_district.yaml',
    ];
    for (const p of goodPaths) {
      expect(validateContentPath(p).valid).toBe(true);
    }
  });
});
