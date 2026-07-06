export interface FigureCoverageItem {
  name: string;
  lorePath: string;
  hasCharacterYaml: boolean;
  hasPortraitUrl: boolean;
  hasDialogue: boolean;
}

export interface DistrictCoverageItem {
  name: string;
  lorePath: string;
  hasSceneYaml: boolean;
  hasBackgroundUrl: boolean;
}

export interface LandmarkCoverageItem {
  name: string;
  lorePath: string;
  hasSceneYaml: boolean;
  hasBackgroundUrl: boolean;
}

export interface StoryCoverageItem {
  name: string;
  lorePath: string;
  hasMysteryYaml: boolean;
}

export function figureStem(figurePath: string): string {
  const filename = figurePath.split('/').pop() ?? figurePath;
  return filename.endsWith('.md') ? filename.slice(0, -'.md'.length) : filename;
}

export function characterStem(characterPath: string): string {
  const filename = characterPath.split('/').pop() ?? characterPath;
  const withoutExt = filename.endsWith('.yaml') ? filename.slice(0, -'.yaml'.length) : filename;
  return withoutExt.startsWith('char_') ? withoutExt.slice('char_'.length) : withoutExt;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function matchFiguresToCharacters(
  figurePaths: string[],
  characterPaths: string[],
): FigureCoverageItem[] {
  const charStems = characterPaths.map(p => characterStem(p).toLowerCase());
  return figurePaths.map(lorePath => {
    const stem = figureStem(lorePath);
    const lowerStem = stem.toLowerCase();
    const hasCharacterYaml = charStems.some(cs => cs.includes(lowerStem));
    return { name: stem, lorePath, hasCharacterYaml, hasPortraitUrl: false, hasDialogue: false };
  });
}

export function matchDistrictsToScenes(
  districtPaths: string[],
  scenes: Array<{ district?: string }>,
): DistrictCoverageItem[] {
  const sceneDistricts = scenes.map(s => (s.district ?? '').toLowerCase()).filter(d => d.length > 0);
  return districtPaths.map(lorePath => {
    const stem = figureStem(lorePath);
    const lowerStem = stem.toLowerCase();
    const hasSceneYaml = sceneDistricts.includes(lowerStem);
    return { name: stem, lorePath, hasSceneYaml, hasBackgroundUrl: false };
  });
}

export function matchLandmarksToScenes(
  landmarkPaths: string[],
  scenes: Array<{ name?: string }>,
): LandmarkCoverageItem[] {
  const sceneNames = scenes.map(s => normalizeName(s.name ?? '')).filter(n => n.length > 0);
  return landmarkPaths.map(lorePath => {
    const stem = figureStem(lorePath);
    const normalizedStem = normalizeName(stem.replace(/_/g, ' '));
    const hasSceneYaml = sceneNames.some(sn => sn.includes(normalizedStem) || normalizedStem.includes(sn));
    return { name: stem, lorePath, hasSceneYaml, hasBackgroundUrl: false };
  });
}

export function matchStoriesToMysteries(
  storyPaths: string[],
  mysteries: Array<{ title?: string }>,
): StoryCoverageItem[] {
  const mysteryTitles = mysteries.map(m => normalizeName(m.title ?? '')).filter(t => t.length > 0);
  return storyPaths.map(lorePath => {
    const stem = figureStem(lorePath);
    const normalizedStem = normalizeName(stem.replace(/_/g, ' '));
    const hasMysteryYaml = mysteryTitles.some(mt => mt.includes(normalizedStem) || normalizedStem.includes(mt));
    return { name: stem, lorePath, hasMysteryYaml };
  });
}
