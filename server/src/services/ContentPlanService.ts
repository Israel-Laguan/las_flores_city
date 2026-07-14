import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { createLLMProvider, type LLMProvider, type ExistingContentContext } from './LLMService.js';
import { injectAssetNeeds } from './AssetNeedsService.js';
import { generateForPlan } from './LoreGenerator.js';

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

    // 5. Inject asset needs based on content type
    injectAssetNeeds(validated.items);

    // 6. Generate lore files (non-fatal - log warnings on failure)
    generateForPlan(validated, this.provider, context).catch(err => {
      console.warn(`[ContentPlanService] Lore generation failed: ${err.message}`);
    });

    return validated;
  }

  async refinePlan(planId: string, feedback: string): Promise<ContentPlan> {
    // 1. Load existing plan from DB
    const result = await queryOLTP<{ id: string; plan_json: any; description: string }>(
      'SELECT id, plan_json, description FROM content_plans WHERE id = $1',
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

    // 5. Re-inject asset needs for any new items
    injectAssetNeeds(validated.items);

    // 6. Create a NEW plan row (versioning) instead of updating in place
    const feedbackEntry = {
      feedback,
      timestamp: new Date().toISOString(),
      planSnapshot: existingPlan,
    };

    const newPlanResult = await queryOLTP<{ id: string }>(
      `INSERT INTO content_plans (description, plan_json, status, feedback_log, parent_plan_id)
       VALUES ($1, $2, 'proposed', $3::jsonb, $4)
       RETURNING id`,
      [validated.description, validated, JSON.stringify([feedbackEntry]), planId]
    );

    // Return the new plan with its new ID
    validated.id = newPlanResult.rows[0].id;
    return validated;
  }

  async gatherContext(): Promise<ExistingContentContext> {
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
