import { ContentPlanSchema, type ContentPlan, type ContentPlanItem } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext, LLMUsage } from './types/LLMTypes.js';
import { buildLorePrompt, buildRefinementPrompt, buildSystemPrompt, buildOutlinePrompt } from './LLMPrompts.js';
import { estimateCost } from './LLMCostEstimator.js';

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
    this.defaultTimeoutMs = opts?.timeoutMs ?? parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10);
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

  private async callLLM(systemPrompt: string, userMessage: string, customTimeoutMs?: number): Promise<{ result: Record<string, unknown>; usage: LLMUsage | null }> {
    const timeoutMs = customTimeoutMs ?? this.defaultTimeoutMs;
    const maxTimeoutMs = parseInt(process.env.LLM_MAX_TIMEOUT_MS || '300000', 10);
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
        const content = data.choices?.[0]?.message?.content;
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
    throw lastError!;
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

    const systemPrompt = buildOutlinePrompt(context);
    const { result, usage } = await provider.callLLM(systemPrompt, description);
    return { plan: ContentPlanSchema.parse(result), usage };
  }

  async refinePlan(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }> {
    const systemPrompt = buildRefinementPrompt(existingPlan, feedback, context);
    const { result, usage } = await this.callLLM(systemPrompt, feedback);
    result.id = existingPlan.id;
    return { plan: ContentPlanSchema.parse(result), usage };
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

}