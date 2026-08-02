export interface StoryCoverageItem {
  name: string;
  lorePath: string;
  hasMissionYaml: boolean;
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

export function matchStoriesToMissions(
  storyPaths: string[],
  missions: Array<{ title?: string }>,
): StoryCoverageItem[] {
  const missionTitles = missions.map(m => normalizeName(m.title ?? '')).filter(t => t.length > 0);
  return storyPaths.map(lorePath => {
    const stem = figureStem(lorePath);
    const normalizedStem = normalizeName(stem.replace(/_/g, ' '));
    const hasMissionYaml = missionTitles.some(mt => mt.includes(normalizedStem) || normalizedStem.includes(mt));
    return { name: stem, lorePath, hasMissionYaml };
  });
}
