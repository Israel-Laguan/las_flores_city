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

export function validateAndRepairOutline(plan: ContentPlan, description: string): ContentPlan {
  let repaired = false;
  const itemIds = new Set<string>();
  const slugCounts = new Map<string, number>();

  if (!Array.isArray(plan.items)) {
    plan.items = [];
    repaired = true;
  }

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