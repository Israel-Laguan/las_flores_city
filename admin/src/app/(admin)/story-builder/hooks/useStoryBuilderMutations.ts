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

/** Strip the picker's `new: ` prefix from a new-variant alternative name. */
function newVariantName(alternativeName: string): string {
  return alternativeName.replace(/^new:\s*/i, '').trim() || 'Unnamed';
}

/** Schema limit for item names (mirrors ContentPlanItemSchema.name). */
const NAME_MAX_LENGTH = 100;

/**
 * File-safe slug for `name`, deduplicated against the plan's other items of the
 * same type (`${type}:${slug}` key), so a chosen variant can never collide with
 * an existing item of the same type (which would fail duplicate-slug
 * validation on the next PUT). `skipItemId` lets the caller exclude the item
 * currently being edited from the collision check.
 */
function uniqueSlug(plan: ContentPlan, type: string, name: string, skipItemId?: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'untitled';
  const taken = new Set(
    plan.items.filter(i => i.id !== skipItemId).map(i => `${i.type}:${i.slug}`),
  );
  let candidate = base;
  let counter = 2;
  while (taken.has(`${type}:${candidate}`)) {
    // Truncate the base so base + "_N" stays within the schema's 100-char slug
    // limit (otherwise the next PUT would reject the over-long slug).
    candidate = `${base.slice(0, NAME_MAX_LENGTH - String(counter).length - 1)}_${counter}`;
    counter += 1;
  }
  return candidate;
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

  if (alternative.kind === 'existing') {
    // An `existing` alternative must carry a stable id (enforced by the shared
    // discriminated union). If a malformed choice somehow lacks one, refuse to
    // act rather than silently collapsing it into a brand-new create proposal.
    if (!alternative.id) {
      throw new Error(`Existing identity alternative for "${item.name}" is missing its entity id.`);
    }
    items[index] = {
      ...item,
      entity_id: alternative.id,
      action: 'update',
      // Persist the entity's REAL canonical alias (not the picker display
      // label `a193 Marcus`), so server-side alias lookups key on the actual
      // stored spelling (e.g. `marcus`).
      resolution: {
        status: 'matched',
        entityType: item.type,
        entityId: alternative.id,
        alias: alternative.alias,
      },
    };
  } else {
    // An `exhausted` new-variant is a human-readable notice ("all variants in
    // use"), NOT a committable name. Refuse to commit it as a brand-new entity:
    // the author must reconcile the duplicates (or rename) instead.
    if (alternative.exhausted === true) {
      throw new Error(
        `Cannot create "${alternative.name}": all variants for this base name are already in use. ` +
        `Resolve the duplication or rename before creating a new entity.`,
      );
    }
    // Author chose a new variant (e.g. `new: Marcus II`) — actually commit that
    // chosen name so the selected variant is created (name + slug), not the
    // original LLM name. Bound the name to the schema limit, force the action
    // to `create` even if the ambiguous item arrived as an unverified `update`
    // (the selected variant is brand-new and must be created), and deduplicate
    // the slug against the plan so the next PUT cannot reject duplicate slugs.
    const chosenName = newVariantName(alternative.name).slice(0, NAME_MAX_LENGTH);
    items[index] = {
      ...item,
      entity_id: undefined,
      action: 'create',
      name: chosenName,
      slug: uniqueSlug(plan, item.type, chosenName, item.id),
      resolution: {
        status: 'new_candidate',
        entityType: item.type,
        suggestedName: chosenName,
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

  // Deduplicate slug against existing plan items of the same type.
  const slug = uniqueSlug(plan, entity.type, entity.name);

  const newItem: ContentPlanItem = {
    id: crypto.randomUUID(),
    type: entity.type as ContentPlanItem['type'],
    action: 'create',
    name: entity.name,
    description: entity.description ?? '',
    slug,
    fields: { description: entity.description || 'TODO: Add description' },
    assetNeeds: [],
    dependsOn: [],
  };
  return { ...plan, items: [...plan.items, newItem] };
}
