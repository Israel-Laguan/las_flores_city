import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';

export const adminAiConfigRouter = express.Router();

adminAiConfigRouter.use(authAndAdminMiddleware);

interface AiConfigResponse {
  provider: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  model: string;
  timeoutMs: number;
  maxTimeoutMs: number;
  outlineModel: string;
  outlineMaxTokens: number;
  outlineInitialMaxItems: number;
  outlineContextDepth: string;
  planOutlineMaxInputChars: number;
  planFillConcurrency: number;
  planFillTimeoutMs: number;
  priceTableConfigured: boolean;
}

function maskApiKey(key: string): string {
  if (!key || key === '') return 'not set';
  if (key.length <= 4) return '••••';
  const visible = key.slice(-4);
  return '••••' + visible;
}

function displayBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const sanitized = new URL(url.origin);
    return sanitized.origin;
  } catch {
    return 'invalid URL';
  }
}

function finiteInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

adminAiConfigRouter.get('/', (_req, res) => {
  const provider = process.env.LLM_PROVIDER || 'mock';
  const apiKey = process.env.LITELLM_API_KEY || '';
  const model = process.env.LLM_MODEL || 'poolside/laguna-m.1';
  const outlineModel = process.env.LLM_OUTLINE_MODEL || model;
  const priceTableConfigured = (() => {
    try {
      const envJson = process.env.LLM_PRICE_TABLE;
      if (envJson) {
        const parsed = JSON.parse(envJson);
        if (parsed && typeof parsed === 'object') {
          const values = Object.values(parsed);
          if (values.some(v => v && typeof v === 'object' && 'input' in v && 'output' in v)) return true;
        }
      }
    } catch { /* not valid JSON */ }
    return false;
  })();

  const config: AiConfigResponse = {
    provider,
    baseUrl: displayBaseUrl(process.env.LITELLM_BASE_URL || 'http://litellm:4000'),
    apiKeyConfigured: apiKey !== '',
    apiKeyMasked: maskApiKey(apiKey),
    model,
    timeoutMs: finiteInt(process.env.LLM_TIMEOUT_MS, 60000),
    maxTimeoutMs: finiteInt(process.env.LLM_MAX_TIMEOUT_MS, 300000),
    outlineModel,
    outlineMaxTokens: finiteInt(process.env.LLM_OUTLINE_MAX_TOKENS, 4096),
    outlineInitialMaxItems: finiteInt(process.env.LLM_OUTLINE_INITIAL_MAX_ITEMS, 15),
    outlineContextDepth: process.env.PLAN_OUTLINE_CONTEXT_DEPTH || 'names',
    planOutlineMaxInputChars: finiteInt(process.env.PLAN_OUTLINE_MAX_INPUT_CHARS, 10000),
    planFillConcurrency: finiteInt(process.env.PLAN_FILL_CONCURRENCY, 3),
    planFillTimeoutMs: finiteInt(process.env.PLAN_FILL_TIMEOUT_MS, 120000),
    priceTableConfigured,
  };

  res.json({ success: true, data: config, timestamp: new Date().toISOString() });
});
