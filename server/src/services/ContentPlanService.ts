import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { glob } from 'glob';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { createLLMProvider } from './LLMService.js';
import type { LLMProvider, ExistingContentContext, LLMUsage, ExistingLocation } from './types/LLMTypes.js';
import { injectAssetNeeds } from './AssetNeedsService.js';
import { generateForPlan } from './LoreGenerator.js';
import { resolveContentDir } from './StoryBuilderLore.js';

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

    // 6. Generate lore for NEW items only (skip existing to preserve user edits)
    const existingItemIds = new Set(existingPlan.items.map(i => i.id));
    const newItems = validated.items.filter(i => !existingItemIds.has(i.id));
    if (newItems.length > 0) {
      const partialPlan: ContentPlan = {
        ...validated,
        items: newItems,
      };
      generateForPlan(partialPlan, this.provider, context).catch(err => {
        console.warn(`[ContentPlanService] Lore generation for new items in refine failed: ${err.message}`);
      });
    }

    // 7. Create a NEW plan row (versioning) instead of updating in place
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

  /**
   * Set the status of a content plan. The DB CHECK constraint validates the value.
   * Throws if the plan is not found.
   */
  static async setStatus(planId: string, status: string, client?: import('pg').PoolClient): Promise<void> {
    const exec = (text: string, params: any[]) =>
      client ? client.query<any>(text, params) : queryOLTP<any>(text, params);
    const result = await exec(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING status',
      [status, planId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }
  }

  /**
   * Update the plan_json for a content plan. Used by ContentAssetWorker
   * to persist asset-need status changes. Throws if plan not found.
   */
  static async updatePlanJson(planId: string, planJson: any, client?: import('pg').PoolClient): Promise<void> {
    const exec = (text: string, params: any[]) =>
      client ? client.query<any>(text, params) : queryOLTP<any>(text, params);
    const result = await exec(
      'UPDATE content_plans SET plan_json = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [planJson, planId]
    );
    if (result.rowCount === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }
  }

  async generateLore(item: ContentPlan['items'][number], context: ExistingContentContext): Promise<string> {
    return this.provider.generateLore(item, context);
  }

  /**
   * Return LLM usage from the most recent provider call, if the provider
   * captures it (LiteLLMProvider does; MockProvider returns null).
   */
  getLastUsage(): LLMUsage | null {
    return this.provider.getLastUsage?.() ?? null;
  }

  /**
   * Load existing location context from the file-based content store.
   * Locations are a YAML content type under content/locations/ — there is no
   * `locations` DB table — so we read them directly from disk.
   */
  async gatherLocationContext(): Promise<ExistingLocation[]> {
    const contentDir = resolveContentDir();
    try {
      const files = await glob(`${contentDir}/locations/*/*.yaml`, { absolute: true });
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

  async gatherContext(): Promise<ExistingContentContext> {
    const [characters, scenes, dialogues, missions, stories, overlays, locations] = await Promise.all([
      queryOLTP<{ id: string; name: string; role?: string; faction?: string; personality?: string; description?: string }>('SELECT id, name, metadata->>\'role\' as role, metadata->>\'faction\' as faction, metadata->>\'personality\' as personality, description FROM characters ORDER BY name ASC'),
      queryOLTP<{ id: string; name: string; district: string; mood?: string; description?: string }>(
        `SELECT s.id, s.name, COALESCE(d.name, '') AS district, s.mood, s.description
         FROM scenes s LEFT JOIN districts d ON d.id = s.district_id
         ORDER BY s.name ASC`,
      ),
      queryOLTP<{ id: string; name: string }>('SELECT id, name FROM dialogue_trees ORDER BY name ASC'),
      queryOLTP<{ id: string; title: string }>('SELECT id, title FROM mysteries ORDER BY title ASC'),
      queryOLTP<{ id: string; title: string }>('SELECT id, title FROM stories ORDER BY title ASC'),
      queryOLTP<{ id: string; name: string }>('SELECT id, name FROM dialogue_overlays ORDER BY name ASC'),
      this.gatherLocationContext(),
    ]);

    return {
      characters: characters.rows,
      scenes: scenes.rows,
      dialogues: dialogues.rows,
      missions: missions.rows,
      stories: stories.rows,
      overlays: overlays.rows,
      locations,
    };
  }
}

// Export singleton instance
export const contentPlanService = new ContentPlanService();
