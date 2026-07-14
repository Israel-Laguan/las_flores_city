import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';

export interface ExistingContentContext {
  characters: Array<{ id: string; name: string }>;
  scenes: Array<{ id: string; name: string; district: string }>;
  dialogues: Array<{ id: string; name: string }>;
  missions: Array<{ id: string; title: string }>;
  stories: Array<{ id: string; name: string }>;
  overlays: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string; district: string }>;
}

export interface LLMProvider {
  parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan>;
  refinePlan(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<ContentPlan>;
  generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string>;
}
