import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import jsYaml from 'js-yaml';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { getLoreDir } from './admin-lore.js';
import { resolveContentDir } from './admin-content.js';
import { queryOLTP } from '../database/connection.js';

/**
 * Admin Coverage Router
 *
 * Provides the GET /admin/coverage endpoint that cross-references lore
 * markdown files against content YAML files and database records.
 *
 * All routes require admin/developer role (authAndAdminMiddleware).
 */
export const adminCoverageRouter = express.Router();

// All routes need admin auth
adminCoverageRouter.use(authAndAdminMiddleware);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FigureCoverageItem {
  name: string;              // Lore stem (e.g. "ana_kim")
  lorePath: string;          // Relative lore path (e.g. "figures/ana_kim.md")
  hasCharacterYaml: boolean;
  hasPortraitUrl: boolean;
  hasDialogue: boolean;
}

export interface DistrictCoverageItem {
  name: string;              // Lore stem (e.g. "south")
  lorePath: string;          // Relative lore path (e.g. "districts/south.md")
  hasSceneYaml: boolean;
  hasBackgroundUrl: boolean;
}

export interface LandmarkCoverageItem {
  name: string;              // Lore stem
  lorePath: string;          // Relative lore path
  hasSceneYaml: boolean;
  hasBackgroundUrl: boolean;
}

export interface StoryCoverageItem {
  name: string;              // Lore stem
  lorePath: string;          // Relative lore path
  hasMysteryYaml: boolean;
}

// ---------------------------------------------------------------------------
// Stem extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the stem from a figure lore path.
 *
 * e.g. "figures/ana_kim.md"  → "ana_kim"
 *      "figures/sub/foo.md"  → "foo"
 */
export function figureStem(figurePath: string): string {
  const filename = figurePath.split('/').pop() ?? figurePath;
  return filename.endsWith('.md') ? filename.slice(0, -'.md'.length) : filename;
}

/**
 * Extracts the matchable stem from a character YAML path.
 *
 * Strips the "char_" prefix (if present) and the ".yaml" extension.
 *
 * e.g. "content/characters/char_ana_kim.yaml" → "ana_kim"
 *      "characters/char_ana_kim.yaml"          → "ana_kim"
 *      "characters/ana_kim.yaml"               → "ana_kim"
 */
export function characterStem(characterPath: string): string {
  const filename = characterPath.split('/').pop() ?? characterPath;
  const withoutExt = filename.endsWith('.yaml') ? filename.slice(0, -'.yaml'.length) : filename;
  return withoutExt.startsWith('char_') ? withoutExt.slice('char_'.length) : withoutExt;
}

// ---------------------------------------------------------------------------
// Pure matching functions
// ---------------------------------------------------------------------------

/**
 * Cross-references figure lore paths against character YAML paths.
 *
 * A figure is considered covered (`hasCharacterYaml: true`) when the
 * figure's stem is a case-insensitive substring of any character stem.
 *
 * e.g. figure stem "ana_kim" matches character stem "ana_kim" (exact)
 *      figure stem "ana_kim" matches character stem "char_ana_kim" (after
 *        the "char_" prefix is stripped by characterStem())
 *
 * This is a pure function — no filesystem, no DB.
 *
 * Satisfies: Requirement 8.2
 */
export function matchFiguresToCharacters(
  figurePaths: string[],
  characterPaths: string[],
): FigureCoverageItem[] {
  // Pre-compute character stems once for efficiency
  const charStems = characterPaths.map(p => characterStem(p).toLowerCase());

  return figurePaths.map(lorePath => {
    const stem = figureStem(lorePath);
    const lowerStem = stem.toLowerCase();

    // A figure is covered if its stem is a substring of any character stem
    const hasCharacterYaml = charStems.some(cs => cs.includes(lowerStem));

    return {
      name: stem,
      lorePath,
      hasCharacterYaml,
      hasPortraitUrl: false, // filled in by the DB phase in the route handler
      hasDialogue: false,    // filled in by the DB phase in the route handler
    };
  });
}

/**
 * Cross-references district lore paths against scene YAML data.
 *
 * A district is covered when its stem matches `scene.district` (case-insensitive).
 *
 * `scenes` is expected to be a list of `{ district?: string }` objects
 * already parsed from content YAML.
 *
 * Satisfies: Requirement 8.3
 */
export function matchDistrictsToScenes(
  districtPaths: string[],
  scenes: Array<{ district?: string }>,
): DistrictCoverageItem[] {
  // Pre-compute district values from scenes
  const sceneDistricts = scenes
    .map(s => (s.district ?? '').toLowerCase())
    .filter(d => d.length > 0);

  return districtPaths.map(lorePath => {
    const stem = figureStem(lorePath); // same filename → stem logic applies
    const lowerStem = stem.toLowerCase();
    const hasSceneYaml = sceneDistricts.includes(lowerStem);

    return {
      name: stem,
      lorePath,
      hasSceneYaml,
      hasBackgroundUrl: false, // filled in by the DB phase
    };
  });
}

/**
 * Normalizes a string for name-similarity matching.
 * Lowercases, strips non-alphanumeric characters, collapses spaces.
 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Cross-references landmark lore paths against scene YAML data.
 *
 * Uses normalized name similarity: the landmark stem (normalized) must be
 * a substring of or equal to the scene name (normalized).
 *
 * `scenes` is expected to be a list of `{ name?: string }` objects.
 *
 * Satisfies: Requirement 8.4
 */
export function matchLandmarksToScenes(
  landmarkPaths: string[],
  scenes: Array<{ name?: string }>,
): LandmarkCoverageItem[] {
  const sceneNames = scenes
    .map(s => normalizeName(s.name ?? ''))
    .filter(n => n.length > 0);

  return landmarkPaths.map(lorePath => {
    const stem = figureStem(lorePath);
    const normalizedStem = normalizeName(stem.replace(/_/g, ' '));
    const hasSceneYaml = sceneNames.some(
      sn => sn.includes(normalizedStem) || normalizedStem.includes(sn),
    );

    return {
      name: stem,
      lorePath,
      hasSceneYaml,
      hasBackgroundUrl: false, // filled in by the DB phase
    };
  });
}

/**
 * Cross-references story lore paths against mystery YAML data.
 *
 * Uses normalized name similarity: the story stem (normalized) must be
 * a substring of or equal to the mystery title (normalized).
 *
 * `mysteries` is expected to be a list of `{ title?: string }` objects.
 *
 * Satisfies: Requirement 8.5
 */
export function matchStoriesToMysteries(
  storyPaths: string[],
  mysteries: Array<{ title?: string }>,
): StoryCoverageItem[] {
  const mysteryTitles = mysteries
    .map(m => normalizeName(m.title ?? ''))
    .filter(t => t.length > 0);

  return storyPaths.map(lorePath => {
    const stem = figureStem(lorePath);
    const normalizedStem = normalizeName(stem.replace(/_/g, ' '));
    const hasMysteryYaml = mysteryTitles.some(
      mt => mt.includes(normalizedStem) || normalizedStem.includes(mt),
    );

    return {
      name: stem,
      lorePath,
      hasMysteryYaml,
    };
  });
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Returns relative paths (relative to `baseDir`) of all .md files (excluding
 * .prompt.md) within `baseDir`, using recursive readdir.
 * Returns an empty array if the directory doesn't exist.
 */
async function listMdFiles(baseDir: string): Promise<string[]> {
  try {
    await fs.promises.access(baseDir);
  } catch {
    return [];
  }

  const dirents = await fs.promises.readdir(baseDir, {
    withFileTypes: true,
    recursive: true,
  });

  const results: string[] = [];
  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    if (!dirent.name.endsWith('.md') || dirent.name.endsWith('.prompt.md')) continue;

    const absolutePath = path.join(dirent.path, dirent.name);
    const relativePath = path.relative(baseDir, absolutePath).split(path.sep).join('/');
    results.push(relativePath);
  }
  return results;
}

/**
 * Returns relative paths (relative to `baseDir`) of all .yaml files within
 * a specific subdirectory.
 * Returns an empty array if the directory doesn't exist.
 */
async function listYamlFiles(baseDir: string, subdir: string): Promise<string[]> {
  const targetDir = path.join(baseDir, subdir);
  try {
    await fs.promises.access(targetDir);
  } catch {
    return [];
  }

  const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.yaml')) {
      results.push(`${subdir}/${entry.name}`);
    }
  }
  return results;
}

/**
 * Parses a YAML file and returns the parsed object, or null on error.
 */
async function parseYamlFile(absolutePath: string): Promise<unknown> {
  try {
    const content = await fs.promises.readFile(absolutePath, 'utf-8');
    return jsYaml.load(content);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /admin/coverage
//
// Cross-references lore markdown files against content YAML files and DB records.
//
// Satisfies: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
// ---------------------------------------------------------------------------

adminCoverageRouter.get('/', async (_req, res) => {
  try {
    const loreDir = getLoreDir();
    const contentDir = resolveContentDir();

    // Phase 1-5 orchestration
    const filesData = await processFileSystem(loreDir, contentDir);
    const parsedData = await parseYamlFiles(contentDir, filesData);
    const matchingResults = runMatchingFunctions(
      filesData.figurePaths,
      filesData.districtPaths,
      filesData.landmarkAbsSubpaths,
      filesData.storyPaths,
      filesData.characterYamlPaths,
      parsedData.sceneObjects,
      parsedData.mysteryObjects,
    );
    await enrichWithDatabaseResults(matchingResults.figures, matchingResults.districts, matchingResults.landmarks);

    // Return assembled response
    res.json(assembleResponse(matchingResults.figures, matchingResults.districts, matchingResults.landmarks, matchingResults.stories));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin-coverage] GET / error:', error);
    res.status(500).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// Phase 1: Filesystem processing
// ---------------------------------------------------------------------------
async function processFileSystem(loreDir: string, contentDir: string): Promise<{
  figurePaths: string[],
  districtPaths: string[],
  landmarkAbsSubpaths: string[],
  storyPaths: string[],
  characterYamlPaths: string[],
  sceneYamlPaths: string[],
  mysteryYamlPaths: string[],
}> {
  const [
    figurePaths,
    districtPaths,
    landmarkAbsSubpaths,
    storyPaths,
    characterYamlPaths,
    sceneYamlPaths,
    mysteryYamlPaths,
  ] = await Promise.all([
    // Lore paths — relative to their lore subdir, prefixed with subdir name
    listMdFiles(path.join(loreDir, 'figures')).then(ps => ps.map(p => `figures/${p}`)),
    listMdFiles(path.join(loreDir, 'districts')).then(ps => ps.map(p => `districts/${p}`)),
    listMdFiles(path.join(loreDir, 'landmarks')).then(ps => ps.map(p => `landmarks/${p}`)),
    listMdFiles(path.join(loreDir, 'stories')).then(ps => ps.map(p => `stories/${p}`)),
    // Content YAML paths — relative to contentDir
    listYamlFiles(contentDir, 'characters'),
    listYamlFiles(contentDir, 'scenes'),
    listYamlFiles(contentDir, 'mysteries'),
  ]);
  
  return {
    figurePaths,
    districtPaths,
    landmarkAbsSubpaths,
    storyPaths,
    characterYamlPaths,
    sceneYamlPaths,
    mysteryYamlPaths,
  };
}

// ---------------------------------------------------------------------------
// Phase 2: YAML file parsing
// ---------------------------------------------------------------------------
async function parseYamlFiles(
  contentDir: string,
  filesData: {
    sceneYamlPaths: string[],
    mysteryYamlPaths: string[],
  },
): Promise<{
  sceneObjects: Array<{ district?: string; name?: string }>,
  mysteryObjects: Array<{ title?: string }>,
}> {
  // Parse all scene YAMLs to extract { district, name }
  const sceneObjects: Array<{ district?: string; name?: string }> = (
    await Promise.all(
      filesData.sceneYamlPaths.map(async relPath => {
        const parsed = await parseYamlFile(path.join(contentDir, relPath));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          const result: { district?: string; name?: string } = {};
          if (typeof obj['district'] === 'string') result.district = obj['district'];
          if (typeof obj['name'] === 'string') result.name = obj['name'];
          return result;
        }
        return null;
      }),
    )
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  // Parse all mystery YAMLs to extract { title }
  // Mystery files have a top-level `mysteries` array wrapping the items.
  const mysteryObjects: Array<{ title?: string }> = (
    await Promise.all(
      filesData.mysteryYamlPaths.map(async relPath => {
        const parsed = await parseYamlFile(path.join(contentDir, relPath));
        if (!parsed || typeof parsed !== 'object') return [];
        const obj = parsed as Record<string, unknown>;
        // Handle both top-level mystery object and { mysteries: [...] } wrapper
        if (Array.isArray(obj['mysteries'])) {
          return (obj['mysteries'] as unknown[])
            .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
            .map(m => ({ title: typeof m['title'] === 'string' ? m['title'] : undefined }));
        }
        // Direct top-level mystery object
        if (typeof obj['title'] === 'string') {
          return [{ title: obj['title'] }];
        }
        return [];
      }),
    )
  ).flat();

  return { sceneObjects, mysteryObjects };
}

// ---------------------------------------------------------------------------
// Phase 3: Matching functions
// ---------------------------------------------------------------------------
function runMatchingFunctions(
  figurePaths: string[],
  districtPaths: string[],
  landmarkAbsSubpaths: string[],
  storyPaths: string[],
  characterPaths: string[],
  sceneObjects: Array<{ district?: string; name?: string }>,
  mysteryObjects: Array<{ title?: string }>,
): {
  figures: FigureCoverageItem[],
  districts: DistrictCoverageItem[],
  landmarks: LandmarkCoverageItem[],
  stories: StoryCoverageItem[],
} {
  const figures = matchFiguresToCharacters(figurePaths, characterPaths);
  const districts = matchDistrictsToScenes(districtPaths, sceneObjects);
  const landmarks = matchLandmarksToScenes(landmarkAbsSubpaths, sceneObjects);
  const stories = matchStoriesToMysteries(storyPaths, mysteryObjects);
  return { figures, districts, landmarks, stories };
}

// ---------------------------------------------------------------------------
// Phase 4: Database enrichment
// ---------------------------------------------------------------------------
async function enrichWithDatabaseResults(
  figures: FigureCoverageItem[],
  districts: DistrictCoverageItem[],
  landmarks: LandmarkCoverageItem[],
): Promise<void> {
  try {
    const [charWithNames, sceneWithBg, dialogueTrees] = await Promise.all([
      queryOLTP<{ id: string; name: string; portrait_urls: string[] | null }>(
        'SELECT id, name, portrait_urls FROM characters',
      ),
      queryOLTP<{ id: string; name: string; background_url: string | null }>(
        'SELECT id, name, background_url FROM scenes',
      ),
      queryOLTP<{ id: string; nodes: Record<string, { speaker_id?: string }> }>(
        'SELECT id, nodes FROM dialogue_trees',
      ),
    ]);

    // Pre-compute normalized names for characters
    const normalizedChars = charWithNames.rows.map(row => ({
      ...row,
      normalizedName: normalizeName(row.name),
      lowerId: row.id.toLowerCase(),
    }));

    // Pre-compute normalized names for scenes
    const normalizedScenes = sceneWithBg.rows.map(row => ({
      ...row,
      normalizedName: normalizeName(row.name),
      lowerId: row.id.toLowerCase(),
    }));

    // Build a set of character IDs that appear as speakers in any dialogue tree
    const characterIdsWithDialogue = new Set<string>();
    for (const tree of dialogueTrees.rows) {
      if (tree.nodes && typeof tree.nodes === 'object') {
        for (const node of Object.values(tree.nodes)) {
          if (node.speaker_id) {
            characterIdsWithDialogue.add(node.speaker_id);
          }
        }
      }
    }

    // For figures: match by name similarity; set hasPortraitUrl and hasDialogue.
    for (const item of figures) {
      const lowerFigStem = item.name.toLowerCase();
      const matchingChar = normalizedChars.find(row => {
        return (
          row.normalizedName.includes(lowerFigStem) ||
          lowerFigStem.includes(row.normalizedName) ||
          row.lowerId.includes(lowerFigStem)
        );
      });
      if (matchingChar) {
        item.hasPortraitUrl =
          Array.isArray(matchingChar.portrait_urls) && matchingChar.portrait_urls.length > 0;
        item.hasDialogue = characterIdsWithDialogue.has(matchingChar.id);
      }
    }

    // For districts: match scene by name similarity; set hasBackgroundUrl if scene
    // has a non-empty background_url string.
    for (const item of districts) {
      const lowerStem = item.name.toLowerCase();
      const matchingScene = normalizedScenes.find(row => {
        return (
          row.normalizedName.includes(lowerStem) ||
          lowerStem.includes(row.normalizedName) ||
          row.lowerId.includes(lowerStem)
        );
      });
      if (matchingScene) {
        item.hasBackgroundUrl =
          typeof matchingScene.background_url === 'string' && matchingScene.background_url.length > 0;
      }
    }

    // For landmarks: use shared normalizeName for consistent matching.
    for (const item of landmarks) {
      const normalizedLandmark = normalizeName(item.name.replace(/_/g, ' '));
      const matchingScene = normalizedScenes.find(row => {
        return (
          row.normalizedName.includes(normalizedLandmark) ||
          normalizedLandmark.includes(row.normalizedName)
        );
      });
      if (matchingScene) {
        item.hasBackgroundUrl =
          typeof matchingScene.background_url === 'string' && matchingScene.background_url.length > 0;
      }
    }
  } catch (dbError: unknown) {
    // DB phase failure — log and fall back gracefully (all DB fields stay false)
    const message = dbError instanceof Error ? dbError.message : String(dbError);
    console.error('[admin-coverage] DB enrichment failed (falling back to false):', message);
    // fields are already initialised to false by the matching functions — no mutation needed.
  }
}

// ---------------------------------------------------------------------------
// Phase 5: Response assembly
// ---------------------------------------------------------------------------
function assembleResponse(
  figures: FigureCoverageItem[],
  districts: DistrictCoverageItem[],
  landmarks: LandmarkCoverageItem[],
  stories: StoryCoverageItem[],
): {
  success: true,
  data: {
    byType: {
      figures: FigureCoverageItem[],
      districts: DistrictCoverageItem[],
      landmarks: LandmarkCoverageItem[],
      stories: StoryCoverageItem[],
    },
  },
  timestamp: string,
} {
  return {
    success: true,
    data: {
      byType: {
        figures,
        districts,
        landmarks,
        stories,
      },
    },
    timestamp: new Date().toISOString(),
  };
}
