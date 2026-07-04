import { describe, it, expect } from '@jest/globals';
import { sanitizePromptRel, sanitizeFilePath } from '../../src/utils/sanitize.js';

describe('sanitizePromptRel', () => {
  it('should return null for empty or invalid input', () => {
    expect(sanitizePromptRel('')).toBeNull();
    expect(sanitizePromptRel('   ')).toBeNull();
    expect(sanitizePromptRel(null as any)).toBeNull();
    expect(sanitizePromptRel(undefined as any)).toBeNull();
    expect(sanitizePromptRel(123 as any)).toBeNull();
  });

  it('should reject absolute paths', () => {
    expect(sanitizePromptRel('/absolute/path')).toBeNull();
    expect(sanitizePromptRel('C:\\Windows\\path')).toBeNull();
  });

  it('should reject paths with null bytes', () => {
    expect(sanitizePromptRel('path\0with\0null')).toBeNull();
  });

  it('should reject paths with directory traversal', () => {
    expect(sanitizePromptRel('../etc/passwd')).toBeNull();
    expect(sanitizePromptRel('foo/../bar')).toBeNull();
    expect(sanitizePromptRel('path/..')).toBeNull();
    expect(sanitizePromptRel('..\\path')).toBeNull();
  });

  it('should accept valid relative paths', () => {
    expect(sanitizePromptRel('isometric-map/assets/tile_street')).toBe('isometric-map/assets/tile_street');
    expect(sanitizePromptRel('characters/portraits/barista')).toBe('characters/portraits/barista');
    expect(sanitizePromptRel('simple-path')).toBe('simple-path');
  });

  it('should trim whitespace', () => {
    expect(sanitizePromptRel('  path/with/spaces  ')).toBe('path/with/spaces');
  });
});

describe('sanitizeFilePath', () => {
  it('should return null for empty or invalid input', () => {
    expect(sanitizeFilePath('')).toBeNull();
    expect(sanitizeFilePath('   ')).toBeNull();
    expect(sanitizeFilePath(null as any)).toBeNull();
    expect(sanitizeFilePath(undefined as any)).toBeNull();
  });

  it('should reject paths with null bytes', () => {
    expect(sanitizeFilePath('file\0name.txt')).toBeNull();
  });

  it('should reject paths with directory traversal', () => {
    expect(sanitizeFilePath('../../../etc/passwd')).toBeNull();
    expect(sanitizeFilePath('folder/../file.txt')).toBeNull();
    expect(sanitizeFilePath('..\\file.txt')).toBeNull();
  });

  it('should accept valid file paths', () => {
    expect(sanitizeFilePath('drafts/image.png')).toBe('drafts/image.png');
    expect(sanitizeFilePath('folder/subfolder/file.jpg')).toBe('folder/subfolder/file.jpg');
    expect(sanitizeFilePath('simple-file.txt')).toBe('simple-file.txt');
  });

  it('should normalize paths', () => {
    const result = sanitizeFilePath('folder//subfolder/./file.txt');
    expect(result).not.toBeNull();
    expect(result).toContain('folder');
    expect(result).toContain('subfolder');
    expect(result).toContain('file.txt');
  });
});