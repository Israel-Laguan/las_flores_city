import fs from 'node:fs';
import path from 'node:path';
import * as jsYaml from 'js-yaml';

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
  storyPaths: string[];
  missionYamlPaths: string[];
}> {
  // loreDir points to the world lore root (content/lore/ via getWorldLoreDir).
  // After the lore reorganization, only `stories/` has a corresponding
  // subdirectory under content/lore/. The `figures/`, `districts/`, and
  // `landmarks/` subdirectories were removed when lore moved from docs/lore/
  // to content/lore/ — those coverage types are no longer supported.
  //
  // README/index files are index docs, not story entries — exclude them so the
  // coverage list only reports actual story lore.
  const [storyPaths, missionYamlPaths] = await Promise.all([
    listMdFiles(path.join(loreDir, 'stories')).then(ps =>
      ps
        .filter(p => !/^(?:readme|index)\.md$/i.test(p.split('/').pop() ?? ''))
        .map(p => `stories/${p}`)
    ),
    listYamlFiles(contentDir, 'missions'),
  ]);

  return {
    storyPaths,
    missionYamlPaths,
  };
}

export async function parseYamlFiles(
  contentDir: string,
  filesData: { missionYamlPaths: string[] },
): Promise<{
  missionObjects: Array<{ title?: string }>;
}> {
  const missionObjects: Array<{ title?: string }> = (
    await Promise.all(
      filesData.missionYamlPaths.map(async relPath => {
        const parsed = await parseYamlFile(path.join(contentDir, relPath));
        if (!parsed || typeof parsed !== 'object') return [];
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj['missions'])) {
          return (obj['missions'] as unknown[])
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

  return { missionObjects };
}
