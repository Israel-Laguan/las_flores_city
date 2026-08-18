import { ContentPlanSchema, IntakeConflictPreviewSchema, CritiqueAnnotationSchema, CritiqueEvidenceSchema, CritiqueRelatedEntitySchema, GraphDeltaSchema, GraphDeltaEdgeSchema, type ContentPlan, type ContentPlanItem, type IntakeConflictPreview, type CritiqueAnnotation, type ChatMessage, type ConflictChatContext, type GraphDelta, type GraphDeltaEdge } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext, LLMUsage, CritiqueScopeType } from './types/LLMTypes.js';
import { buildLorePrompt, buildIntakeConflictPrompt, buildSemanticCritiquePrompt, buildChatExplainPrompt, buildChatProposePrompt } from './LLMPrompts.js';
import { finiteInt } from '../utils/env.js';
import { createLiteLLMCore, type LiteLLMCore } from './liteLLMCore.js';

export interface LiteLLMProviderOptions {
  timeoutMs?: number;
  retries?: number;
  model?: string;
}

export class LiteLLMProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private defaultTimeoutMs: number;
  private retries: number;
  private core: LiteLLMCore;

  constructor(opts?: LiteLLMProviderOptions) {
    this.baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000';
    this.apiKey = process.env.LITELLM_API_KEY || '';
    this.model = opts?.model || process.env.LLM_MODEL || 'poolside/laguna-m.1';
    this.defaultTimeoutMs = opts?.timeoutMs ?? finiteInt(process.env.LLM_TIMEOUT_MS, 60000);
    this.retries = opts?.retries ?? 2;
    this.core = createLiteLLMCore({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      defaultTimeoutMs: this.defaultTimeoutMs,
      retries: this.retries,
    });
  }

  withTimeout(timeoutMs: number): LiteLLMProvider {
    return new LiteLLMProvider({
      timeoutMs,
      retries: this.retries,
      model: this.model,
    });
  }

  private extractUsage(data: any): LLMUsage | null {
    return this.core.extractUsage(data);
  }

  private enhanceError(lastError: Error, timeoutMs: number, maxTimeoutMs: number): never {
    return this.core.enhanceError(lastError, timeoutMs, maxTimeoutMs);
  }

  private callLLM(systemPrompt: string, userMessage: string, customTimeoutMs?: number, maxTokens?: number): Promise<{ result: Record<string, unknown>; usage: LLMUsage | null }> {
    return this.core.callLLM(systemPrompt, userMessage, customTimeoutMs, maxTokens);
  }

  private callLLMText(systemPrompt: string, userMessage: string): Promise<string> {
    return this.core.callLLMText(systemPrompt, userMessage);
  }

  private callLLMMessages(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    opts?: { jsonMode?: boolean; maxTokens?: number },
  ): Promise<{ result?: Record<string, unknown>; text?: string; usage: LLMUsage | null }> {
    return this.core.callLLMMessages(systemPrompt, messages, opts);
  }

  async generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string> {
    const prompt = buildLorePrompt(item, context);
    return this.callLLMText(prompt, item.fields.description || item.name);
  }

  async generateFill(prompt: string): Promise<{ fields: Record<string, string>; lore_refs?: string[] }> {
    const { result } = await this.callLLM('You are a content writer for Las Flores 2077.', prompt);
    return {
      fields: (result.fields as Record<string, string>) || {},
      lore_refs: Array.isArray(result.lore_refs) ? result.lore_refs : [],
    };
  }

  async analyzeIntakeConflicts(plan: ContentPlan, context: ExistingContentContext): Promise<{ conflicts: IntakeConflictPreview[]; usage: LLMUsage | null }> {
    const systemPrompt = buildIntakeConflictPrompt(plan, context);
    const maxTokens = finiteInt(process.env.LLM_INTAKE_CONFLICT_MAX_TOKENS, 2048);
    const { result, usage } = await this.callLLM(systemPrompt, plan.description, undefined, maxTokens);
    // callLLM can parse valid JSON that is not an object (e.g. null or a string).
    // Treat a non-object response as an empty conflict list rather than throwing.
    const isObject = result !== null && typeof result === 'object' && !Array.isArray(result);
    const candidate = isObject
      ? (result as Record<string, unknown>).conflicts
      : undefined;
    const raw = Array.isArray(candidate) ? candidate : [];
    // Tolerate malformed entries — keep only those that pass the schema.
    const conflicts = raw
      .map((c: any) => IntakeConflictPreviewSchema.safeParse(c))
      .filter((r: any) => r.success)
      .map((r: any) => r.data);

    // Distinguish a real "no conflicts" result from a malformed/unsupported model
    // response. The intake endpoint surfaces `conflicts` to the author as
    // "N potential conflicts", so silently returning [] on a bad response would
    // show a misleading clean bill of health.
    // Gate on `result` NOT being a valid object with an array `conflicts` field
    // (rather than on `raw.length === 0`), so a legitimate `{ "conflicts": [] }`
    // clean scan does not log noise while a malformed response — whether an
    // object missing/mistyping `conflicts`, or a non-object like `null`/a string —
    // still warns.
    if (!isObject || !Array.isArray(candidate)) {
      const rawKeys = isObject ? Object.keys(result).join(',') || '(none)' : '(non-object response)';
      console.warn('[LiteLLM] Intake conflict scan returned no "conflicts" array; treating as empty (plan ' +
        `description preview: "${(plan.description || '').substring(0, 80)}", raw keys: ${rawKeys})`);
    } else if (raw.length > 0 && conflicts.length === 0) {
      console.warn('[LiteLLM] Intake conflict scan dropped all entries as malformed; treating as empty. Raw preview: ' +
        JSON.stringify(raw).substring(0, 300));
    }

    return { conflicts, usage };
  }

  /**
   * M26 — Deep semantic critique (Moment 3).
   *
   * Two-model split: `scope='entity'` runs the per-item/local scan on the default
   * (cheap) model; `scope='cross_entity'` runs the narrative/relationship audit on
   * `LLM_DEEP_MODEL` (falling back to the default model when unset).
   *
   * Parses structured `:Conflict` / `:Suggestion` annotation nodes, keeping only
   * entries that satisfy `CritiqueAnnotationSchema`. Returns empty on a malformed /
   * unsupported model response (with a diagnostic warn), never throws.
   */
  async analyzePlanForConflicts(
    plan: ContentPlan,
    context: ExistingContentContext,
    scope: CritiqueScopeType,
  ): Promise<{ annotations: CritiqueAnnotation[]; usage: LLMUsage | null }> {
    // Deep model only for the expensive cross-entity audit; per-entity stays cheap.
    // Trim so a whitespace-only env value behaves as unset (dotenv parsers can
    // return padding spaces instead of an empty string).
    const deepModel = (process.env.LLM_DEEP_MODEL || '').trim() || undefined;
    const provider = scope !== 'entity' && deepModel && deepModel !== this.model
      ? new LiteLLMProvider({ model: deepModel, timeoutMs: this.defaultTimeoutMs, retries: this.retries })
      : this;

    const systemPrompt = buildSemanticCritiquePrompt(plan, context, scope);
    const maxTokens = finiteInt(process.env.LLM_CRITIQUE_MAX_TOKENS, 4096);
    const { result, usage } = await provider.callLLM(systemPrompt, plan.description, undefined, maxTokens);

    const isObject = result !== null && typeof result === 'object' && !Array.isArray(result);
    const candidate = isObject ? result.annotations : undefined;
    const raw = Array.isArray(candidate) ? candidate : [];

    // Tolerate malformed entries — keep only those that pass the schema. The
    // schema assigns a fresh id/createdAt/status so the raw model output is only
    // the semantic fields (type, severity, description, evidence, itemIds, ...).
    // Cryptic model-supplied ids/inputHash are never trusted: a non-UUID id would
    // invalidate the node (dropping its evidence) and a non-empty inputHash would
    // break the change-detection cache, so always regenerate both.
    //
    // Sub-arrays (evidence, relatedEntities) are validated element-by-element
    // first: a single bad excerpt must not sink the whole annotation, so each
    // element is kept only if it parses, and a partial drop is warned.
    const annotations = raw
      .map((a: any) => {
        const evidenceIn = Array.isArray(a?.evidence) ? a.evidence : [];
        const relatedIn = Array.isArray(a?.relatedEntities) ? a.relatedEntities : [];
        const evidence = evidenceIn
          .map((e: any) => CritiqueEvidenceSchema.safeParse(e))
          .filter((r: any) => r.success)
          .map((r: any) => r.data);
        const relatedEntities = relatedIn
          .map((e: any) => CritiqueRelatedEntitySchema.safeParse(e))
          .filter((r: any) => r.success)
          .map((r: any) => r.data);
        const droppedEvidence = evidenceIn.length - evidence.length;
        const droppedRelated = relatedIn.length - relatedEntities.length;
        if ((droppedEvidence > 0 || droppedRelated > 0)) {
          console.warn(`[LiteLLM] Semantic critique dropped ${droppedEvidence} evidence / ${droppedRelated} relatedEntities entry/entries as malformed for an annotation (scope=${scope}).`);
        }
        return CritiqueAnnotationSchema.safeParse({
          id: crypto.randomUUID(),
          type: a?.type,
          severity: a?.severity,
          description: a?.description,
          evidence,
          relatedEntities,
          scope,
          aiModel: provider.model,
          // The model-controlled inputHash is discarded; the service always
          // stamps its own computed hash so cache keys never diverge.
          inputHash: '',
          status: 'open',
          planId: plan.id,
          itemIds: a?.itemIds ?? [],
          createdAt: new Date().toISOString(),
        });
      })
      .filter((r: any) => r.success)
      .map((r: any) => r.data);

    if (!isObject || !Array.isArray(candidate)) {
      console.warn(`[LiteLLM] Semantic critique returned no "annotations" array; treating as empty (scope=${scope}, ` +
        `plan: "${(plan.description || '').substring(0, 80)}", raw keys: ${isObject ? Object.keys(result).join(',') || '(none)' : '(non-object response)'})`);
    } else if (raw.length > 0 && annotations.length === 0) {
      console.warn('[LiteLLM] Semantic critique dropped all annotations as malformed; treating as empty. Raw preview: ' +
        JSON.stringify(raw).substring(0, 300));
    }

    return { annotations, usage };
  }

  /**
   * Resolve the model `analyzePlanForConflicts` will use for `scope` — mirrors
   * the deep-model split above so the critique cache key matches the model that
   * actually produces the annotations.
   */
  critiqueModel(scope: CritiqueScopeType): string {
    const deepModel = (process.env.LLM_DEEP_MODEL || '').trim() || undefined;
    return scope !== 'entity' && deepModel && deepModel !== this.model ? deepModel : this.model;
  }

  // ── M29 Chat: explain / propose split ─────────────────────────────────────

  /** Prose reply — no structured side-effects. */
  async chatExplain(
    planId: string,
    messages: ChatMessage[],
    context: ExistingContentContext,
    conflict?: ConflictChatContext,
    planDescription?: string,
  ): Promise<{ reply: string; usage: LLMUsage | null }> {
    const systemPrompt = buildChatExplainPrompt({ id: planId, description: planDescription }, context, conflict);
    const { text, usage } = await this.callLLMMessages(systemPrompt, messages, { jsonMode: false });
    return { reply: text ?? '', usage };
  }

  /**
   * Structured proposal — returns schema-valid `GraphDelta`s. Malformed entries
   * are dropped; if the arrays are absent (or nothing survived), exactly ONE
   * retry appends the validation errors, then warn-and-degrade to empty deltas
   * (never throws into the graph path — apply-delta revalidates before write).
   * `id`/`planId`/`createdAt` are ALWAYS stamped server-side.
   */
  async chatPropose(
    planId: string,
    messages: ChatMessage[],
    context: ExistingContentContext,
    conflict?: ConflictChatContext,
    planDescription?: string,
  ): Promise<{ reply: string; deltas: GraphDelta[]; deltaEdges: GraphDeltaEdge[]; usage: LLMUsage | null }> {
    const maxTokens = finiteInt(process.env.LLM_CHAT_MAX_TOKENS, 4096);
    let chatProposeErrors = '';
    let lastUsage: LLMUsage | null = null;

    for (let attempt = 0; attempt <= 1; attempt++) {
      let systemPrompt = buildChatProposePrompt({ id: planId, description: planDescription }, context, conflict);
      if (attempt === 1) {
        // Reject-and-refine: tell the model the exact validation failures from
        // the previous attempt (collected below).
        systemPrompt += `\n\n## Previous attempt REJECTED\nYour previous proposal was REJECTED for schema-invalid deltas. Fix these exact errors and return ONLY the corrected JSON contract:\n${chatProposeErrors}\n`;
      }

      const { result, usage } = await this.callLLMMessages(systemPrompt, messages, { jsonMode: true, maxTokens });
      lastUsage = usage;

      const isObject = result !== null && typeof result === 'object' && !Array.isArray(result);
      const deltasIn = isObject && Array.isArray((result as any).deltas) ? (result as any).deltas : [];
      const edgesIn = isObject && Array.isArray((result as any).deltaEdges) ? (result as any).deltaEdges : [];

      const deltas = deltasIn
        .map((d: any) => GraphDeltaSchema.safeParse({
          id: crypto.randomUUID(),          // NEVER trust model ids
          planId,                            // stamp the owning plan
          nodeType: d?.nodeType,
          nodeId: d?.nodeId,
          op: d?.op,
          fields: d?.fields ?? {},
          createdAt: new Date().toISOString(),
        }))
        .filter((r: any) => r.success)
        .map((r: any) => r.data);

      const deltaEdges = edgesIn
        .map((e: any) => GraphDeltaEdgeSchema.safeParse({
          planId,
          sourceNodeType: e?.sourceNodeType,
          sourceNodeId: e?.sourceNodeId,
          targetNodeType: e?.targetNodeType,
          targetNodeId: e?.targetNodeId,
          type: e?.type,
        }))
        .filter((r: any) => r.success)
        .map((r: any) => r.data);

      // Discard edges with unrecognized type before returning (validate early)
      const validEdgeTypes = ['OWNED_BY', 'SET_IN', 'SERVES', 'OVERLAYS', 'IN_DISTRICT'];
      const preFilterEdgeCount = deltaEdges.length;
      const filteredEdges = deltaEdges.filter((e: GraphDeltaEdge) => validEdgeTypes.includes(e.type));
      if (preFilterEdgeCount - filteredEdges.length > 0) {
        console.warn(`[LiteLLM] chatPropose dropped ${preFilterEdgeCount - filteredEdges.length} edge(s) with invalid type (plan=${planId}).`);
      }
      // Replace contents in-place so the rest of the loop uses filtered edges
      deltaEdges.splice(0, deltaEdges.length, ...filteredEdges);

      const droppedDeltas = deltasIn.length - deltas.length;
      const droppedEdges = edgesIn.length - deltaEdges.length;
      if (droppedDeltas > 0 || droppedEdges > 0) {
        console.warn(`[LiteLLM] chatPropose dropped ${droppedDeltas} delta(s) / ${droppedEdges} edge(s) as schema-invalid (plan=${planId}).`);
      }

      const reply = typeof (result as any)?.reply === 'string' ? (result as any).reply : '';
      const allDropped = deltasIn.length > 0 && deltas.length === 0;
      const nothingValid = deltas.length === 0;

      if (isObject && deltas.length > 0) {
        return { reply, deltas, deltaEdges, usage };
      }

      // Validation failures to feed a single refine attempt.
      chatProposeErrors = [
        !isObject || !Array.isArray((result as any)?.deltas) ? '"deltas" array is missing or not an array' : null,
        nothingValid && deltasIn.length === 0 ? '"deltas" array is empty' : null,
        allDropped ? `${droppedDeltas} delta(s) failed GraphDeltaSchema validation (nodeType/op/nodeId/fields rules)` : null,
      ].filter((x): x is string => !!x).join('; ');
      if (chatProposeErrors === '') chatProposeErrors = 'deltas are invalid';

      if (attempt === 0) continue; // exactly ONE refine retry
    }

    console.warn(`[LiteLLM] chatPropose failed after refine; degrading to empty deltas (plan=${planId}): ${chatProposeErrors}`);
    return { reply: 'Proposal generation could not produce valid deltas. Please rephrase or use explain mode.', deltas: [], deltaEdges: [], usage: lastUsage };
  }

}