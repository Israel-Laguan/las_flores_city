import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { createLLMProvider, type LLMProvider, type ExistingContentContext } from './LLMService.js';

export class ContentPlanService {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider || createLLMProvider();
  }

  async parseDescription(description: string): Promise<ContentPlan> {
    // 1. Gather existing content context
    const context = await this.gatherContext();

    // 2. Call LLM provider
    const plan = await this.provider.parseDescription(description, context);

    // 3. Validate against schema
    const validated = ContentPlanSchema.parse(plan);

    // 4. Ensure description matches input
    validated.description = description;

    return validated;
  }

  private async gatherContext(): Promise<ExistingContentContext> {
    const [characters, scenes, dialogues, missions, stories, overlays, locations] = await Promise.all([
      queryOLTP<{ id: string; name: string }>('SELECT id, name FROM characters ORDER BY name ASC'),
      queryOLTP<{ id: string; name: string; district: string }>('SELECT id, name, district FROM scenes ORDER BY name ASC'),
      queryOLTP<{ id: string; name: string }>('SELECT id, name FROM dialogue_trees ORDER BY name ASC'),
      queryOLTP<{ id: string; title: string }>('SELECT id, title FROM mysteries ORDER BY title ASC'),
      queryOLTP<{ id: string; name: string }>('SELECT id, name FROM stories ORDER BY name ASC'),
      queryOLTP<{ id: string; name: string }>('SELECT id, name FROM overlays ORDER BY name ASC'),
      queryOLTP<{ id: string; name: string; district: string }>('SELECT id, name, district FROM locations ORDER BY name ASC'),
    ]);

    return {
      characters: characters.rows,
      scenes: scenes.rows,
      dialogues: dialogues.rows,
      missions: missions.rows,
      stories: stories.rows,
      overlays: overlays.rows,
      locations: locations.rows,
    };
  }
}

// Export singleton instance
export const contentPlanService = new ContentPlanService();
