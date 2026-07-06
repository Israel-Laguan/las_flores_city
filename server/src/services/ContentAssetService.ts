import fs from 'node:fs';
import path from 'node:path';
import jsYaml from 'js-yaml';

/**
 * Resolves the content directory (same logic as admin-content.ts).
 */
function resolveContentDir(): string {
  const isSubdir = process.cwd().endsWith('server');
  return isSubdir
    ? path.resolve(process.cwd(), '..', 'content')
    : path.resolve(process.cwd(), 'content');
}

/**
 * Traverses an object tree to get the value at a dot/bracket path.
 *
 * Supports:
 *   - Simple keys: "portrait_urls"
 *   - Array indices: "portrait_urls[0]"
 *   - Nested: "portrait_urls[0].url"
 *
 * Returns the value at the path, or undefined if any part is missing.
 */
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function getValueAtPath(obj: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (PROTOTYPE_KEYS.has(part)) {
      return undefined;
    }
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Sets a value at a dot/bracket path, creating intermediate objects/arrays as needed.
 *
 * Supports:
 *   - Simple keys: "portrait_urls"
 *   - Array indices: "portrait_urls[0]" (creates array if needed)
 *   - Nested: "portrait_urls[0].url"
 */
function setValueAtPath(obj: Record<string, unknown>, fieldPath: string, value: unknown): unknown {
  const parts = fieldPath.replace(/\[(\d+)\]/g, '.$1').split('.');

  if (parts.some(part => PROTOTYPE_KEYS.has(part))) {
    throw new Error('Invalid field path: prototype pollution attempt detected');
  }

  if (parts.length === 1) {
    obj[parts[0]] = value;
    return obj;
  }

  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];
    const nextIsIndex = /^\d+$/.test(nextPart);

    if (current[part] === undefined || current[part] === null) {
      current[part] = nextIsIndex ? [] : {};
    }

    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;

  return obj;
}

export interface AssignAssetResult {
  path: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Assigns an asset URL to a field in a content YAML file.
 *
 * @param contentPath - Relative path within the content directory (e.g., "characters/char_ana_kim.yaml")
 * @param fieldPath - Dot/bracket path to the field (e.g., "portrait_urls[0].url")
 * @param assetUrl - The asset URL to assign
 * @returns The old and new values
 * @throws If the file doesn't exist, the path is invalid, or the resulting YAML is invalid
 */
export async function assignAsset(
  contentPath: string,
  fieldPath: string,
  assetUrl: string,
): Promise<AssignAssetResult> {
  const contentDir = resolveContentDir();
  const absolutePath = path.join(contentDir, contentPath);

  // Verify the resolved path is within the content directory
  if (!absolutePath.startsWith(contentDir + path.sep) && absolutePath !== contentDir) {
    throw new Error('Path traversal not allowed');
  }

  // Read the file
  let rawContent: string;
  try {
    rawContent = await fs.promises.readFile(absolutePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${contentPath}`);
    }
    throw err;
  }

  // Parse YAML
  const parsed = jsYaml.load(rawContent);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Content file is not a valid YAML object');
  }

  const data = parsed as Record<string, unknown>;

  // Get the old value
  const oldValue = getValueAtPath(data, fieldPath);

  // Set the new value
  setValueAtPath(data, fieldPath, assetUrl);

  // Validate the result by dumping and re-loading
  const newYaml = jsYaml.dump(data, { lineWidth: -1 });
  const reloaded = jsYaml.load(newYaml);
  if (!reloaded || typeof reloaded !== 'object') {
    throw new Error('Resulting YAML is invalid');
  }

  // Write back
  await fs.promises.writeFile(absolutePath, newYaml, 'utf-8');

  return {
    path: contentPath,
    fieldPath,
    oldValue,
    newValue: assetUrl,
  };
}
