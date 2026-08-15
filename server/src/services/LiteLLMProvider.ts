import { ContentPlanSchema, IntakeConflictPreviewSchema, CritiqueAnnotationSchema, CritiqueEvidenceSchema, CritiqueRelatedEntitySchema, type ContentPlan, type ContentPlanItem, type IntakeConflictPreview, type CritiqueAnnotation } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext, LLMUsage, CritiqueScopeType } from './types/LLMTypes.js';
import type { EntityCandidate } from './OutlineChunking.js';
import { buildLorePrompt, buildRefinementPrompt, buildItemScopedRefinementPrompt, buildSystemPrompt, buildOutlinePrompt, buildIntakeConflictPrompt, buildSemanticCritiquePrompt } from './LLMPrompts.js';
import { estimateCost } from './LLMCostEstimator.js';
import { finiteInt } from '../utils/env.js';

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

  constructor(opts?: LiteLLMProviderOptions) {
    this.baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000';
    this.apiKey = process.env.LITELLM_API_KEY || '';
    this.model = opts?.model || process.env.LLM_MODEL || 'poolside/laguna-m.1';
    this.defaultTimeoutMs = opts?.timeoutMs ?? finiteInt(process.env.LLM_TIMEOUT_MS, 60000);
    this.retries = opts?.retries ?? 2;
  }

  withTimeout(timeoutMs: number): LiteLLMProvider {
    return new LiteLLMProvider({
      timeoutMs,
      retries: this.retries,
      model: this.model,
    });
  }

  private extractUsage(data: any): LLMUsage | null {
    const usage = data?.usage;
    if (usage && typeof usage.total_tokens === 'number') {
      return {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens,
        model: this.model,
        estimatedCostUsd: estimateCost(this.model, usage),
      };
    }
    return null;
  }

  private enhanceError(lastError: Error, timeoutMs: number, maxTimeoutMs: number): never {
    const baseMsg = `LiteLLM call failed after ${this.retries + 1} attempts`;
    if (lastError.name === 'TimeoutError' || lastError.message?.includes('timeout')) {
      const enhancedError = new Error(
        `${baseMsg}: Connection to ${this.baseUrl} timed out. ` +
        `Model: ${this.model}, current timeout: ${timeoutMs}ms, max: ${maxTimeoutMs}ms. ` +
        `Check if LiteLLM is running and reachable from this container. ` +
        `Test with: wget -qO- ${this.baseUrl}/health`
      );
      (enhancedError as any).cause = lastError;
      (enhancedError as any).model = this.model;
      (enhancedError as any).baseUrl = this.baseUrl;
      (enhancedError as any).timeoutMs = timeoutMs;
      throw enhancedError;
    }
    if (lastError.message?.includes('fetch failed') || lastError.message?.includes('Failed to fetch')) {
      const enhancedError = new Error(
        `${baseMsg}: Cannot reach LiteLLM at ${this.baseUrl}. ` +
        `Check container networking, DNS resolution, and that LiteLLM is running. ` +
        `With Podman rootless, host.containers.internal may not resolve without aardvark-dns. ` +
        `Try using the host's IP address directly.`
      );
      (enhancedError as any).cause = lastError;
      (enhancedError as any).baseUrl = this.baseUrl;
      throw enhancedError;
    }
    throw lastError;
  }

  private async callLLM(systemPrompt: string, userMessage: string, customTimeoutMs?: number, maxTokens?: number): Promise<{ result: Record<string, unknown>; usage: LLMUsage | null }> {
    const timeoutMs = customTimeoutMs ?? this.defaultTimeoutMs;
    const maxTimeoutMs = finiteInt(process.env.LLM_MAX_TIMEOUT_MS, 300000);
    let lastError: Error | null = null;
    let attemptTimeoutMs = timeoutMs;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
          console.log(`[LiteLLM] Retry ${attempt}/${this.retries} after ${delay}ms, timeout: ${attemptTimeoutMs}ms`);
          await new Promise(r => setTimeout(r, delay));
          attemptTimeoutMs = Math.min(attemptTimeoutMs * 2, maxTimeoutMs);
        }
        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' },
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
          }),
          signal: AbortSignal.timeout(attemptTimeoutMs),
        });

        if (!response.ok) {
          const text = await response.text();
          const errorMsg = `LiteLLM request failed: ${response.status} ${response.statusText} — ${text}`;
          const isRetryable = response.status === 429 || response.status >= 500;
          if (!isRetryable) {
            const nonRetryableError = new Error(errorMsg);
            (nonRetryableError as any).isRetryable = false;
            throw nonRetryableError;
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();
        const usage = this.extractUsage(data);

        const finishReason = data.choices?.[0]?.finish_reason;
        if (finishReason === 'length') {
          // The max-token cap is call-specific (e.g. outline vs intake conflict
          // scan), so avoid naming a single env var that may not govern this call.
          const truncError = new Error(
            `LLM output truncated (finish_reason=length, max_tokens=${maxTokens}). ` +
            `Consider increasing the max token limit for this call or reducing input size.`
          );
          (truncError as any).isRetryable = false;
          throw truncError;
        }

        const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.message?.reasoning_content;
        if (!content) {
          throw new Error('LiteLLM response did not contain any message content.');
        }
        const fenceMatch = content.match(/```(?:json|JSON)\s*\n?([\s\S]*?)```/);
        const cleanedContent = fenceMatch ? fenceMatch[1].trim() : content.trim();
        try {
          return { result: JSON.parse(cleanedContent), usage };
        } catch (e) {
          throw new Error(`LiteLLM returned invalid JSON: ${(e as Error).message}. Content preview: ${cleanedContent.substring(0, 200)}`);
        }
      } catch (err: any) {
        if (err.isRetryable === false) {
          throw err;
        }
        lastError = err;
        if (attempt === this.retries) break;
      }
    }
    this.enhanceError(lastError!, timeoutMs, maxTimeoutMs);
  }

  private async callLLMText(systemPrompt: string, userMessage: string): Promise<string> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
          console.log(`[LiteLLM] Text retry ${attempt}/${this.retries} after ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }
        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(this.defaultTimeoutMs),
        });

        if (!response.ok) {
          const text = await response.text();
          const errorMsg = `LiteLLM lore request failed: ${response.status} ${response.statusText} — ${text}`;
          const isRetryable = response.status === 429 || response.status >= 500;
          if (!isRetryable) {
            const nonRetryableError = new Error(errorMsg);
            (nonRetryableError as any).isRetryable = false;
            throw nonRetryableError;
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';

        if (content.startsWith('```markdown') || content.startsWith('```')) {
          const fenceMatch = content.match(/```(?:markdown)?\s*\n?([\s\S]*?)```/);
          content = fenceMatch ? fenceMatch[1] : content;
        }

        return content.trim();
      } catch (err: any) {
        if (err.isRetryable === false) {
          throw err;
        }
        lastError = err;
        if (attempt === this.retries) break;
      }
    }
    throw lastError!;
  }

  async parseDescription(description: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }> {
    const systemPrompt = buildSystemPrompt(context);
    const { result, usage } = await this.callLLM(systemPrompt, description);
    return { plan: ContentPlanSchema.parse(result), usage };
  }

  async generateOutline(description: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }> {
    const outlineModel = process.env.LLM_OUTLINE_MODEL || this.model;
    const provider = outlineModel !== this.model
      ? new LiteLLMProvider({ model: outlineModel, timeoutMs: this.defaultTimeoutMs, retries: this.retries })
      : this;

    const maxTokens = finiteInt(process.env.LLM_OUTLINE_MAX_TOKENS, 4096);
    const initialMaxItems = finiteInt(process.env.LLM_OUTLINE_INITIAL_MAX_ITEMS, 15);

    const attemptOutline = async (maxItems?: number): Promise<{ plan: ContentPlan; usage: LLMUsage | null }> => {
      const systemPrompt = buildOutlinePrompt(context, { maxItems });
      const { result, usage } = await provider.callLLM(systemPrompt, description, undefined, maxTokens);
      return { plan: result as ContentPlan, usage };
    };

    let maxItems = initialMaxItems;
    for (;;) {
      try {
        return await attemptOutline(maxItems);
      } catch (err: any) {
        if (!err.message?.includes('LLM output truncated')) throw err;
        const reduced = Math.floor(maxItems / 2);
        if (reduced < 3) {
          console.warn(`[LiteLLMProvider] Item count already at minimum, not retrying`);
          throw err;
        }
        console.log(`[LiteLLMProvider] Outline truncated, retrying with reduced item count (${reduced})`);
        maxItems = reduced;
      }
    }
  }

  async refinePlan(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }> {
    const systemPrompt = buildRefinementPrompt(existingPlan, feedback, context);
    const { result, usage } = await this.callLLM(systemPrompt, feedback);
    result.id = existingPlan.id;
    return { plan: ContentPlanSchema.parse(result), usage };
  }

  async refinePlanItems(selectedItems: ContentPlanItem[], fullPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<{ items: ContentPlanItem[]; usage: LLMUsage | null }> {
    const systemPrompt = buildItemScopedRefinementPrompt(selectedItems, fullPlan, feedback, context);
    const { result, usage } = await this.callLLM(systemPrompt, feedback);
    if (!Array.isArray(result.items)) {
      throw new Error('LiteLLM refinePlanItems returned invalid response: expected items array');
    }
    const items = result.items as ContentPlanItem[];
    if (!items.some(item => selectedItems.some(selected => selected.id === item.id))) {
      throw new Error('LiteLLM refinePlanItems returned no selected items to refine');
    }
    // Accept partial subset — unchanged selected items may be omitted by the LLM.
    // The caller's merge logic will preserve items not present in the returned subset.
    return { items, usage };
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

  async extractEntities(systemPrompt: string, chunk: string): Promise<{ entities: EntityCandidate[] }> {
    const maxTokens = finiteInt(process.env.LLM_OUTLINE_MAX_TOKENS, 4096);
    const { result } = await this.callLLM(systemPrompt, chunk, undefined, maxTokens);
    const raw = Array.isArray((result as any).entities) ? (result as any).entities : [];
    const entities = raw.filter((e: any) =>
      e && typeof e.name === 'string' && e.name.trim() &&
      typeof e.type === 'string' && e.type.trim()
    );
    return { entities };
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

}