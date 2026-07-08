import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import path from 'node:path';

// ============================================================
// Asset Prompt Catalog — Multi-Root Property-Based Tests
//
// Feature: authoring-mvp-phase-0
//
// Properties under test:
//   Property 8: Multi-root prompt catalog completeness
//
// Validates: Requirements 9.1, 9.6
//
// Testing strategy:
//   - Use `buildPromptCatalogFromRoots(roots)` — the testable helper
//     exported from assets.helpers that accepts roots as parameters.
//   - Mock `fs.promises.access`, `fs.promises.readdir`, and
//     `fs.promises.readFile` via jest.spyOn to simulate a virtual
//     filesystem with controllable prompt files across multiple roots.
//   - Property 8a: every .prompt.md file from every existing root
//     appears in the catalog result (completeness).
//   - Property 8b: making one root non-existent does not throw and
//     does not drop files from the remaining roots (skip-absent).
// ============================================================

import fs from 'node:fs';
import { buildPromptCatalogFromRoots } from '../../src/routes/assets.helpers.js';

// ── Helpers to build fake Dirent objects ─────────────────────

function makeFakeFileDirent(name: string, parentPath: string): fs.Dirent {
  return {
    name,
    path: parentPath,
    parentPath,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as unknown as fs.Dirent;
}

function makeFakeDirDirent(name: string, parentPath: string): fs.Dirent {
  return {
    name,
    path: parentPath,
    parentPath,
    isFile: () => false,
    isDirectory: () => true,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as unknown as fs.Dirent;
}

// ── Minimal valid .prompt.md content ─────────────────────────

function makePromptContent(name: string): string {
  return `# ${name}\n**Type:** portrait\n**Dimensions:** 832x1248\n\n## Prompt — Default\nA vivid scene.\n`;
}

// ── Virtual filesystem builder ────────────────────────────────
//
// Given a map of root → [filename, ...] for .prompt.md files,
// builds the mock implementations for fs.promises.access,
// fs.promises.readdir, and fs.promises.readFile.

interface VirtualFS {
  /** roots that exist on the "filesystem" */
  existingRoots: Set<string>;
  /** map from absolute file path → content */
  fileContents: Map<string, string>;
  /** map from directory path → fs.Dirent[] */
  dirEntries: Map<string, fs.Dirent[]>;
}

function buildVirtualFS(
  rootFiles: Array<{ root: string; filenames: string[] }>,
  absentRoots: string[],
): VirtualFS {
  const existingRoots = new Set<string>();
  const fileContents = new Map<string, string>();
  const dirEntries = new Map<string, fs.Dirent[]>();

  for (const { root, filenames } of rootFiles) {
    existingRoots.add(root);
    const dirents: fs.Dirent[] = filenames.map((fn) => makeFakeFileDirent(fn, root));
    dirEntries.set(root, dirents);

    for (const fn of filenames) {
      const fullPath = path.join(root, fn);
      fileContents.set(fullPath, makePromptContent(path.basename(fn, '.prompt.md')));
    }
  }

  // Absent roots are intentionally NOT added to existingRoots

  return { existingRoots, fileContents, dirEntries };
}

// ── Arbitraries ───────────────────────────────────────────────

/** Safe filename stem: lowercase letters + underscores, 1-20 chars. */
const stemArb = (): fc.Arbitrary<string> =>
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')),
    { minLength: 1, maxLength: 20 },
  );

/** Generates a list of unique .prompt.md filenames for one root. */
const promptFilenamesArb = (minFiles = 0, maxFiles = 5): fc.Arbitrary<string[]> =>
  fc.array(stemArb(), { minLength: minFiles, maxLength: maxFiles }).map((stems) => {
    // Deduplicate by converting to a set of unique stems
    const unique = [...new Set(stems)];
    return unique.map((s) => `${s}.prompt.md`);
  });

/** The three canonical root paths used in tests. */
const ROOT_UI = '/app/docs/lore/assets/ui-concepts';
const ROOT_FIGURES = '/app/docs/lore/figures';
const ROOT_LANDMARKS = '/app/docs/lore/districts/city/landmarks';
const ALL_ROOTS = [ROOT_UI, ROOT_FIGURES, ROOT_LANDMARKS];

/**
 * Generates a distribution of .prompt.md filenames across the three roots.
 * At least one root will be non-empty (so there is something to test).
 * Returns { rootFiles: [{root, filenames}], allRoots: string[] }.
 */
const rootDistributionArb = (): fc.Arbitrary<{
  rootFiles: Array<{ root: string; filenames: string[] }>;
  allRoots: string[];
}> =>
  fc.tuple(
    promptFilenamesArb(0, 5), // ui-concepts files
    promptFilenamesArb(0, 5), // figures files
    promptFilenamesArb(0, 5), // landmarks files
  )
    .filter(([a, b, c]) => a.length + b.length + c.length > 0) // at least one file exists
    .map(([uiFiles, figFiles, lmkFiles]) => ({
      rootFiles: [
        { root: ROOT_UI, filenames: uiFiles },
        { root: ROOT_FIGURES, filenames: figFiles },
        { root: ROOT_LANDMARKS, filenames: lmkFiles },
      ],
      allRoots: ALL_ROOTS,
    }));

// ── Spies ─────────────────────────────────────────────────────

let accessSpy: ReturnType<typeof jest.spyOn>;
let readdirSpy: ReturnType<typeof jest.spyOn>;
let readFileSpy: ReturnType<typeof jest.spyOn>;

function installMocks(vfs: VirtualFS): void {
  accessSpy = jest
    .spyOn(fs.promises, 'access')
    .mockImplementation(async (p) => {
      const resolved = String(p);
      if (!vfs.existingRoots.has(resolved)) {
        throw Object.assign(new Error(`ENOENT: ${resolved}`), { code: 'ENOENT' });
      }
      // Exists — resolve normally
    });

  readdirSpy = jest
    .spyOn(fs.promises, 'readdir')
    .mockImplementation(async (p) => {
      const dir = String(p);
      const entries = vfs.dirEntries.get(dir);
      if (entries === undefined) {
        throw Object.assign(new Error(`ENOENT: ${dir}`), { code: 'ENOENT' });
      }
      return entries as any;
    });

  readFileSpy = jest
    .spyOn(fs.promises, 'readFile')
    .mockImplementation(async (p) => {
      const filePath = String(p);
      const content = vfs.fileContents.get(filePath);
      if (content === undefined) {
        throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      }
      return content as any;
    });
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================
// Property 8: Multi-root prompt catalog completeness
//
// Property 8a — completeness:
//   For any non-empty distribution of .prompt.md files across the
//   three roots, every file from every root MUST appear in the
//   catalog result. No file from an existing root may be dropped.
//
// Property 8b — skip-absent:
//   When one root does not exist on the filesystem, the call MUST
//   NOT throw and MUST still return all files from the remaining roots.
//
// Validates: Requirements 9.1, 9.6
// ============================================================

describe('Property 8: Multi-root prompt catalog completeness', () => {
  // ── 8a: All files from existing roots appear in the result ──

  it('8a — all .prompt.md files from all existing roots appear in the catalog', async () => {
    await fc.assert(
      fc.asyncProperty(
        rootDistributionArb(),
        async ({ rootFiles, allRoots }) => {
          const vfs = buildVirtualFS(rootFiles, []);
          installMocks(vfs);

          const result = await buildPromptCatalogFromRoots(allRoots);

          // Collect all prompt_file values from the catalog result
          const cataloggedPaths = new Set<string>(
            result.categories.flatMap((cat) => cat.entries.map((e) => e.prompt_file)),
          );

          // Every file from every root must be present
          for (const { root, filenames } of rootFiles) {
            for (const fn of filenames) {
              const fullPath = path.join(root, fn);
              expect(cataloggedPaths.has(fullPath)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 150, verbose: false },
    );
  });

  // ── 8b: Making one root absent does not throw ──

  it('8b — making one root non-existent does not throw', async () => {
    await fc.assert(
      fc.asyncProperty(
        rootDistributionArb(),
        // Pick which root to make absent (0=ui-concepts, 1=figures, 2=landmarks)
        fc.integer({ min: 0, max: 2 }),
        async ({ rootFiles, allRoots }, absentIdx) => {
          const absentRoot = allRoots[absentIdx];
          // Build VFS with the absent root excluded from existingRoots
          const presentFiles = rootFiles.filter((rf) => rf.root !== absentRoot);
          const vfs = buildVirtualFS(presentFiles, [absentRoot]);
          installMocks(vfs);

          // Must not throw
          const result = await buildPromptCatalogFromRoots(allRoots);

          // All files from the remaining (non-absent) roots must be present
          const cataloggedPaths = new Set<string>(
            result.categories.flatMap((cat) => cat.entries.map((e) => e.prompt_file)),
          );

          for (const { root, filenames } of presentFiles) {
            for (const fn of filenames) {
              const fullPath = path.join(root, fn);
              expect(cataloggedPaths.has(fullPath)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 150, verbose: false },
    );
  });

  // ── 8c: Files from the absent root are not in the result ──

  it('8c — files from an absent root do not appear in the result', async () => {
    await fc.assert(
      fc.asyncProperty(
        rootDistributionArb(),
        fc.integer({ min: 0, max: 2 }),
        async ({ rootFiles, allRoots }, absentIdx) => {
          const absentRoot = allRoots[absentIdx];
          const absentFiles = rootFiles.find((rf) => rf.root === absentRoot);
          const presentFiles = rootFiles.filter((rf) => rf.root !== absentRoot);
          const vfs = buildVirtualFS(presentFiles, [absentRoot]);
          installMocks(vfs);

          const result = await buildPromptCatalogFromRoots(allRoots);

          const cataloggedPaths = new Set<string>(
            result.categories.flatMap((cat) => cat.entries.map((e) => e.prompt_file)),
          );

          // No file from the absent root should appear
          if (absentFiles) {
            for (const fn of absentFiles.filenames) {
              const fullPath = path.join(absentRoot, fn);
              expect(cataloggedPaths.has(fullPath)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 150, verbose: false },
    );
  });

  // ── 8d: All three roots absent → empty catalog, no throw ──

  it('8d — when all roots are absent, result is an empty catalog (no throw)', async () => {
    const vfs = buildVirtualFS([], ALL_ROOTS);
    installMocks(vfs);

    const result = await buildPromptCatalogFromRoots(ALL_ROOTS);
    expect(result.categories).toHaveLength(0);
  });

  // ── 8e: Empty roots list → empty catalog ──

  it('8e — empty roots list yields an empty catalog', async () => {
    const vfs = buildVirtualFS([], []);
    installMocks(vfs);

    const result = await buildPromptCatalogFromRoots([]);
    expect(result.categories).toHaveLength(0);
  });

  // ── Spot-checks ───────────────────────────────────────────

  it('spot-check: two files in figures root appear in catalog', async () => {
    const rootFiles = [
      { root: ROOT_FIGURES, filenames: ['ana_kim.prompt.md', 'carlos.prompt.md'] },
    ];
    const vfs = buildVirtualFS(rootFiles, [ROOT_UI, ROOT_LANDMARKS]);
    installMocks(vfs);

    const result = await buildPromptCatalogFromRoots(ALL_ROOTS);
    const allFiles = result.categories.flatMap((c) => c.entries.map((e) => e.prompt_file));

    expect(allFiles).toContain(path.join(ROOT_FIGURES, 'ana_kim.prompt.md'));
    expect(allFiles).toContain(path.join(ROOT_FIGURES, 'carlos.prompt.md'));
  });

  it('spot-check: one file in each root all appear in catalog', async () => {
    const rootFiles = [
      { root: ROOT_UI, filenames: ['hero_tile.prompt.md'] },
      { root: ROOT_FIGURES, filenames: ['ana_kim.prompt.md'] },
      { root: ROOT_LANDMARKS, filenames: ['city_plaza.prompt.md'] },
    ];
    const vfs = buildVirtualFS(rootFiles, []);
    installMocks(vfs);

    const result = await buildPromptCatalogFromRoots(ALL_ROOTS);
    const allFiles = result.categories.flatMap((c) => c.entries.map((e) => e.prompt_file));

    expect(allFiles).toContain(path.join(ROOT_UI, 'hero_tile.prompt.md'));
    expect(allFiles).toContain(path.join(ROOT_FIGURES, 'ana_kim.prompt.md'));
    expect(allFiles).toContain(path.join(ROOT_LANDMARKS, 'city_plaza.prompt.md'));
  });

  it('spot-check: absent landmarks root does not break ui-concepts results', async () => {
    const rootFiles = [
      { root: ROOT_UI, filenames: ['hero_tile.prompt.md'] },
      { root: ROOT_FIGURES, filenames: ['ana_kim.prompt.md'] },
    ];
    const vfs = buildVirtualFS(rootFiles, [ROOT_LANDMARKS]);
    installMocks(vfs);

    const result = await buildPromptCatalogFromRoots(ALL_ROOTS);
    const allFiles = result.categories.flatMap((c) => c.entries.map((e) => e.prompt_file));

    expect(allFiles).toContain(path.join(ROOT_UI, 'hero_tile.prompt.md'));
    expect(allFiles).toContain(path.join(ROOT_FIGURES, 'ana_kim.prompt.md'));
    expect(allFiles).not.toContain(expect.stringContaining(ROOT_LANDMARKS));
  });
});
