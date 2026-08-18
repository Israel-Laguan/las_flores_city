import type { ContentPlan, ContentPlanItem, IntakeConflictPreview, CritiqueAnnotation, CritiqueScope, ChatMessage, ConflictChatContext, GraphDelta, GraphDeltaEdge } from '@las-flores/shared';

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
  missions: Array<{ id: string; title: string; description?: string }>;
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

/** Which scope of critique to run: per-entity (cheap) vs cross-entity (deep).
 *  Derived from the shared CritiqueScopeSchema so the union can never drift. */
export type CritiqueScopeType = CritiqueScope;

export interface LLMProvider {
  generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string>;
  generateFill(prompt: string): Promise<{ fields: Record<string, string>; lore_refs?: string[] }>;
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

  /**
   * Resolve the model that `analyzePlanForConflicts` will actually use for a
   * given scope (the deep-model split for cross-entity audits). The critique
   * cache key must include this so a model change forces a re-analyze rather
   * than returning another model's annotations.
   */
  critiqueModel(scope: CritiqueScopeType): string;

  /** M29 — conversational chat assistant (Moment 4). */
  chatExplain(
    planId: string,
    messages: ChatMessage[],
    context: ExistingContentContext,
    conflict?: ConflictChatContext,
    planDescription?: string,
  ): Promise<{ reply: string; usage: LLMUsage | null }>;

  chatPropose(
    planId: string,
    messages: ChatMessage[],
    context: ExistingContentContext,
    conflict?: ConflictChatContext,
    planDescription?: string,
  ): Promise<{ reply: string; deltas: GraphDelta[]; deltaEdges: GraphDeltaEdge[]; usage: LLMUsage | null }>;
}
