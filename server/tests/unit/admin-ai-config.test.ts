import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { adminAiConfigRouter } from '../../src/routes/admin-ai-config.js';

// Mock the middleware to skip auth
jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: () => void) => next(),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/ai-config', adminAiConfigRouter);
  return app;
}

describe('GET /admin/ai-config', () => {
  beforeEach(() => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_TIMEOUT_MS;
    delete process.env.LLM_MAX_TIMEOUT_MS;
    delete process.env.LLM_OUTLINE_MODEL;
    delete process.env.LLM_OUTLINE_MAX_TOKENS;
    delete process.env.LLM_OUTLINE_INITIAL_MAX_ITEMS;
    delete process.env.PLAN_OUTLINE_CONTEXT_DEPTH;
    delete process.env.PLAN_OUTLINE_MAX_INPUT_CHARS;
    delete process.env.PLAN_FILL_CONCURRENCY;
    delete process.env.PLAN_FILL_TIMEOUT_MS;
    delete process.env.LLM_PRICE_TABLE;
  });

  it('returns 200 with default config when no env vars set', async () => {
    const app = buildApp();
    const res = await request(app).get('/admin/ai-config');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      provider: 'mock',
      baseUrl: 'http://litellm:4000',
      apiKeyConfigured: false,
      apiKeyMasked: 'not set',
      model: 'poolside/laguna-m.1',
      timeoutMs: 60000,
      maxTimeoutMs: 300000,
      outlineModel: 'poolside/laguna-m.1',
      outlineMaxTokens: 4096,
      outlineInitialMaxItems: 15,
      outlineContextDepth: 'names',
      planOutlineMaxInputChars: 10000,
      planFillConcurrency: 3,
      planFillTimeoutMs: 120000,
      priceTableConfigured: false,
    });
  });

  it('returns configured values when env vars are set', async () => {
    process.env.LLM_PROVIDER = 'litellm';
    process.env.LITELLM_BASE_URL = 'http://my-proxy:5000';
    process.env.LITELLM_API_KEY = 'sk-secret-key-1234';
    process.env.LLM_MODEL = 'my-model';
    process.env.LLM_TIMEOUT_MS = '30000';
    process.env.LLM_MAX_TIMEOUT_MS = '60000';
    process.env.LLM_OUTLINE_MODEL = 'outline-model';
    process.env.LLM_OUTLINE_MAX_TOKENS = '2048';
    process.env.LLM_OUTLINE_INITIAL_MAX_ITEMS = '10';
    process.env.PLAN_OUTLINE_CONTEXT_DEPTH = 'full';
    process.env.PLAN_OUTLINE_MAX_INPUT_CHARS = '20000';
    process.env.PLAN_FILL_CONCURRENCY = '5';
    process.env.PLAN_FILL_TIMEOUT_MS = '240000';
    process.env.LLM_PRICE_TABLE = '{"gpt4": {"input": 0.01, "output": 0.03}}';

    const app = buildApp();
    const res = await request(app).get('/admin/ai-config');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      provider: 'litellm',
      baseUrl: 'http://my-proxy:5000',
      apiKeyConfigured: true,
      apiKeyMasked: '••••1234',
      model: 'my-model',
      timeoutMs: 30000,
      maxTimeoutMs: 60000,
      outlineModel: 'outline-model',
      outlineMaxTokens: 2048,
      outlineInitialMaxItems: 10,
      outlineContextDepth: 'full',
      planOutlineMaxInputChars: 20000,
      planFillConcurrency: 5,
      planFillTimeoutMs: 240000,
      priceTableConfigured: true,
    });
  });

  it('masks API key and never returns raw value', async () => {
    process.env.LITELLM_API_KEY = 'sk-my-secret';
    process.env.LLM_PROVIDER = 'litellm';

    const app = buildApp();
    const res = await request(app).get('/admin/ai-config');

    expect(res.body.data.apiKeyMasked).toBe('••••cret');
    expect(res.body.data.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('sk-my-secret');
  });

  it('handles empty API key', async () => {
    process.env.LITELLM_API_KEY = '';
    const app = buildApp();
    const res = await request(app).get('/admin/ai-config');

    expect(res.body.data.apiKeyConfigured).toBe(false);
    expect(res.body.data.apiKeyMasked).toBe('not set');
  });
});
