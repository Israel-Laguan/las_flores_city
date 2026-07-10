/**
 * Lore Path Validation Tests
 * 
 * Tests for asset_paths and lore/narrative path validation
 * Feature: story-builder-milestone-3
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';

// Set up test environment
const testContentDir = path.resolve(process.cwd(), 'temp_test_content');
const testAssetsDir = path.join(testContentDir, 'assets');

// Mock the environment variables
const originalEnv = process.env;

beforeAll(async () => {
  // Create test directories
  await fs.mkdir(testAssetsDir, { recursive: true });
  
  // Create a test asset file
  await fs.writeFile(path.join(testAssetsDir, 'test_portrait.png'), Buffer.from('test'));
  
  // Set environment variables
  process.env.CONTENT_DIR = testContentDir;
  process.env.PROJECT_ROOT = path.resolve(process.cwd(), '..');
});

afterAll(async () => {
  // Restore environment
  process.env = originalEnv;
  
  // Clean up test directory
  try {
    await fs.rm(testContentDir, { recursive: true, force: true });
  } catch (e: any) {}
});

describe('Lore Path Validation', () => {
  // Import after setting up environment
  let validateLorePaths: (filePath: string, data: any, warnings: string[]) => Promise<void>;
  
  beforeAll(async () => {
    const module = await import('../../src/content/lorePathValidation.js');
    validateLorePaths = module.validateLorePaths;
  });

  describe('lore_path validation', () => {
    test('should not add warning when lore_path file exists', async () => {
      // Create a test lore file
      const testLoreDir = path.join(originalEnv.PROJECT_ROOT || process.cwd(), 'docs/lore/figures');
      await fs.mkdir(testLoreDir, { recursive: true });
      await fs.writeFile(path.join(testLoreDir, 'diego.md'), '# Diego');
      
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', { lore_path: 'docs/lore/figures/diego.md' }, warnings);
      
      expect(warnings).toEqual([]);
      
      // Clean up
      await fs.rm(testLoreDir, { recursive: true, force: true });
    });

    test('should add warning when lore_path file does not exist', async () => {
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', { lore_path: 'docs/lore/figures/nonexistent.md' }, warnings);
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Lore file not found');
      expect(warnings[0]).toContain('docs/lore/figures/nonexistent.md');
    });
  });

  describe('narrative_path validation', () => {
    test('should not add warning when narrative_path file exists', async () => {
      // Create a test narrative file
      await fs.writeFile(path.join(testContentDir, 'characters/char_diego.md'), '# Diego Narrative');
      
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', { narrative_path: 'characters/char_diego.md' }, warnings);
      
      expect(warnings).toEqual([]);
      
      // Clean up
      await fs.rm(path.join(testContentDir, 'characters'), { recursive: true, force: true });
    });

    test('should add warning when narrative_path file does not exist', async () => {
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', { narrative_path: 'characters/char_nonexistent.md' }, warnings);
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Narrative file not found');
      expect(warnings[0]).toContain('characters/char_nonexistent.md');
    });
  });

  describe('asset_paths validation', () => {
    test('should not add warning when all asset paths exist', async () => {
      // Create test asset files
      await fs.mkdir(path.join(testAssetsDir, 'characters/diego'), { recursive: true });
      await fs.writeFile(path.join(testAssetsDir, 'characters/diego/portrait.png'), Buffer.from('test'));
      await fs.writeFile(path.join(testAssetsDir, 'characters/diego/biometric.png'), Buffer.from('test'));
      
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', {
        asset_paths: {
          portrait: 'characters/diego/portrait.png',
          biometric: 'characters/diego/biometric.png',
        },
      }, warnings);
      
      expect(warnings).toEqual([]);
      
      // Clean up
      await fs.rm(path.join(testAssetsDir, 'characters'), { recursive: true, force: true });
    });

    test('should add warning when asset path does not exist', async () => {
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', {
        asset_paths: {
          portrait: 'characters/diego/nonexistent.png',
        },
      }, warnings);
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Asset file not found');
      expect(warnings[0]).toContain('characters/diego/nonexistent.png');
    });

    test('should add separate warnings for each missing asset path', async () => {
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', {
        asset_paths: {
          portrait: 'characters/diego/missing1.png',
          biometric: 'characters/diego/missing2.png',
        },
      }, warnings);
      
      expect(warnings.length).toBe(2);
      expect(warnings[0]).toContain('characters/diego/missing1.png');
      expect(warnings[1]).toContain('characters/diego/missing2.png');
    });

    test('should skip non-string asset paths', async () => {
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', {
        asset_paths: {
          portrait: 'characters/diego/portrait.png',
          // @ts-expect-error - testing with invalid type
          invalid: 123,
        },
      }, warnings);
      
      // Should only check the string path, which doesn't exist
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('characters/diego/portrait.png');
    });

    test('should handle empty asset_paths object', async () => {
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', { asset_paths: {} }, warnings);
      
      expect(warnings).toEqual([]);
    });

    test('should handle undefined asset_paths', async () => {
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', {}, warnings);
      
      expect(warnings).toEqual([]);
    });
  });

  describe('combined validation', () => {
    test('should validate lore_path, narrative_path, and asset_paths together', async () => {
      // Create existing files
      await fs.mkdir(path.join(testAssetsDir, 'scenes/plaza'), { recursive: true });
      await fs.writeFile(path.join(testAssetsDir, 'scenes/plaza/background.jpg'), Buffer.from('test'));
      
      const warnings: string[] = [];
      await validateLorePaths('test.yaml', {
        lore_path: 'docs/lore/landmarks/plaza.md',
        narrative_path: 'scenes/plaza.md',
        asset_paths: {
          background: 'scenes/plaza/background.jpg',
        },
      }, warnings);
      
      // Should have warnings for missing lore and narrative paths
      expect(warnings.length).toBe(2);
      expect(warnings.some(w => w.includes('Lore file not found'))).toBe(true);
      expect(warnings.some(w => w.includes('Narrative file not found'))).toBe(true);
      // No warning for asset path since we created the file
      expect(warnings.some(w => w.includes('background.jpg'))).toBe(false);
      
      // Clean up
      await fs.rm(path.join(testAssetsDir, 'scenes'), { recursive: true, force: true });
    });
  });
});
