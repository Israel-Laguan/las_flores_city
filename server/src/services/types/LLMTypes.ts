import type { ContentPlan, ContentPlanItem, IntakeConflictPreview, CritiqueAnnotation } from '@las-flores/shared';
import type { EntityCandidate } from '../OutlineChunking.js';

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

/** Which scope of critique to run: per-entity (cheap) vs cross-entity (deep). */
export type CritiqueScopeType = 'entity' | 'cross_entity' | 'cross_mission';

export interface LLMProvider {
  parseDescription(description: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }>;
  generateOutline(description: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }>;
  refinePlan(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }>;
  refinePlanItems(selectedItems: ContentPlanItem[], fullPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<{ items: ContentPlanItem[]; usage: LLMUsage | null }>;
  generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string>;
  generateFill(prompt: string): Promise<{ fields: Record<string, string>; lore_refs?: string[] }>;
  extractEntities(systemPrompt: string, chunk: string): Promise<{ entities: EntityCandidate[] }>;
  analyzeIntakeConflicts(plan: ContentPlan, context: ExistingContentContext): Promise<{ conflicts: IntakeConflictPreview[]; usage: LLMUsage | null }>;

  /**
   * M26 — Deep semantic critique (Moment 3).
   *
   * Scans a plan for narrative contradictions and authoring suggestions within a
   * bounded scope. Returns structured annotation nodes (`:Conflict` / `:Suggestion`)
   * with evidence text excerpts.
   *
   * Two-model split:
   *   - `scope = 'entity'` (cheap model): per-item scan for local contradictions.
   *   - `scope = 'cross_entity'` (deep model): cross-item/cross-mission scan
   *     for narrative arc, timeline, and relationship consistency.
   */
  analyzePlanForConflicts(
    plan: ContentPlan,
    context: ExistingContentContext,
    scope: CritiqueScopeType,
  ): Promise<{ annotations: CritiqueAnnotation[]; usage: LLMUsage | null }>;
}
