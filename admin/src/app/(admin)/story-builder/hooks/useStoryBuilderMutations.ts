import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import type { ResolutionAlternative } from '@las-flores/shared';

export function updateItemField(plan: ContentPlan, index: number, fieldPath: string, value: string): ContentPlan {
  const items = [...plan.items];
  const item = { ...items[index] };
  const fields = { ...item.fields };

  const parts = fieldPath.split('.');
  let current: any = fields;
  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = { ...(current[parts[i]] || {}) };
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;

  items[index] = { ...item, fields };
  return { ...plan, items };
}

/**
 * M25 — resolve an ambiguous identity by explicit author choice. Resolving to
 * an existing entity marks the item `update` with a stable `entity_id`; choosing
 * the new-variant alternative commits the item as a fresh `create`. In both
 * cases `resolution` is collapsed to the resolved status so it leaves the picker.
 */
export function resolveItemIdentity(
  plan: ContentPlan,
  index: number,
  alternative: ResolutionAlternative,
): ContentPlan {
  const items = [...plan.items];
  const item = { ...items[index] };

  if (alternative.kind === 'existing' && alternative.id) {
    items[index] = {
      ...item,
      entity_id: alternative.id,
      action: 'update',
      // Preserve the concrete matched identity instead of the ambiguous dispatch.
      resolution: {
        status: 'matched',
        entityType: item.type,
        entityId: alternative.id,
        alias: alternative.name,
      },
    };
  } else {
    // Author chose a new variant — keep it a create proposal, drop ambiguity.
    items[index] = {
      ...item,
      resolution: {
        status: 'new_candidate',
        entityType: item.type,
        suggestedName: item.name,
      },
    };
  }

  return { ...plan, items };
}

export function updateItemDependsOn(plan: ContentPlan, index: number, dependsOn: string[]): ContentPlan {
  const items = [...plan.items];
  items[index] = { ...items[index], dependsOn };
  return { ...plan, items };
}

export function addLink(plan: ContentPlan): ContentPlan {
  if (plan.items.length < 2) return plan;
  const newLink = {
    fromItem: plan.items[0].id,
    toItem: plan.items[1].id,
    field: '',
    action: 'add' as const,
  };
  return { ...plan, links: [...plan.links, newLink] };
}

export function updateLink(plan: ContentPlan, index: number, field: string, value: string): ContentPlan {
  const links = [...plan.links];
  if (!links[index]) return plan;
  links[index] = { ...links[index], [field]: value };
  return { ...plan, links };
}

export function removeLink(plan: ContentPlan, index: number): ContentPlan {
  return { ...plan, links: plan.links.filter((_, i) => i !== index) };
}

export function removeItem(plan: ContentPlan, index: number): ContentPlan {
  const removedId = plan.items[index].id;
  const items = plan.items
    .filter((_, i) => i !== index)
    .map(item => ({
      ...item,
      dependsOn: item.dependsOn.filter(id => id !== removedId),
    }));
  const links = plan.links.filter(
    link => link.fromItem !== removedId && link.toItem !== removedId
  );
  return { ...plan, items, links };
}

export function removeAssetPath(plan: ContentPlan, index: number, key: string): ContentPlan {
  const items = [...plan.items];
  const item = { ...items[index] };
  const fields = { ...item.fields };
  const assetPaths = { ...(fields.asset_paths || {}) };
  delete assetPaths[key];
  fields.asset_paths = assetPaths;
  items[index] = { ...item, fields };
  return { ...plan, items };
}

export function addItem(plan: ContentPlan): ContentPlan {
  const newItem: ContentPlanItem = {
    id: crypto.randomUUID(),
    type: 'character' as const,
    action: 'create' as const,
    name: '',
    description: '',
    slug: '',
    fields: {},
    assetNeeds: [],
    dependsOn: [],
  };
  return { ...plan, items: [...plan.items, newItem] };
}

const VALID_CONTENT_TYPES = new Set([
  'character', 'dialogue', 'overlay', 'scene', 'gig', 'vault',
  'mission', 'story', 'shop_item', 'location', 'map_tile', 'story_beat',
]);

export function addItemFromRoster(
  plan: ContentPlan,
  entity: { name: string; type: string; description?: string },
): ContentPlan {
  if (!VALID_CONTENT_TYPES.has(entity.type)) {
    throw new Error(`Unsupported roster type: "${entity.type}". Supported types: ${[...VALID_CONTENT_TYPES].join(', ')}`);
  }

  // Deduplicate slug by appending a numeric suffix if needed
  let slug = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const existingSlugs = new Set(plan.items.map(i => `${i.type}:${i.slug}`));
  let candidateSlug = slug;
  let counter = 2;
  while (existingSlugs.has(`${entity.type}:${candidateSlug}`)) {
    candidateSlug = `${slug}_${counter}`;
    counter++;
  }

  const newItem: ContentPlanItem = {
    id: crypto.randomUUID(),
    type: entity.type as ContentPlanItem['type'],
    action: 'create',
    name: entity.name,
    description: entity.description ?? '',
    slug: candidateSlug,
    fields: { description: entity.description || 'TODO: Add description' },
    assetNeeds: [],
    dependsOn: [],
  };
  return { ...plan, items: [...plan.items, newItem] };
}
