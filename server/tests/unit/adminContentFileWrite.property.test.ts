import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// Admin Content — PUT /admin/content/file Property-Based Test
//
// Feature: authoring-mvp-phase-0
//
// Properties under test:
//   Property 5: YAML write rejection for invalid YAML
//
// Validates: Requirements 7.2
//
// For any string that is not parseable as valid YAML, a
// PUT /admin/content/file request with that string as `content`
// SHALL return HTTP 400 and SHALL NOT create or modify any file
// at the target path.
//
// Testing strategy:
//   - Import the handler logic by building a minimal Express-like
//     mock (req/res objects) and calling the route handler directly.
//   - Mock `fs.promises.writeFile` and `fs.promises.rename` to assert
//     they are never called when YAML is invalid.
//   - We use `js-yaml`'s own `load()` to generate known-invalid YAML
//     strings: any string that js-yaml throws on is invalid by definition.
// ============================================================

// We need to mock `fs` before importing the route module so the mock
// is in place when the module loads.  Jest ESM mocking is tricky, so
// we use jest.spyOn on the actual `fs.promises` methods after import.

import fs from 'node:fs';
import jsYaml from 'js-yaml';

// Import the route module (it re-exports validateContentPath too).
// The route handler is NOT exported directly, so we test via a
// lightweight fake Express request/response pair.
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminContentRouter } from '../../src/routes/admin-content.js';

// ── Minimal fake req/res helpers ─────────────────────────────

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(code: number): FakeResponse;
  json(data: unknown): FakeResponse;
}

function makeFakeRes(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
  };
  return res;
}

// ── Arbitraries for invalid YAML ─────────────────────────────

/**
 * Generates strings that are guaranteed to be invalid YAML by construction.
 *
 * Strategy: start with known structural patterns that js-yaml cannot parse:
 *   1. Unclosed flow mappings: `{ key: value` (missing closing `}`)
 *   2. Unclosed flow sequences: `[ a, b` (missing closing `]`)
 *   3. Duplicate-key block mappings embedded in an otherwise random string
 *      are NOT reliably invalid — so we focus on structural errors.
 *   4. Tab characters as indentation in block scalars (YAML forbids tabs).
 *   5. Any raw string produced by fc.string() that we verify throws when
 *      passed to jsYaml.load() — this is the most robust approach.
 */
const knownInvalidYamlArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    // Unclosed flow mapping
    fc.string({ minLength: 0, maxLength: 80 }).map(
      (s) => `{ key: ${s.replace(/[{}]/g, '')}`,
    ),
    // Unclosed flow sequence
    fc.string({ minLength: 0, maxLength: 80 }).map(
      (s) => `[ ${s.replace(/[\[\]]/g, '')}`,
    ),
    // Tab indentation — YAML block indent must not use tabs
    fc.string({ minLength: 1, maxLength: 40 }).map(
      (s) => `parent:\n\t${s.replace(/[\n\t]/g, '_')}: value`,
    ),
    // Mapping key followed by another mapping key at the same level without a value
    // e.g. "key1:\nkey2:" is actually VALID yaml (null values) — avoid that.
    // Instead use an explicit broken anchor reference: *undefined_anchor
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z]/.test(s)).map(
      (s) => `ref: *${s}_never_defined`,
    ),
  ).filter((s) => {
    // Final gate: confirm js-yaml actually rejects this string.
    // This makes the arbitrary self-validating — any edge case where
    // our pattern accidentally produces valid YAML is filtered out.
    try {
      jsYaml.load(s);
      return false; // js-yaml parsed it — not invalid, skip
    } catch {
      return true; // confirmed invalid
    }
  });

/**
 * A valid relative content path for the test (does not need to exist on disk).
 * Shape: `<subdir>/<name>.yaml` with safe characters only.
 */
const validPathArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
      { minLength: 3, maxLength: 12 },
    ),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
      { minLength: 3, maxLength: 20 },
    ),
  ).map(([dir, name]) => `${dir}/${name}.yaml`);

// ── Helper: send a fake PUT /file request through the router ─

/**
 * Sends a fake PUT request to the `PUT /file` route by finding the
 * matching layer in the Express router stack and calling its handler
 * directly.  This avoids spinning up a full HTTP server while still
 * exercising the real route handler.
 */
async function fakePutRequest(
  relPath: unknown,
  content: unknown,
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    const req = {
      method: 'PUT',
      path: '/file',
      url: '/file',
      body: { path: relPath, content },
    } as unknown as Request;

    const res = makeFakeRes();

    // Walk the router stack to find the PUT /file handler layer.
    // We call it directly (skipping auth middleware which isn't our concern here).
    const routerStack: any[] = (adminContentRouter as any).stack ?? [];
    let handlerFound = false;

    for (const layer of routerStack) {
      const route = layer.route;
      if (!route) continue;
      if (route.path !== '/file') continue;
      const methods: Record<string, boolean> = route.methods ?? {};
      if (!methods['put']) continue;

      handlerFound = true;
      // The route has one or more handler functions; call the last one (the actual handler)
      const handlers: Array<(req: Request, res: Response, next: NextFunction) => void> =
        route.stack.map((s: any) => s.handle);

      // Run through the handler chain (there is typically just one)
      let idx = 0;
      const next = () => {
        const fn = handlers[idx++];
        if (fn) fn(req, res as unknown as Response, next as NextFunction);
      };
      next();
      break;
    }

    if (!handlerFound) {
      resolve({ statusCode: 404, body: { error: 'route not found in stack' } });
      return;
    }

    // The handler is async; give it a tick to settle
    setTimeout(() => {
      resolve({ statusCode: res.statusCode, body: res.body });
    }, 50);
  });
}

// ── Spies ─────────────────────────────────────────────────────

let writeFileSpy: ReturnType<typeof jest.spyOn>;
let renameSpy: ReturnType<typeof jest.spyOn>;
let mkdirSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  writeFileSpy = jest
    .spyOn(fs.promises, 'writeFile')
    .mockResolvedValue(undefined);
  renameSpy = jest
    .spyOn(fs.promises, 'rename')
    .mockResolvedValue(undefined);
  mkdirSpy = jest
    .spyOn(fs.promises, 'mkdir')
    .mockResolvedValue(undefined);
  // Also mock stat for the success path (not needed for invalid-YAML tests,
  // but keeps things clean if any test accidentally reaches that code)
  jest.spyOn(fs.promises, 'stat').mockResolvedValue({
    size: 42,
    mtime: new Date('2024-01-01T00:00:00Z'),
  } as unknown as fs.Stats);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================
// Property 5: YAML write rejection for invalid YAML
//
// For any string that is not parseable as valid YAML, a
// PUT /admin/content/file request with that string as `content`
// SHALL return HTTP 400 and SHALL NOT create or modify any file
// at the target path.
//
// Validates: Requirements 7.2
// ============================================================

describe('Property 5: YAML write rejection for invalid YAML', () => {
  it('returns 400 for any invalid YAML string', async () => {
    await fc.assert(
      fc.asyncProperty(
        knownInvalidYamlArb(),
        validPathArb(),
        async (invalidContent, relPath) => {
          const result = await fakePutRequest(relPath, invalidContent);
          expect(result.statusCode).toBe(400);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('never calls writeFile when content is invalid YAML', async () => {
    await fc.assert(
      fc.asyncProperty(
        knownInvalidYamlArb(),
        validPathArb(),
        async (invalidContent, relPath) => {
          writeFileSpy.mockClear();
          await fakePutRequest(relPath, invalidContent);
          expect(writeFileSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('never calls rename when content is invalid YAML', async () => {
    await fc.assert(
      fc.asyncProperty(
        knownInvalidYamlArb(),
        validPathArb(),
        async (invalidContent, relPath) => {
          renameSpy.mockClear();
          await fakePutRequest(relPath, invalidContent);
          expect(renameSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('response body contains an error message when content is invalid YAML', async () => {
    await fc.assert(
      fc.asyncProperty(
        knownInvalidYamlArb(),
        validPathArb(),
        async (invalidContent, relPath) => {
          const result = await fakePutRequest(relPath, invalidContent);
          const body = result.body as any;
          expect(body.success).toBe(false);
          expect(typeof body.error).toBe('string');
          expect(body.error.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  // ── Deterministic spot-checks ─────────────────────────────

  it('spot-check: unclosed flow mapping `{ key: value` returns 400', async () => {
    const result = await fakePutRequest('characters/test.yaml', '{ key: value');
    expect(result.statusCode).toBe(400);
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('spot-check: unclosed flow sequence `[ a, b` returns 400', async () => {
    const result = await fakePutRequest('characters/test.yaml', '[ a, b');
    expect(result.statusCode).toBe(400);
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('spot-check: tab-indented block returns 400', async () => {
    const result = await fakePutRequest('characters/test.yaml', 'parent:\n\tchild: value');
    expect(result.statusCode).toBe(400);
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('spot-check: valid YAML does NOT return 400 (sanity check)', async () => {
    // Stub stat for the success case
    const result = await fakePutRequest(
      'characters/test.yaml',
      'id: test\nname: Test Character\n',
    );
    // Should not be 400 (invalid-YAML rejection)
    expect(result.statusCode).not.toBe(400);
  });
});
