import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';

export interface ExistingLocation {
  id: string;
  name: string;
  district?: string;
  daytime?: string;
  nightlife?: string;
  history?: string;
}

export interface ExistingContentContext {
  characters: Array<{ id: string; name: string; role?: string; faction?: string; personality?: string; description?: string }>;
  scenes: Array<{ id: string; name: string; district: string; mood?: string; description?: string }>;
  dialogues: Array<{ id: string; name: string }>;
  missions: Array<{ id: string; title: string }>;
  stories: Array<{ id: string; title: string }>;
  overlays: Array<{ id: string; name: string }>;
  locations: ExistingLocation[];
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  estimatedCostUsd?: number;
}

export interface LLMProvider {
  parseDescription(description: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }>;
  generateOutline(description: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }>;
  refinePlan(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }>;
  generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string>;
  generateFill(prompt: string): Promise<{ fields: Record<string, string>; lore_refs?: string[] }>;
}
