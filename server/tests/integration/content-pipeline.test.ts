/**
 * Content Pipeline Testa
 * Validates every YAML file in /content against:
 *   - JSON schema (via Zod, using the shared validateContent pipeline)
 *   - DFS cycle detection on dialogue nodes
 *   - XSS pattern scanning
 *
 * All files must return valid: true for this suite to pass.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import path from 'path';
import { glob } from 'glob';
import { validateContent, validateYAMLFile } from '../../src/content/validate.js';

// Resolve content dir relative to this file's location (tests/integration/ → project root/content)
const CONTENT_DIR = path.resolve(process.cwd(), '../content');

let yamlFiles: string[] = [];

beforeAll(async () => {
  const found = await glob(`${CONTENT_DIR}/**/*.{yaml,yml}`, { absolute: true });
  yamlFiles = found;
});

describe('Content Pipeline Validation', () => {
  test('Content directory contains YAML files to validate', async () => {
    expect(yamlFiles.length).toBeGreaterThan(0);
  });

  test('Every YAML file passes schema + cycle-detection + XSS scan', async () => {
    const result = await validateContent(CONTENT_DIR);

    const errorMessages = result.errors
      .filter((e) => e.severity === 'error')
      .map((e) => `[${e.file ?? 'unknown'}] ${e.message}`);

    expect(errorMessages).toEqual([]);
    expect(result.valid).toBe(true);
  });

  // Per-file granularity so failures surface the exact offending file
  describe('Per-file schema validation', () => {
    // Dynamically register one test per file after the glob resolves.
    // Because Jest collects tests synchronously, we use a loop over the
    // module-level array that is populated in beforeAll.
    test.each([
      // Placeholder — replaced at runtime by the dynamic loop below.
      // The real tests are generated in the afterAll-style pattern below.
      ['placeholder', 'placeholder'],
    ])('skipped placeholder', () => {});
  });
});

// Dynamic per-file tests — registered at module evaluation time using a
// separate describe block so Jest can enumerate them before running.
describe('Per-file validation (dynamic)', () => {
  // We resolve the glob synchronously via a workaround: the tests will
  // actually execute after beforeAll has run, so yamlFiles will be populated.
  test('each YAML file is individually valid', async () => {
    // Re-resolve in case beforeAll hasn't run yet in this scope
    const files = await glob(`${CONTENT_DIR}/**/*.{yaml,yml}`, { absolute: true });
    expect(files.length).toBeGreaterThan(0);

    const results = await Promise.all(
      files.map(async (file) => {
        const result = await validateYAMLFile(file);
        return { file: path.relative(CONTENT_DIR, file), result };
      })
    );

    const failures = results
      .filter(({ result }) => !result.valid)
      .map(({ file, result }) => ({
        file,
        errors: result.errors.map((e) => e.message),
      }));

    expect(failures).toEqual([]);
  });
});
