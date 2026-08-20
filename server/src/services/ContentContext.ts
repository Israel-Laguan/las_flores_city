import fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import { queryContent } from '@las-flores/infra';
import { resolveContentDir } from './StoryBuilderLore.js';
import type { ExistingContentContext, ExistingLocation } from './types/LLMTypes.js';

/**
 * Build the existing-content grounding context used by LLM authoring passes.
 *
 * Isolated in its own module (depending only on `queryContent` and the
 * file-based content reader) so both `ContentPlanService` and the
 * `LLMProvider` implementations can reuse it without forming an import cycle
 * (provider → ContentPlanService → LLMService → provider). All DB reads here
 * are content-entity reads, so the dedicated read-only content pool is used
 * (per AGENTS.md database/cache patterns) rather than the gameplay OLTP pool.
 */
export async function gatherExistingContentContext(): Promise<ExistingContentContext> {
  const [characters, scenes, dialogues, missions, overlays, locations] = await Promise.all([
    queryContent<{ id: string; name: string; role?: string; faction?: string; personality?: string; description?: string }>('SELECT id, name, metadata->>\'role\' as role, metadata->>\'faction\' as faction, metadata->>\'personality\' as personality, description FROM characters ORDER BY name ASC'),
    queryContent<{ id: string; name: string; district: string; mood?: string; description?: string }>(
      `SELECT s.id, s.name, COALESCE(d.name, '') AS district, s.mood, s.description
       FROM scenes s LEFT JOIN districts d ON d.id = s.district_id
       ORDER BY s.name ASC`,
    ),
    queryContent<{ id: string; name: string }>('SELECT id, name FROM dialogue_trees ORDER BY name ASC'),
    queryContent<{ id: string; title: string; description?: string }>('SELECT id, title, description FROM mysteries ORDER BY title ASC'),
    queryContent<{ id: string; name: string }>('SELECT id, name FROM dialogue_overlays ORDER BY name ASC'),
    gatherLocationContext(),
  ]);

  return {
    characters: characters.rows,
    scenes: scenes.rows,
    dialogues: dialogues.rows,
    missions: missions.rows,
    overlays: overlays.rows,
    locations,
  };
}

/**
 * Load existing location context from the file-based content store.
 * Locations are a YAML content type under content/districts/<district>/locations/
 * — there is no `locations` DB table — so we read them directly from disk
 * (mirrors ContentPlanService.gatherLocationContext).
 */
async function gatherLocationContext(): Promise<ExistingLocation[]> {
  const contentDir = resolveContentDir();
  try {
    const files = await glob(`${contentDir}/districts/*/locations/*/*.yaml`, { absolute: true });
    const out: ExistingLocation[] = [];
    for (const file of files) {
      try {
        const raw = await fs.readFile(file, 'utf-8');
        const data: any = yaml.load(raw);
        if (!data || typeof data !== 'object' || !data.id) continue;
        out.push({
          id: String(data.id),
          name: String(data.name ?? ''),
          district: data.district ? String(data.district) : '',
          daytime: data.daytime ? String(data.daytime) : undefined,
          nightlife: data.nightlife ? String(data.nightlife) : undefined,
          history: data.history ? String(data.history) : undefined,
        });
      } catch {
        // skip files that fail to parse
      }
    }
    return out;
  } catch {
    return [];
  }
}
