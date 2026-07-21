import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { glob } from 'glob';
import crypto from 'node:crypto';
import { ContentPlanSchema, type ContentPlan, type ContentPlanItem } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { createLLMProvider } from './LLMService.js';
import type { LLMProvider, ExistingContentContext, LLMUsage, ExistingLocation } from './types/LLMTypes.js';
import { injectAssetNeeds } from './AssetNeedsService.js';
import { generateForPlan } from './LoreGenerator.js';
import { resolveContentDir } from './StoryBuilderLore.js';

export interface PlanWithUsage {
  plan: ContentPlan;
  usage: LLMUsage | null;
}

function uuidv4(): string {
  return crypto.randomUUID();
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
}

const TODO_FIELDS: Record<string, string[]> = {
  character: ['description', 'metadata.personality', 'title'],
  scene: ['description', 'mood'],
  location: ['description', 'history', 'daytime', 'nightlife'],
  dialogue: ['description'],
  mission: ['description'],
  overlay: ['description'],
  vault: ['description'],
  gig: ['description', 'reward'],
  shop_item: ['description'],
};

function addTodoFields(item: ContentPlanItem): void {
  const fields = TODO_FIELDS[item.type] || [];
  for (const field of fields) {
    const parts = field.split('.');
    let current: any = item.fields;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    const lastField = parts[parts.length - 1];
    if (!current[lastField] || !String(current[lastField]).startsWith('TODO:')) {
      current[lastField] = `TODO: Add ${lastField}`;
    }
  }
}

export class ContentPlanService {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider || createLLMProvider();
  }

  async parseDescription(description: string): Promise<PlanWithUsage> {
    const context = await this.gatherContext();

    const { plan: rawPlan, usage } = await this.provider.parseDescription(description, context);

    const validated = ContentPlanSchema.parse(rawPlan);

    validated.description = description;

    injectAssetNeeds(validated.items);

    generateForPlan(validated, this.provider, context).catch(err => {
      console.warn(`[ContentPlanService] Lore generation failed: ${err.message}`);
    });

    return { plan: validated, usage };
  }

  async generateOutline(description: string): Promise<PlanWithUsage> {
    const context = await this.gatherContext();

    const { plan: rawPlan, usage } = await this.provider.generateOutline(description, context);
    rawPlan.description = description;

    const validated = this.validateAndRepairOutline(rawPlan, description);

    injectAssetNeeds(validated.items);

    return { plan: validated, usage };
  }

  validateAndRepairOutline(plan: ContentPlan, description: string): ContentPlan {
    let repaired = false;
    const itemIds = new Set<string>();
    const slugCounts = new Map<string, number>();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plan.id)) {
      plan.id = uuidv4();
      repaired = true;
    }

    for (const item of plan.items) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) {
        item.id = uuidv4();
        repaired = true;
      }

      if (!item.slug || !/^[a-z0-9_]+$/.test(item.slug)) {
        item.slug = slugify(item.name);
        repaired = true;
      }

      const slugKey = `${item.type}:${item.slug}`;
      const count = slugCounts.get(slugKey) || 0;
      if (count > 0) {
        item.slug = `${item.slug}_${count}`;
        repaired = true;
      }
      slugCounts.set(slugKey, count + 1);

      if (itemIds.has(item.id)) {
        item.id = uuidv4();
        repaired = true;
      }
      itemIds.add(item.id);

      const validTypes = ['character', 'scene', 'dialogue', 'overlay', 'mission', 'story', 'shop_item', 'location', 'map_tile', 'story_beat', 'gig', 'vault'];
      if (!validTypes.includes(item.type)) {
        item.type = 'character';
        repaired = true;
      }

      const validActions = ['create', 'update'];
      if (!validActions.includes(item.action)) {
        item.action = 'create';
        repaired = true;
      }

      addTodoFields(item);
    }

    if (plan.items.length === 0) {
      const fallback = this.generateFallbackPlan(description);
      plan.items = fallback.items;
      plan._meta = {
        ...plan._meta,
        outline_source: 'fallback' as const,
        outline_repaired: false,
      };
      return plan;
    }

    plan._meta = {
      ...plan._meta,
      outline_source: plan._meta?.outline_source || 'llm' as const,
      outline_repaired: repaired,
    };

    return plan;
  }

  private generateFallbackPlan(description: string): ContentPlan {
    const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const charName = words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : 'Character';
    const locationName = words[1] ? words[1].charAt(0).toUpperCase() + words[1].slice(1) : 'Location';

    return {
      id: uuidv4(),
      description: `Fallback plan for: ${description.substring(0, 100)}`,
      items: [
        {
          id: uuidv4(),
          type: 'character',
          action: 'create',
          name: charName,
          description: `A character mentioned in: ${description.substring(0, 50)}`,
          slug: slugify(charName),
          fields: {
            name: charName,
            description: 'TODO: Add description',
            title: 'TODO: Add title',
            metadata: {
              type: 'human',
              role: 'npc',
              faction: 'TODO: Add faction',
              personality: 'TODO: Add personality',
            },
          },
          assetNeeds: [],
          dependsOn: [],
        },
        {
          id: uuidv4(),
          type: 'scene',
          action: 'create',
          name: `${locationName} Scene`,
          description: `A scene at: ${description.substring(0, 50)}`,
          slug: slugify(locationName),
          fields: {
            name: `${locationName} Scene`,
            description: 'TODO: Add description',
            district: 'TODO: Add district',
            mood: 'TODO: Add mood',
          },
          assetNeeds: [],
          dependsOn: [],
        },
      ],
      links: [],
      status: 'draft',
      _meta: {
        outline_source: 'fallback' as const,
        outline_repaired: false,
      },
    };
  }

  async refinePlan(planId: string, feedback: string): Promise<PlanWithUsage> {
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

    // 3. Call LLM to refine — returns plan + usage directly, no shared state
    const { plan: rawRefined, usage } = await this.provider.refinePlan(existingPlan, feedback, context);

    // 4. Validate
    const validated = ContentPlanSchema.parse(rawRefined);

    // 6. Re-inject asset needs for any new items
    injectAssetNeeds(validated.items);

    // 7. Generate lore for NEW items only (skip existing to preserve user edits)
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

    // 8. Create a NEW plan row (versioning) instead of updating in place
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
    return { plan: validated, usage };
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
