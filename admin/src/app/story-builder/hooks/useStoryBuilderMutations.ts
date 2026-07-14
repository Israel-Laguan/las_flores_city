import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';

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
