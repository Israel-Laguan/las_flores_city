import { LLMUsage } from './types/LLMTypes.js';
import { estimateCost } from './LLMCostEstimator.js';
import { finiteInt } from '../utils/env.js';

export interface LiteLLMCoreDeps {
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultTimeoutMs: number;
  retries: number;
}

export interface LiteLLMCore {
  extractUsage(data: any): LLMUsage | null;
  enhanceError(lastError: Error, timeoutMs: number, maxTimeoutMs: number): never;
  callLLM(systemPrompt: string, userMessage: string, customTimeoutMs?: number, maxTokens?: number): Promise<{ result: Record<string, unknown>; usage: LLMUsage | null }>;
  callLLMText(systemPrompt: string, userMessage: string): Promise<string>;
  /**
   * M29 — multi-turn chat completion. Unlike `callLLM`/`callLLMText` (single
   * user turn), this accepts a full message history. Supports both free-form
   * prose (`jsonMode: false`) and structured JSON output (`jsonMode: true`).
   * Retry/backoff/truncation rules are the same as `callLLM`.
   */
  callLLMMessages(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    opts?: { jsonMode?: boolean; maxTokens?: number; customTimeoutMs?: number },
  ): Promise<{ result?: Record<string, unknown>; text?: string; usage: LLMUsage | null }>;
}

function extractUsage(data: any, model: string): LLMUsage | null {
  const usage = data?.usage;
  if (usage && typeof usage.total_tokens === 'number') {
    return {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens,
      model,
      estimatedCostUsd: estimateCost(model, usage),
    };
  }
  return null;
}

function enhanceError(lastError: Error, model: string, baseUrl: string, retries: number, timeoutMs: number, maxTimeoutMs: number): never {
  const baseMsg = `LiteLLM call failed after ${retries + 1} attempts`;
  if (lastError.name === 'TimeoutError' || lastError.message?.includes('timeout')) {
    const enhancedError = new Error(
      `${baseMsg}: Connection to ${baseUrl} timed out. ` +
      `Model: ${model}, current timeout: ${timeoutMs}ms, max: ${maxTimeoutMs}ms. ` +
      `Check if LiteLLM is running and reachable from this container. ` +
      `Test with: wget -qO- ${baseUrl}/health`
    );
    (enhancedError as any).cause = lastError;
    (enhancedError as any).model = model;
    (enhancedError as any).baseUrl = baseUrl;
    (enhancedError as any).timeoutMs = timeoutMs;
    throw enhancedError;
  }
  if (lastError.message?.includes('fetch failed') || lastError.message?.includes('Failed to fetch')) {
    const enhancedError = new Error(
      `${baseMsg}: Cannot reach LiteLLM at ${baseUrl}. ` +
      `Check container networking, DNS resolution, and that LiteLLM is running. ` +
      `With Podman rootless, host.containers.internal may not resolve without aardvark-dns. ` +
      `Try using the host's IP address directly.`
    );
    (enhancedError as any).cause = lastError;
    (enhancedError as any).baseUrl = baseUrl;
    throw enhancedError;
  }
  throw lastError;
}

function parseJsonContent(content: string | undefined): Record<string, unknown> {
  if (!content) {
    throw new Error('LiteLLM response did not contain any message content.');
  }
  const fenceMatch = content.match(/```(?:json|JSON)\s*\n?([\s\S]*?)```/);
  const cleanedContent = fenceMatch ? fenceMatch[1].trim() : content.trim();
  try {
    return JSON.parse(cleanedContent);
  } catch (e) {
    throw new Error(`LiteLLM returned invalid JSON: ${(e as Error).message}. Content preview: ${cleanedContent.substring(0, 200)}`);
  }
}

async function callLLM(
  deps: LiteLLMCoreDeps,
  systemPrompt: string,
  userMessage: string,
  customTimeoutMs?: number,
  maxTokens?: number,
): Promise<{ result: Record<string, unknown>; usage: LLMUsage | null }> {
  const { baseUrl, apiKey, model, defaultTimeoutMs, retries } = deps;
  const timeoutMs = customTimeoutMs ?? defaultTimeoutMs;
  const maxTimeoutMs = finiteInt(process.env.LLM_MAX_TIMEOUT_MS, 300000);
  let lastError: Error | null = null;
  let attemptTimeoutMs = timeoutMs;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
        console.log(`[LiteLLM] Retry ${attempt}/${retries} after ${delay}ms, timeout: ${attemptTimeoutMs}ms`);
        await new Promise(r => setTimeout(r, delay));
        attemptTimeoutMs = Math.min(attemptTimeoutMs * 2, maxTimeoutMs);
      }
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
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
      const usage = extractUsage(data, model);

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
      return { result: parseJsonContent(content), usage };
    } catch (err: any) {
      if (err.isRetryable === false) {
        throw err;
      }
      lastError = err;
      if (attempt === retries) break;
    }
  }
  enhanceError(lastError!, model, baseUrl, retries, timeoutMs, maxTimeoutMs);
}

async function callLLMText(deps: LiteLLMCoreDeps, systemPrompt: string, userMessage: string): Promise<string> {
  const { baseUrl, apiKey, model, defaultTimeoutMs, retries } = deps;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
        console.log(`[LiteLLM] Text retry ${attempt}/${retries} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(defaultTimeoutMs),
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
      if (attempt === retries) break;
    }
  }
  throw lastError!;
}

/**
 * M29 — multi-turn chat completion. Sends the full message history (system +
 * supplied turns), applying the same retry/backoff/truncation rules as
 * `callLLM`. Returns structured JSON (`result`) when `opts.jsonMode` is true,
 * otherwise free-form trimmed prose (`text`).
 */
async function callLLMMessages(
  deps: LiteLLMCoreDeps,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  opts: { jsonMode?: boolean; maxTokens?: number; customTimeoutMs?: number } = {},
): Promise<{ result?: Record<string, unknown>; text?: string; usage: LLMUsage | null }> {
  const { baseUrl, apiKey, model, defaultTimeoutMs, retries } = deps;
  const timeoutMs = opts.customTimeoutMs ?? defaultTimeoutMs;
  const maxTokens = opts.maxTokens;
  const maxTimeoutMs = finiteInt(process.env.LLM_MAX_TIMEOUT_MS, 300000);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Escalate the per-attempt timeout so a slow model isn't abandoned early.
    let currentTimeoutMs = timeoutMs * Math.pow(2, attempt);
    if (currentTimeoutMs > maxTimeoutMs) currentTimeoutMs = maxTimeoutMs;
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
        console.log(`[LiteLLM] Messages retry ${attempt}/${retries} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages,
            ],
            temperature: 0.7,
            ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
            ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
          }),
        signal: AbortSignal.timeout(currentTimeoutMs),
      });

      if (!response.ok) {
        const text = await response.text();
        const errorMsg = `LiteLLM messages request failed: ${response.status} ${response.statusText} — ${text}`;
        const isRetryable = response.status === 429 || response.status >= 500;
        if (!isRetryable) {
          const nonRetryableError = new Error(errorMsg);
          (nonRetryableError as any).isRetryable = false;
          throw nonRetryableError;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const usage = extractUsage(data, model);

      // Truncation guard: if the model hit max_tokens mid-generation, a partial
      // parse could silently drop chunks (especially in JSON mode). Surface a
      // clear non-retryable error instead of corrupting the output.
      if (data.choices?.[0]?.finish_reason === 'length') {
        const truncError = new Error(
          `LLM output truncated (finish_reason=length). ` +
          `Consider increasing the max token limit for this call or reducing input size.`,
        );
        (truncError as any).isRetryable = false;
        throw truncError;
      }

      const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.message?.reasoning_content ?? '';
      if (opts.jsonMode) {
        return { result: parseJsonContent(content), text: undefined, usage };
      }

      let trimmed = content.trim();
      if (trimmed.startsWith('```')) {
        const fenceMatch = trimmed.match(/```(?:markdown)?\s*\n?([\s\S]*?)```/);
        trimmed = fenceMatch ? fenceMatch[1].trim() : trimmed;
      }
      return { result: undefined, text: trimmed, usage };
    } catch (err: any) {
      if (err.isRetryable === false) throw err;
      lastError = err;
      if (attempt === retries) break;
    }
  }
  enhanceError(lastError!, model, baseUrl, retries, timeoutMs, maxTimeoutMs);
}

function createLiteLLMCore(deps: LiteLLMCoreDeps): LiteLLMCore {
  return {
    extractUsage: (data) => extractUsage(data, deps.model),
    enhanceError: (lastError, timeoutMs, maxTimeoutMs) =>
      enhanceError(lastError, deps.model, deps.baseUrl, deps.retries, timeoutMs, maxTimeoutMs),
    callLLM: (systemPrompt, userMessage, customTimeoutMs, maxTokens) =>
      callLLM(deps, systemPrompt, userMessage, customTimeoutMs, maxTokens),
    callLLMText: (systemPrompt, userMessage) => callLLMText(deps, systemPrompt, userMessage),
    callLLMMessages: (systemPrompt, messages, opts) => callLLMMessages(deps, systemPrompt, messages, opts),
  };
}

export { createLiteLLMCore };
