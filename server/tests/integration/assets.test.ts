/**
 * Assets Integration Tests
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import pg from 'pg';
import express from 'express';
import { assetsRouter } from '../../src/routes/assets.js';
import { closeRedis } from '../../src/database/redis.js';

// Mock AWS SDK to avoid real S3/MinIO calls in tests
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('http://mocked-signed-url'),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
}));

// Mock generation service
jest.mock('../../src/services/AssetGenerationService.js', () => ({
  generateBaseImage: jest.fn().mockResolvedValue(Buffer.from('base-image-data')),
  generateVariantImage: jest.fn().mockResolvedValue(Buffer.from('variant-image-data')),
  fetchImageAsBase64: jest.fn().mockResolvedValue('base64-data'),
}));

// Mock storage service
jest.mock('../../src/services/StorageService.js', () => ({
  uploadToMinio: jest.fn().mockImplementation((buf: any, key: string, contentType?: string) => Promise.resolve(`s3://las-flores/${key}`)),
  signMinioUrl: jest.fn().mockResolvedValue('http://mocked-signed-url'),
  deleteFromMinio: jest.fn().mockResolvedValue(undefined),
}));

const { Pool } = pg;

const app = express();
app.use(express.json());
app.use('/assets', assetsRouter);
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

let server: ReturnType<typeof express.Application.listen>;
let oltpPool: pg.Pool;
let port: number;

const TEST_PROMPT_REL = 'test_assets_prompt';

beforeAll(async () => {
  oltpPool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  server = await new Promise<ReturnType<typeof express.Application.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  try {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))
    );
  } catch {}
  
  await oltpPool.query('DELETE FROM asset_variants WHERE prompt_text LIKE $1 OR variant_name LIKE $1', ['%test%']);
  await oltpPool.query('DELETE FROM asset_bases WHERE prompt_rel = $1', [TEST_PROMPT_REL]);
  
  await oltpPool.end();
  await closeRedis();
});

describe('Assets API', () => {
  test('GET /assets/prompt-catalog returns 200 with categories', async () => {
    const res = await fetch(`http://localhost:${port}/assets/prompt-catalog`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.categories)).toBe(true);
  });

  let createdBaseId: string;

  test('POST /assets/generate-bases creates bases with valid prompt_rel', async () => {
    // Note: prompt_rel must exist in the real file system unless we mock it.
    // The route `assetsRouter` uses fs.existsSync to check.
    // Use the known path relative to PROMPT_ROOT.
    const validPromptRel = 'phone-terminal/assets/app_misiones';

    const res = await fetch(`http://localhost:${port}/assets/generate-bases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_rel: validPromptRel, count: 1 }),
    });
    
    const data = await res.json();
    console.log('generate-bases status:', res.status, 'body:', JSON.stringify(data));
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBeDefined();
    
    createdBaseId = data.data[0].id;

    // cleanup later in DB manually because we used a real prompt_rel
    await oltpPool.query('UPDATE asset_bases SET prompt_rel = $1 WHERE id = $2', [TEST_PROMPT_REL, createdBaseId]);
  });

  test('POST /assets/generate-bases returns 404 for invalid prompt_rel', async () => {
    const res = await fetch(`http://localhost:${port}/assets/generate-bases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_rel: 'invalid_prompt_rel_does_not_exist', count: 1 }),
    });
    
    expect(res.status).toBe(404);
  });

  test('POST /assets/approve-base marks base as chosen and unchoses previous base', async () => {
    // Create a second base
    const base2Res = await oltpPool.query(
      `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, chosen) VALUES ($1, 2, 'dummy', false) RETURNING id`,
      [TEST_PROMPT_REL]
    );
    const base2Id = base2Res.rows[0].id;

    // Approve first base
    const res1 = await fetch(`http://localhost:${port}/assets/approve-base`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_id: createdBaseId }),
    });
    expect(res1.status).toBe(200);

    const check1 = await oltpPool.query(`SELECT chosen FROM asset_bases WHERE id = $1`, [createdBaseId]);
    expect(check1.rows[0].chosen).toBe(true);

    // Approve second base
    const res2 = await fetch(`http://localhost:${port}/assets/approve-base`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_id: base2Id }),
    });
    expect(res2.status).toBe(200);

    const check2 = await oltpPool.query(`SELECT chosen FROM asset_bases WHERE id IN ($1, $2) ORDER BY id`, [createdBaseId, base2Id]);
    const row1 = check2.rows.find((r: any) => r.id === createdBaseId) || check2.rows[0]; // just grab boolean if order not matching
    // Actual check by id:
    const finalCheck1 = await oltpPool.query(`SELECT chosen FROM asset_bases WHERE id = $1`, [createdBaseId]);
    const finalCheck2 = await oltpPool.query(`SELECT chosen FROM asset_bases WHERE id = $1`, [base2Id]);
    
    expect(finalCheck1.rows[0].chosen).toBe(false);
    expect(finalCheck2.rows[0].chosen).toBe(true);
  });

  let createdVariantId: string;

  test('POST /assets/generate-variants creates variant with i2i', async () => {
    const res = await fetch(`http://localhost:${port}/assets/generate-variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_id: createdBaseId,
        variants: [
          {
            variant_name: 'test_variant',
            prompt: 'test prompt',
            negative_prompt: 'bad',
            i2i_strength: 0.7,
          },
        ],
      }),
    });
    
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBeDefined();

    createdVariantId = data.data.id;
  });

  test('POST /assets/publish copies to final path', async () => {
    const originalFetch = global.fetch;
    
    // Mock fetch to handle the signed URL calls from executePublishAsset
    (global.fetch as unknown) = jest.fn().mockImplementation((url: string) => {
      if (url.startsWith('http://mocked-signed-url')) {
        return Promise.resolve({
          status: 200,
          arrayBuffer: async () => Buffer.from('fake-image-bytes').buffer,
        } as any);
      }
      return originalFetch(url);
    });
    
    try {
      // Test publishing a variant
      const res = await fetch(`http://localhost:${port}/assets/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: createdVariantId,
        }),
      });
      
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.final_path).toBeDefined();

      // Verify DB update for variant
      const check = await oltpPool.query(`SELECT final_path FROM asset_variants WHERE id = $1`, [createdVariantId]);
      expect(check.rows[0].final_path).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('POST /assets/publish copies base to final path', async () => {
    const originalFetch = global.fetch;
    
    // Mock fetch to handle the signed URL calls from executePublishAsset
    (global.fetch as unknown) = jest.fn().mockImplementation((url: string) => {
      if (url.startsWith('http://mocked-signed-url')) {
        return Promise.resolve({
          status: 200,
          arrayBuffer: async () => Buffer.from('fake-image-bytes').buffer,
        } as any);
      }
      return originalFetch(url);
    });
    
    try {
      // Test publishing a base
      const res = await fetch(`http://localhost:${port}/assets/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_id: createdBaseId,
        }),
      });
      
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.final_path).toBeDefined();

      // Verify DB update for base
      const check = await oltpPool.query(`SELECT final_path FROM asset_bases WHERE id = $1`, [createdBaseId]);
      expect(check.rows[0].final_path).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('GET /assets/image/:id returns base image bytes', async () => {
    const originalFetch = global.fetch;
    (global.fetch as unknown) = jest.fn().mockImplementation((url: string) => {
      if (url === 'http://mocked-signed-url') {
        return Promise.resolve({
          status: 200,
          arrayBuffer: async () => Buffer.from('fake-image-bytes').buffer,
        } as any);
      }
      return originalFetch(url);
    });
    try {
      const res = await fetch(`http://localhost:${port}/assets/image/${createdBaseId}`);
      expect(res.status).toBe(200);
      const buf = await res.arrayBuffer();
      expect(Buffer.from(buf).toString()).toBe('fake-image-bytes');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('GET /assets/image/:id returns variant image bytes', async () => {
    const originalFetch = global.fetch;
    (global.fetch as unknown) = jest.fn().mockImplementation((url: string) => {
      if (url === 'http://mocked-signed-url') {
        return Promise.resolve({
          status: 200,
          arrayBuffer: async () => Buffer.from('fake-variant-image-bytes').buffer,
        } as any);
      }
      return originalFetch(url);
    });
    try {
      const res = await fetch(`http://localhost:${port}/assets/image/${createdVariantId}`);
      expect(res.status).toBe(200);
const buf = await res.arrayBuffer();
        expect(Buffer.from(buf).toString()).toEqual('fake-variant-image-bytes');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('GET /assets/list returns bases and variants', async () => {
    const res = await fetch(`http://localhost:${port}/assets/list?prompt_rel=${TEST_PROMPT_REL}`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.bases)).toBe(true);
    expect(Array.isArray(data.data.variants)).toBe(true);
    expect(data.data.bases.length).toBeGreaterThan(0);
  });

  test('GET /assets/list-all returns group summaries', async () => {
    const res = await fetch(`http://localhost:${port}/assets/list-all`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.groups)).toBe(true);
  });
});
