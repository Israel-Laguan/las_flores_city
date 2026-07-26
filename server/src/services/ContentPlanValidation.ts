import { type ContentPlan, type ContentPlanItem } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';

export function uuidv4(): string {
  return crypto.randomUUID();
}

export function slugify(name: string): string {
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
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    const lastField = parts[parts.length - 1];
    if (!current[lastField]) {
      current[lastField] = `TODO: Add ${lastField}`;
      repaired = true;
    }
  }
  return repaired;
}

export function validateAndRepairOutline(plan: ContentPlan, description: string): ContentPlan {
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
    const fallback = generateFallbackPlan(description);
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

export function generateFallbackPlan(description: string): ContentPlan {
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

export async function setStatus(planId: string, status: string, client?: import('pg').PoolClient): Promise<void> {
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

export async function updatePlanJson(planId: string, planJson: any, client?: import('pg').PoolClient): Promise<void> {
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