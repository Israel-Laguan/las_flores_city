import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContentPlanItem } from '@las-flores/shared';
import { resolveFilePath } from './ContentSkeletonGenerator.js';
import { atomicWriteYaml } from './StoryBuilderFileWriter.js';

export function resolveContentDir(): string {
  // Use __dirname to avoid issues with process.cwd() changing based on tsx watch location
  // This file is at server/src/services/StoryBuilderLore.ts
  // From /app/server/src/services/: 
  //   ../../../content = /app/server/src/../../../content = /app/content
  const result = path.resolve(__dirname, '../../../content');
  return result;
}

/**
 * Generate placeholder lore/narrative markdown files for plan items.
 * Only creates files that don't already exist.
 * Creates files in the per-entity folder (e.g. content/characters/<slug>/<slug>.md).
 */
export async function generateLoreStubs(
  items: ContentPlanItem[],
  contentDir: string,
  fileSnapshots?: Map<string, string | null>,
): Promise<string[]> {
  const createdFiles: string[] = [];

  for (const item of items) {
    const pathsToCreate: Array<{ field: string; label: string }> = [
      { field: 'lore_path', label: 'Lore' },
      { field: 'narrative_path', label: 'Narrative' },
    ];

    for (const { field, label } of pathsToCreate) {
      const relPath = item.fields[field];
      if (!relPath || typeof relPath !== 'string') continue;

      // New per-folder layout: lore files are in the same directory as the YAML
      const yamlDir = path.dirname(resolveFilePath(item));
      const fullPath = path.join(contentDir, yamlDir, relPath);

      // Security check: ensure the resolved path is within the content directory
      if (!fullPath.startsWith(contentDir + path.sep) && fullPath !== contentDir) {
        console.warn(`[story-builder] Skipping unsafe path: ${relPath}`);
        continue;
      }

      try {
        await fs.access(fullPath);
        continue;
      } catch {
        // File doesn't exist, create it
      }

      const stub = buildLoreStub(item, label);
      await atomicWriteYaml(fullPath, stub);
      if (fileSnapshots) {
        fileSnapshots.set(fullPath, null);
      }

      createdFiles.push(`${yamlDir}/${relPath}`);
    }
  }

  return createdFiles;
}

function buildLoreStub(item: ContentPlanItem, _label: string): string {
  const name = item.name || 'Untitled';
  const description = item.fields.description || '';

  // Use a structure similar to generateLore output but marked as placeholder
  const title = item.fields.title || name;
  const age = item.fields.age || 'Unknown';
  const origin = item.fields.origin || 'Las Flores urban sprawl';
  const occupation = item.fields.occupation || item.fields.title || 'Unspecified';

  return `# ${name}

**Title (full):** ${title}
**Title (short):** ${name}, ${title}

**Description (full):**
**Age:** ${age}
**Origin:** ${origin}
**Occupation:** ${occupation}

${description || `${name} is a ${item.type} in the world of Las Flores 2077.`}

---

**Key Relationships**

| Name | Nature | Notes |
|------|--------|-------|
| Unknown | Connection | To be determined by the GM |

**Known Habit**

${name} has yet to be fully fleshed out. This is a placeholder — run lore regeneration to generate AI content, or edit manually.
`;
}
