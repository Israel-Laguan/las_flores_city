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

  async refinePlan(planId: string, feedback: string): Promise<ContentPlan> {
    // 1. Load existing plan from DB
    const result = await queryOLTP<{ plan_json: any; description: string }>(
      'SELECT plan_json, description FROM content_plans WHERE id = $1',
      [planId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }

    let existingPlan;
    try {
      existingPlan = ContentPlanSchema.parse(result.rows[0].plan_json);
    } catch {
      throw new Error('Stored plan failed schema validation');
    }

    // 2. Gather context
    const context = await this.gatherContext();

    // 3. Call LLM to refine
    const refinedPlan = await this.provider.refinePlan(existingPlan, feedback, context);

    // 4. Validate
    const validated = ContentPlanSchema.parse(refinedPlan);

    // 5. Save to DB with feedback log entry
    const feedbackEntry = {
      feedback,
      timestamp: new Date().toISOString(),
      planSnapshot: existingPlan,
    };

    await queryOLTP(
      `UPDATE content_plans
       SET plan_json = $1, description = $2, status = 'proposed',
           feedback_log = COALESCE(feedback_log, '[]'::jsonb) || $3::jsonb, updated_at = NOW()
       WHERE id = $4`,
      [validated, validated.description, JSON.stringify([feedbackEntry]), planId]
    );

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
