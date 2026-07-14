import path from 'node:path';
import { resolvePromptFile } from './assets.helpers.js';

const DRAFTS_DIR = 'drafts';

export function getVariantNameFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const parts = base.split('__');
  if (parts.length === 2) {
    return parts[1];
  }
  return base;
}

export function isBaseVariant(filename: string): boolean {
  return getVariantNameFromFilename(filename) === 'base';
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveAllowedImportFile(promptRel: string, filePath: string): string | null {
  const promptFile = resolvePromptFile(promptRel);
  const promptDir = path.dirname(promptFile);
  const baseName = path.basename(promptFile, '.md');
  const allowedRoots = [
    path.join(promptDir, baseName, DRAFTS_DIR),
    path.join(promptDir, DRAFTS_DIR),
  ].map((dir) => path.resolve(dir));
  const resolvedFilePath = path.resolve(filePath);

  return allowedRoots.some((root) => isPathInside(resolvedFilePath, root)) ? resolvedFilePath : null;
}

export interface DraftsFolderRef {
  draftsFolder: string;
  promptRel: string;
}

export interface ImportResult {
  imported: { bases: number; variants: number };
  errors: Array<{ file: string; error: string }>;
  details: Array<{
    prompt_rel: string;
    action: 'base' | 'variant';
    filename: string;
    success: boolean;
    id?: string;
    error?: string;
  }>;
}
