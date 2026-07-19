/**
 * LLM Cost Estimator
 *
 * Estimates cost per LLM call based on token counts and a simple
 * per-1K-tokens price table. Prices are configurable via env var
 * `LLM_PRICE_TABLE` (JSON string of model → USD-per-1K-tokens map).
 * Known-model prices are compile-time defaults; unknown models cost $0.
 */

let parsedPrices: Record<string, { input: number; output: number }> | null = null;

const DEFAULT_PRICES: Record<string, { input: number; output: number }> = {
  'poolside/laguna-m.1': { input: 0.003, output: 0.015 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gemini/gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini/gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'groq/llama3-70b-8192': { input: 0.00059, output: 0.00079 },
};

function loadPriceTable(): Record<string, { input: number; output: number }> {
  if (parsedPrices) return parsedPrices;
  const envJson = process.env.LLM_PRICE_TABLE;
  if (envJson) {
    try {
      parsedPrices = JSON.parse(envJson) as Record<string, { input: number; output: number }>;
      return parsedPrices;
    } catch {
      console.warn('[LLMCostEstimator] Failed to parse LLM_PRICE_TABLE env var — falling back to defaults');
    }
  }
  parsedPrices = { ...DEFAULT_PRICES };
  return parsedPrices;
}

/**
 * Estimate cost of an LLM API call.
 *
 * @param model  The model name (e.g. 'poolside/laguna-m.1')
 * @param usage  Usage object from the LiteLLM / OpenAI API response
 * @returns Estimated cost in USD, or 0 if the model has no known price
 */
export function estimateCost(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
): number {
  const prices = loadPriceTable();
  const modelPrices = prices[model];
  if (!modelPrices) return 0;

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;

  const inputCost = (promptTokens / 1000) * modelPrices.input;
  const outputCost = (completionTokens / 1000) * modelPrices.output;
  return Math.round((inputCost + outputCost) * 100_000) / 100_000; // round to 5 decimal places
}