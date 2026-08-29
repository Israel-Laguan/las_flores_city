import { type ContentPlan, type ContentPlanItem, uuidv4 } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { createLLMProvider } from './LLMService.js';
import type { LLMProvider, ExistingContentContext, LLMUsage } from './types/LLMTypes.js';
import type { IntakeConflictPreview } from '@las-flores/shared';
import { gatherLocationContext } from './ContentContext.js';
import { identityResolver } from './IdentityResolver.js';

export interface PlanWithUsage {
  plan: ContentPlan;
  usage: LLMUsage | null;
}

export class ContentPlanService {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider || createLLMProvider();
  }

  validateAndRepairOutline(plan: ContentPlan, description: string): ContentPlan {
    return validateAndRepairOutlineImpl(plan, description);
  }

  private generateFallbackPlan(description: string): ContentPlan {
    return generateFallbackPlanImpl(description);
  }

  async generateLore(item: ContentPlan['items'][number], context: ExistingContentContext): Promise<string> {
    return this.provider.generateLore(item, context);
  }

  /**
   * Surface-level LLM conflict preview (Moment 1). Reuses `gatherContext()`
   * to build the `ExistingContentContext` — no new data plumbing. Advisory only.
   */
  async analyzeIntakeConflicts(plan: ContentPlan): Promise<{ conflicts: IntakeConflictPreview[]; usage: LLMUsage | null }> {
    const context = await this.gatherContext();
    return this.provider.analyzeIntakeConflicts(plan, context);
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

  async gatherContext(): Promise<ExistingContentContext> {
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

  /**
   * M25 — the dedicated, deterministic identity-resolution pass. Runs after the
   * LLM outline so a name is never silently merged: `IdentityResolver` returns
   * `matched` / `new_candidate` / `ambiguous` per item. Ambiguous items keep
   * `resolution.status === 'ambiguous'` so the admin can pick; a summary count
   * is surfaced on `_meta.identity_summary`.
   */
  private async attachIdentityResolutions(plan: ContentPlan): Promise<void> {
    let resolved: ContentPlan;
    try {
      resolved = await identityResolver.resolvePlanItems(plan);
    } catch (err) {
      // Fail closed (matching prior behavior — an identity failure must not
      // silently ship an un-resolved outline), but name the pass so the admin
      // error is diagnosable instead of a bare DB/Filesystem rejection.
      throw new Error(`Identity resolution pass failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    plan.items = resolved.items;

    let matched = 0;
    let ambiguous = 0;
    let newCandidates = 0;
    for (const item of resolved.items) {
      if (item.resolution?.status === 'matched') matched += 1;
      else if (item.resolution?.status === 'ambiguous') ambiguous += 1;
      // Only genuine new candidates count; items with no resolution status are
      // pre-existing/identity-stable `update` references, not new entities.
      else if (item.resolution?.status === 'new_candidate') newCandidates += 1;
    }
    plan._meta = {
      ...plan._meta,
      identity_summary: { matched, newCandidates, ambiguous },
    };
  }
}

// Export singleton instance
export const contentPlanService = new ContentPlanService();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_$/g, '') || 'untitled';
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

function addTodoFields(item: ContentPlanItem): boolean {
  const fields = TODO_FIELDS[item.type] || [];
  let repaired = false;
  if (!item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields)) {
    item.fields = {};
    repaired = true;
  }
  for (const field of fields) {
    const parts = field.split('.');
    let current: any = item.fields;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const existing = current[part];
      // Guard against a truthy non-object intermediate (e.g. fields.metadata is
      // a string): replace it with an object rather than descending into a
      // primitive and throwing on `current[part] = {}`.
      if (
        !existing ||
        typeof existing !== 'object' ||
        Array.isArray(existing) ||
        Array.isArray(current) ||
        typeof current !== 'object'
      ) {
        current[part] = {};
      }
      current = current[part];
    }
    const lastField = parts[parts.length - 1];
    if (!current[lastField]) {
      current[lastField] = `TODO: Add ${lastField}`;
      repaired = true;
    }
  }
  return repaired;
}

export function validateAndRepairOutlineImpl(plan: ContentPlan, description: string): ContentPlan {
  let repaired = false;
  const itemIds = new Set<string>();
  const slugCounts = new Map<string, number>();
  const oldToNewIds = new Map<string, string>();

  if (!Array.isArray(plan.items)) {
    plan.items = [];
    repaired = true;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plan.id)) {
    plan.id = uuidv4();
    repaired = true;
  }

  for (const item of plan.items) {
    // Normalize type first so it participates in slug collision detection
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

    // Repair invalid ID and track old-to-new mapping
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) {
      const oldId = item.id;
      item.id = uuidv4();
      if (oldId) oldToNewIds.set(oldId, item.id);
      repaired = true;
    }

    // Deduplicate IDs — do NOT add to oldToNewIds here because the first
    // occurrence's ID is the canonical one. Adding the duplicate's old ID
    // (which matches the first item's ID) would overwrite the first item's
    // mapping and redirect dependsOn/links references to the wrong item.
    if (itemIds.has(item.id)) {
      item.id = uuidv4();
      repaired = true;
    }
    itemIds.add(item.id);

    if (!item.slug || !/^[a-z0-9_]+$/.test(item.slug)) {
      item.slug = slugify(item.name);
      repaired = true;
    }

    // Collision-safe slug deduplication
    const slugKey = `${item.type}:${item.slug}`;
    let candidateSlug = item.slug;
    let counter = slugCounts.get(slugKey) || 0;
    if (counter > 0) {
      while (slugCounts.has(`${item.type}:${candidateSlug}`)) {
        candidateSlug = `${item.slug}_${counter}`;
        counter++;
      }
      item.slug = candidateSlug;
      repaired = true;
    }
    slugCounts.set(`${item.type}:${item.slug}`, (slugCounts.get(`${item.type}:${item.slug}`) || 0) + 1);

    if (addTodoFields(item)) {
      repaired = true;
    }
  }

  // Update dependsOn and links references after all ID repairs
  if (oldToNewIds.size > 0) {
    for (const item of plan.items) {
      if (item.dependsOn) {
        item.dependsOn = item.dependsOn.map(id => oldToNewIds.get(id) || id);
      }
    }
    if (plan.links) {
      plan.links = plan.links.map(link => ({
        ...link,
        fromItem: oldToNewIds.get(link.fromItem) || link.fromItem,
        toItem: oldToNewIds.get(link.toItem) || link.toItem,
      }));
    }
  }

  if (plan.items.length === 0) {
    const fallback = generateFallbackPlanImpl(description);
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

export function generateFallbackPlanImpl(description: string): ContentPlan {
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
