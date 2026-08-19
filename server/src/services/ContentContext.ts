import { queryOLTP } from '@las-flores/infra';
import type { ExistingContentContext } from './types/LLMTypes.js';

/**
 * Build the existing-content grounding context used by LLM authoring passes.
 *
 * Isolated in its own module (only depending on `queryOLTP`) so both
 * `ContentPlanService` and the `LLMProvider` implementations can reuse it
 * without forming an import cycle (provider → ContentPlanService →
 * LLMService → provider).
 */
export async function gatherExistingContentContext(): Promise<ExistingContentContext> {
  const [characters, scenes, dialogues, missions, overlays, locations] = await Promise.all([
    queryOLTP<{ id: string; name: string; role?: string; faction?: string; personality?: string; description?: string }>('SELECT id, name, metadata->>\'role\' as role, metadata->>\'faction\' as faction, metadata->>\'personality\' as personality, description FROM characters ORDER BY name ASC'),
    queryOLTP<{ id: string; name: string; district: string; mood?: string; description?: string }>(
      `SELECT s.id, s.name, COALESCE(d.name, '') AS district, s.mood, s.description
       FROM scenes s LEFT JOIN districts d ON d.id = s.district_id
       ORDER BY s.name ASC`,
    ),
    queryOLTP<{ id: string; name: string }>('SELECT id, name FROM dialogue_trees ORDER BY name ASC'),
    queryOLTP<{ id: string; title: string; description?: string }>('SELECT id, title, description FROM mysteries ORDER BY title ASC'),
    queryOLTP<{ id: string; name: string }>('SELECT id, name FROM dialogue_overlays ORDER BY name ASC'),
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

async function gatherLocationContext(): Promise<ExistingContentContext['locations']> {
  const rows = await queryOLTP<{ id: string; name: string; district?: string; daytime?: string; nightlife?: string; history?: string }>(
    'SELECT id, name, district, daytime, nightlife, history FROM locations ORDER BY name ASC',
  );
  return rows.rows;
}
