import fs from 'node:fs';
import path from 'node:path';
import jsYaml from 'js-yaml';

export async function listMdFiles(baseDir: string): Promise<string[]> {
  try {
    await fs.promises.access(baseDir);
  } catch {
    return [];
  }

  const dirents = await fs.promises.readdir(baseDir, { withFileTypes: true, recursive: true });
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

export async function listYamlFiles(baseDir: string, subdir: string): Promise<string[]> {
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

export async function parseYamlFile(absolutePath: string): Promise<unknown> {
  try {
    const content = await fs.promises.readFile(absolutePath, 'utf-8');
    return jsYaml.load(content);
  } catch {
    return null;
  }
}

export async function processFileSystem(
  loreDir: string,
  contentDir: string,
): Promise<{
  figurePaths: string[];
  districtPaths: string[];
  landmarkPaths: string[];
  storyPaths: string[];
  characterYamlPaths: string[];
  sceneYamlPaths: string[];
  mysteryYamlPaths: string[];
}> {
  const [figurePaths, districtPaths, landmarkPaths, storyPaths, characterYamlPaths, sceneYamlPaths, mysteryYamlPaths] =
    await Promise.all([
      listMdFiles(path.join(loreDir, 'figures')).then(ps => ps.map(p => `figures/${p}`)),
      listMdFiles(path.join(loreDir, 'districts')).then(ps => ps.map(p => `districts/${p}`)),
      listMdFiles(path.join(loreDir, 'landmarks')).then(ps => ps.map(p => `landmarks/${p}`)),
      listMdFiles(path.join(loreDir, 'stories')).then(ps => ps.map(p => `stories/${p}`)),
      listYamlFiles(contentDir, 'characters'),
      listYamlFiles(contentDir, 'scenes'),
      listYamlFiles(contentDir, 'mysteries'),
    ]);

  return {
    figurePaths,
    districtPaths,
    landmarkPaths,
    storyPaths,
    characterYamlPaths,
    sceneYamlPaths,
    mysteryYamlPaths,
  };
}

export async function parseYamlFiles(
  contentDir: string,
  filesData: { sceneYamlPaths: string[]; mysteryYamlPaths: string[] },
): Promise<{
  sceneObjects: Array<{ district?: string; name?: string }>;
  mysteryObjects: Array<{ title?: string }>;
}> {
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

  const mysteryObjects: Array<{ title?: string }> = (
    await Promise.all(
      filesData.mysteryYamlPaths.map(async relPath => {
        const parsed = await parseYamlFile(path.join(contentDir, relPath));
        if (!parsed || typeof parsed !== 'object') return [];
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj['mysteries'])) {
          return (obj['mysteries'] as unknown[])
            .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
            .map(m => ({ title: typeof m['title'] === 'string' ? m['title'] : undefined }));
        }
        if (typeof obj['title'] === 'string') {
          return [{ title: obj['title'] }];
        }
        return [];
      }),
    )
  ).flat();

  return { sceneObjects, mysteryObjects };
}
