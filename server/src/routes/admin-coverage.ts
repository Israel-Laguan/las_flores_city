import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { getLoreDir } from './admin-lore.js';
import { resolveContentDir } from './admin-content.js';
import { queryOLTP } from '../database/connection.js';
import * as matchers from './admin-coverage.matchers.js';
import { processFileSystem, parseYamlFiles } from './admin-coverage.fs.js';
import { enrichWithDatabaseResults } from './admin-coverage.enrich.js';

export const adminCoverageRouter = express.Router();

adminCoverageRouter.use(authAndAdminMiddleware);

export type {
  FigureCoverageItem,
  DistrictCoverageItem,
  LandmarkCoverageItem,
  StoryCoverageItem,
} from './admin-coverage.matchers.js';
export {
  matchFiguresToCharacters,
  matchDistrictsToScenes,
  matchLandmarksToScenes,
  matchStoriesToMissions,
  figureStem,
  characterStem,
  normalizeName,
} from './admin-coverage.matchers.js';

adminCoverageRouter.get('/', async (_req, res) => {
  try {
    const loreDir = getLoreDir();
    const contentDir = resolveContentDir();
    const filesData = await processFileSystem(loreDir, contentDir);
    const parsedData = await parseYamlFiles(contentDir, filesData);
    const matchingResults = {
      figures: matchers.matchFiguresToCharacters(filesData.figurePaths, filesData.characterYamlPaths),
      districts: matchers.matchDistrictsToScenes(filesData.districtPaths, parsedData.sceneObjects),
      landmarks: matchers.matchLandmarksToScenes(filesData.landmarkPaths, parsedData.sceneObjects),
      stories: matchers.matchStoriesToMissions(filesData.storyPaths, parsedData.missionObjects),
    };
    await enrichWithDatabaseResults(matchingResults.figures, matchingResults.districts, matchingResults.landmarks);
    res.json(assembleResponse(matchingResults.figures, matchingResults.districts, matchingResults.landmarks, matchingResults.stories));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin-coverage] GET / error:', error);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() });
  }
});

function assembleResponse(
  figures: matchers.FigureCoverageItem[],
  districts: matchers.DistrictCoverageItem[],
  landmarks: matchers.LandmarkCoverageItem[],
  stories: matchers.StoryCoverageItem[],
) {
  return {
    success: true,
    data: { byType: { figures, districts, landmarks, stories } },
    timestamp: new Date().toISOString(),
  };
}

adminCoverageRouter.get('/assets', async (_req, res) => {
  try {
    const [charResult, sceneResult] = await Promise.all([
      queryOLTP<{ id: string; name: string; portrait_urls?: string[] | null }>('SELECT id, name, portrait_urls FROM characters ORDER BY name'),
      queryOLTP<{ id: string; name: string; background_url?: string | null }>('SELECT id, name, background_url FROM scenes ORDER BY name'),
    ]);

    const characters = charResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      hasPortrait: Array.isArray(row.portrait_urls) && row.portrait_urls.length > 0,
      portraitUrls: Array.isArray(row.portrait_urls) ? row.portrait_urls : [],
    }));

    const scenes = sceneResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      hasBackground: typeof row.background_url === 'string' && row.background_url.length > 0,
      backgroundUrl: typeof row.background_url === 'string' ? row.background_url : null,
    }));

    res.json({ success: true, data: { characters, scenes }, timestamp: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin-coverage] GET /assets error:', error);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() });
  }
});
