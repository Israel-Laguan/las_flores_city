import path from 'node:path';

/**
 * Check if a path is a Windows-style absolute path (e.g., C:\, D:\, C:/, \\server\share)
 */
function isWindowsAbsolutePath(value: string): boolean {
  return path.win32.isAbsolute(value);
}

/**
 * Sanitize a prompt_rel path to prevent directory traversal attacks.
 * Returns null if the path is unsafe, otherwise returns the sanitized path.
 *
 * @param value - The path to sanitize
 * @returns Sanitized path or null if unsafe
 */
export function sanitizePromptRel(value: string): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // Trim whitespace
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Reject absolute paths (both Unix and Windows)
  if (path.isAbsolute(trimmed) || isWindowsAbsolutePath(trimmed)) {
    return null;
  }

  // Reject paths containing null bytes
  if (trimmed.includes('\0')) {
    return null;
  }

  // Reject paths containing directory traversal sequences
  if (trimmed.includes('..') || trimmed.split(path.sep).includes('..')) {
    return null;
  }

  // Normalize the path to handle any redundant separators
  const normalized = path.normalize(trimmed);
  
  // Double-check for traversal after normalization
  if (normalized !== trimmed || normalized.includes('..')) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize a file path to prevent directory traversal attacks.
 * Similar to sanitizePromptRel but designed for file paths.
 *
 * @param value - The file path to sanitize
 * @returns Sanitized path or null if unsafe
 */
export function sanitizeFilePath(value: string): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // Trim whitespace
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Reject absolute paths (both Unix and Windows)
  if (path.isAbsolute(trimmed) || isWindowsAbsolutePath(trimmed)) {
    return null;
  }

  // Reject null bytes
  if (trimmed.includes('\0')) {
    return null;
  }

  // Reject paths containing directory traversal sequences
  if (trimmed.includes('..') || trimmed.split(path.sep).includes('..')) {
    return null;
  }

  // Normalize the path
  const normalized = path.normalize(trimmed);
  
  // Double-check for traversal after normalization
  if (normalized.includes('..')) {
    return null;
  }

  return normalized;
}