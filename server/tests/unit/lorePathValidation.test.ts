/**
 * Lore Path Validation Tests
 * 
 * Tests for asset_paths and lore/narrative path validation
 * Feature: story-builder-milestone-3
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// SAFETY: validateLorePaths resolves lore_path/narrative_path relative to the YAML's directory.
// Both are pointed at throwaway temp directories under the OS temp dir so the
// test never creates or removes files inside the real repo.
let testYamlDir: string;

beforeAll(async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-lore-path-'));
  testYamlDir = path.join(sandbox, 'content', 'characters', 'test_slug');
  await fs.mkdir(testYamlDir, { recursive: true });
  await fs.mkdir(path.join(testYamlDir, 'assets'), { recursive: true });
});

afterAll(async () => {
  try {
    await fs.rm(path.dirname(testYamlDir), { recursive: true, force: true });
  } catch (e: any) {}
});

describe('Lore Path Validation', () => {
  let validateLorePaths: (filePath: string, data: any, warnings: string[]) => Promise<void>;
  
  beforeAll(async () => {
    const module = await import('../../src/content/lorePathValidation.js');
    validateLorePaths = module.validateLorePaths;
  });

  describe('lore_path validation (per-folder layout)', () => {
    test('should not add warning when lore_path file exists in same directory', async () => {
      // Create a test lore file in the per-entity folder
      await fs.writeFile(path.join(testYamlDir, 'test_slug.md'), '# Test Lore');

      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, { lore_path: 'test_slug.md' }, warnings);

      expect(warnings).toEqual([]);

      // Clean up
      await fs.rm(path.join(testYamlDir, 'test_slug.md'), { force: true });
    });

    test('should add warning when lore_path file does not exist', async () => {
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, { lore_path: 'nonexistent.md' }, warnings);
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Lore file not found');
      expect(warnings[0]).toContain('nonexistent.md');
    });

    test('should fall back to old docs/lore/ path if per-folder file not found', async () => {
      // The validator should try both locations
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, { lore_path: 'docs/lore/figures/test_slug/test_slug.md' }, warnings);
      
      // Should warn since neither location has the file
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('narrative_path validation (per-folder layout)', () => {
    test('should not add warning when narrative_path file exists', async () => {
      await fs.writeFile(path.join(testYamlDir, 'test_slug.md'), '# Test Narrative');

      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, { narrative_path: 'test_slug.md' }, warnings);

      expect(warnings).toEqual([]);

      // Clean up
      await fs.rm(path.join(testYamlDir, 'test_slug.md'), { force: true });
    });

    test('should add warning when narrative_path file does not exist', async () => {
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, { narrative_path: 'nonexistent.md' }, warnings);
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Narrative file not found');
    });
  });

  describe('asset_paths validation (per-folder layout)', () => {
    test('should not add warning when asset file exists in assets/ subfolder', async () => {
      await fs.writeFile(path.join(testYamlDir, 'assets', 'test_slug__default.png'), Buffer.from('test'));
      
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, {
        asset_paths: {
          portrait: 'test_slug__default.png',
        },
      }, warnings);
      
      expect(warnings).toEqual([]);
    });

    test('should add warning when asset file does not exist', async () => {
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, {
        asset_paths: {
          portrait: 'nonexistent.png',
        },
      }, warnings);
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Asset file not found');
      expect(warnings[0]).toContain('nonexistent.png');
    });

    test('should skip non-string asset paths', async () => {
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, {
        asset_paths: {
          portrait: 'test_slug__default.png',
          // @ts-expect-error - testing with invalid type
          invalid: 123,
        },
      }, warnings);
      
      // Should only check the string path, which exists
      expect(warnings).toEqual([]);
    });

    test('should handle empty asset_paths object', async () => {
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, { asset_paths: {} }, warnings);
      
      expect(warnings).toEqual([]);
    });

    test('should handle undefined asset_paths', async () => {
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, {}, warnings);
      
      expect(warnings).toEqual([]);
    });
  });

  describe('combined validation', () => {
    test('should validate lore_path, narrative_path, and asset_paths together', async () => {
      // Create only the asset file
      await fs.writeFile(path.join(testYamlDir, 'assets', 'background.png'), Buffer.from('test'));
      
      const yamlPath = path.join(testYamlDir, 'char_test_slug.yaml');
      const warnings: string[] = [];
      await validateLorePaths(yamlPath, {
        lore_path: 'missing_lore.md',
        narrative_path: 'missing_narrative.md',
        asset_paths: {
          background: 'background.png',
        },
      }, warnings);
      
      // Should have warnings for missing lore and narrative paths
      expect(warnings.length).toBe(2);
      expect(warnings.some(w => w.includes('Lore file not found'))).toBe(true);
      expect(warnings.some(w => w.includes('Narrative file not found'))).toBe(true);
      // No warning for asset path since we created the file
      expect(warnings.some(w => w.includes('background.png'))).toBe(false);
    });
  });
});
