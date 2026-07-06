import { queryOLTP } from '../database/connection.js';
import { normalizeName } from './admin-coverage.matchers.js';
import type { FigureCoverageItem, DistrictCoverageItem, LandmarkCoverageItem } from './admin-coverage.matchers.js';

function buildNormalizedChars(
  charWithNames: { rows: Array<{ id: string; name: string; portrait_urls?: string[] | null }> },
) {
  return charWithNames.rows.map(row => ({
    ...row,
    normalizedName: normalizeName(row.name),
    lowerId: row.id.toLowerCase(),
  }));
}

function buildNormalizedScenes(
  sceneWithBg: { rows: Array<{ id: string; name: string; background_url?: string | null }> },
) {
  return sceneWithBg.rows.map(row => ({
    ...row,
    normalizedName: normalizeName(row.name),
    lowerId: row.id.toLowerCase(),
  }));
}

function buildDialogueIdSet(
  dialogueTrees: { rows: Array<{ nodes?: Record<string, { speaker_id?: string }> }> },
) {
  const characterIdsWithDialogue = new Set<string>();
  for (const tree of dialogueTrees.rows) {
    if (tree.nodes && typeof tree.nodes === 'object') {
      for (const node of Object.values(tree.nodes)) {
        if (node?.speaker_id) {
          characterIdsWithDialogue.add(node.speaker_id);
        }
      }
    }
  }
  return characterIdsWithDialogue;
}

function enrichFigures(
  figures: FigureCoverageItem[],
  normalizedChars: Array<any>,
  characterIdsWithDialogue: Set<string>,
) {
  for (const item of figures) {
    const lowerFigStem = item.name.toLowerCase();
    const matchingChar = normalizedChars.find(row => (
      row.normalizedName.includes(lowerFigStem) ||
      lowerFigStem.includes(row.normalizedName) ||
      row.lowerId.includes(lowerFigStem)
    ));
    if (matchingChar) {
      item.hasPortraitUrl = Array.isArray(matchingChar.portrait_urls) && matchingChar.portrait_urls.length > 0;
      item.hasDialogue = characterIdsWithDialogue.has(matchingChar.id);
    }
  }
}

function enrichDistricts(districts: DistrictCoverageItem[], normalizedScenes: Array<any>) {
  for (const item of districts) {
    const lowerStem = item.name.toLowerCase();
    const matchingScene = normalizedScenes.find(row => (
      row.normalizedName.includes(lowerStem) ||
      lowerStem.includes(row.normalizedName) ||
      row.lowerId.includes(lowerStem)
    ));
    if (matchingScene) {
      item.hasBackgroundUrl = typeof matchingScene.background_url === 'string' && matchingScene.background_url.length > 0;
    }
  }
}

function enrichLandmarks(landmarks: LandmarkCoverageItem[], normalizedScenes: Array<any>) {
  for (const item of landmarks) {
    const normalizedLandmark = normalizeName(item.name.replace(/_/g, ' '));
    const matchingScene = normalizedScenes.find(row => (
      row.normalizedName.includes(normalizedLandmark) ||
      normalizedLandmark.includes(row.normalizedName)
    ));
    if (matchingScene) {
      item.hasBackgroundUrl = typeof matchingScene.background_url === 'string' && matchingScene.background_url.length > 0;
    }
  }
}

export async function enrichWithDatabaseResults(
  figures: FigureCoverageItem[],
  districts: DistrictCoverageItem[],
  landmarks: LandmarkCoverageItem[],
): Promise<void> {
  try {
    const [charWithNames, sceneWithBg, dialogueTrees] = await Promise.all([
      queryOLTP<{ id: string; name: string; portrait_urls?: string[] | null }>('SELECT id, name, portrait_urls FROM characters'),
      queryOLTP<{ id: string; name: string; background_url?: string | null }>('SELECT id, name, background_url FROM scenes'),
      queryOLTP<{ id: string; name: string; nodes?: Record<string, { speaker_id?: string }> }>('SELECT id, nodes FROM dialogue_trees'),
    ]);

    const normalizedChars = buildNormalizedChars(charWithNames);
    const normalizedScenes = buildNormalizedScenes(sceneWithBg);
    const characterIdsWithDialogue = buildDialogueIdSet(dialogueTrees);
    enrichFigures(figures, normalizedChars, characterIdsWithDialogue);
    enrichDistricts(districts, normalizedScenes);
    enrichLandmarks(landmarks, normalizedScenes);
  } catch (dbError: unknown) {
    const message = dbError instanceof Error ? dbError.message : String(dbError);
    console.error('[admin-coverage] DB enrichment failed (falling back to false):', message);
  }
}
