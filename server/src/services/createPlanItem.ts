import type { ContentPlanItem } from '@las-flores/shared';

export function createItem(partial: Partial<ContentPlanItem> & { type: string; name: string; slug: string }): ContentPlanItem {
  return {
    id: crypto.randomUUID(),
    type: partial.type as ContentPlanItem['type'],
    action: partial.action || 'create',
    name: partial.name,
    slug: partial.slug,
    fields: partial.fields || {},
    assetNeeds: partial.assetNeeds || [],
    dependsOn: partial.dependsOn || [],
  };
}
