/**
 * Assets Integration Tests
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import { Pool, type Pool as PgPool } from 'pg';
import type { Server } from 'node:http';
import path from 'node:path';

// Set PROMPT_ROOT to the actual location relative to repo root
// In CI and podman, process.cwd() is the server directory.
process.env.PROMPT_ROOT = path.resolve(process.cwd(), '../docs/lore/assets/ui-concepts');

// Mock AWS SDK and StorageService using ESM mocks
// These must be set up before importing the routes
import { jest as jestGlobals } from '@jest/globals';

const mockSignMinioUrl = jestGlobals.fn<() => Promise<string>>().mockResolvedValue('http://mocked-signed-url');
const mockUploadToMinio = jestGlobals.fn<(buf: Buffer, key: string, contentType?: string) => Promise<string>>().mockImplementation((_buf, key, _contentType) => 
  Promise.resolve(`s3://las-flores/${key}`)
);
const mockDeleteFromMinio = jestGlobals.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGenerateBaseImage = jestGlobals.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('base-image-data'.repeat(1000)));
const mockGenerateVariantImage = jestGlobals.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('variant-image-data'.repeat(1000)));
const mockFetchImageAsBase64 = jestGlobals.fn<() => Promise<string>>().mockResolvedValue(Buffer.from('mock-image-data').toString('base64'));

function exactArrayBuffer(value: Buffer | string): ArrayBuffer {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

// Mock AWS SDK modules
jestGlobals.doMock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jestGlobals.fn<() => Promise<string>>().mockResolvedValue('http://mocked-signed-url'),
  default: {
    getSignedUrl: jestGlobals.fn<() => Promise<string>>().mockResolvedValue('http://mocked-signed-url'),
  },
}));

jestGlobals.doMock('@aws-sdk/client-s3', () => ({
  S3Client: jestGlobals.fn().mockImplementation(() => ({
    send: jestGlobals.fn<() => Promise<Record<string, never>>>().mockResolvedValue({}),
  })),
  GetObjectCommand: jestGlobals.fn(),
  PutObjectCommand: jestGlobals.fn(),
  DeleteObjectCommand: jestGlobals.fn(),
  HeadBucketCommand: jestGlobals.fn(),
  CreateBucketCommand: jestGlobals.fn(),
  default: {
    S3Client: jestGlobals.fn(),
    GetObjectCommand: jestGlobals.fn(),
    PutObjectCommand: jestGlobals.fn(),
    DeleteObjectCommand: jestGlobals.fn(),
    HeadBucketCommand: jestGlobals.fn(),
    CreateBucketCommand: jestGlobals.fn(),
  },
}));

// Mock StorageService
jestGlobals.doMock('../../src/services/StorageService.js', () => ({
  signMinioUrl: mockSignMinioUrl,
  uploadToMinio: mockUploadToMinio,
  deleteFromMinio: mockDeleteFromMinio,
  default: {
    signMinioUrl: mockSignMinioUrl,
    uploadToMinio: mockUploadToMinio,
    deleteFromMinio: mockDeleteFromMinio,
  },
}));

// Mock AssetGenerationService
jestGlobals.doMock('../../src/services/AssetGenerationService.js', () => ({
  generateBaseImage: mockGenerateBaseImage,
  generateVariantImage: mockGenerateVariantImage,
  fetchImageAsBase64: mockFetchImageAsBase64,
  default: {
    generateBaseImage: mockGenerateBaseImage,
    generateVariantImage: mockGenerateVariantImage,
    fetchImageAsBase64: mockFetchImageAsBase64,
  },
}));

let app: express.Express;
let closeRedis: () => Promise<void>;
let server: Server;
let oltpPool: PgPool;
let port: number;

let TEST_PROMPT_REL: string;
let adminToken: string;

beforeAll(async () => {
  const { assetsRouter } = await import('../../src/routes/assets.js');
  const { authRouter } = await import('../../src/routes/auth.js');
  const redisModule = await import('../../src/database/redis.js');
  const { cookieParserMiddleware } = await import('../../src/utils/cookies.js');
  const { generateToken } = await import('../../src/middleware/auth.js');
  closeRedis = redisModule.closeRedis;

  app = express();
  app.use(express.json());
  
  // Cookie parser — required for auth middleware to read cookies
  app.use(cookieParserMiddleware);
  
  // Mount auth router first for login
  app.use('/auth', authRouter);
  
  // Mount assets router (requires admin auth)
  app.use('/assets', assetsRouter);
  
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  });

  oltpPool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  // Generate a unique test key to avoid collisions with other test runs
  const crypto = await import('node:crypto');
  TEST_PROMPT_REL = `test_assets_prompt_${crypto.randomUUID().replace(/-/g, '_')}`;

  await oltpPool.query('DELETE FROM asset_variants WHERE prompt_text LIKE $1 OR variant_name LIKE $1', ['%test%']);
  await oltpPool.query('DELETE FROM asset_bases WHERE prompt_rel = $1', [TEST_PROMPT_REL]);

  server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = (server.address() as { port: number }).port;

  // Generate admin token for authenticated requests (matching pattern used by other integration tests)
  const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000001';
  adminToken = generateToken(ADMIN_USER_ID);
});

afterAll(async () => {
  try {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))
    );
  } catch (e: any) {}
  
  await oltpPool.query('DELETE FROM asset_variants WHERE prompt_text LIKE $1 OR variant_name LIKE $1', ['%test%']);
  await oltpPool.query('DELETE FROM asset_bases WHERE prompt_rel = $1', [TEST_PROMPT_REL]);
  
  await oltpPool.end();
  await closeRedis();
  jestGlobals.restoreAllMocks();
});

beforeEach(() => {
  mockSignMinioUrl.mockClear();
  mockUploadToMinio.mockClear();
  mockDeleteFromMinio.mockClear();
  mockGenerateBaseImage.mockClear();
  mockGenerateVariantImage.mockClear();
  mockFetchImageAsBase64.mockClear();
});

describe('Assets API', () => {
  // Helper to make authenticated requests using Bearer token
  // (matches pattern used by other integration tests like sleep.test.ts, shop.test.ts, etc.)
  const authFetch = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${adminToken}`,
      },
    });
  };

  test('GET /assets/prompt-catalog returns 200 with categories', async () => {
    const res = await authFetch(`http://localhost:${port}/assets/prompt-catalog`);
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

    const res = await authFetch(`http://localhost:${port}/assets/generate-bases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_rel: validPromptRel, count: 1 }),
    });
    
    const data = await res.json();
    console.log('generate-bases status:', res.status, 'body:', JSON.stringify(data));
    console.log('mockGenerateBaseImage called:', mockGenerateBaseImage.mock.calls.length, 'times');
    console.log('mockUploadToMinio called:', mockUploadToMinio.mock.calls.length, 'times');
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBeDefined();
    
    createdBaseId = data.data[0].id;

    // cleanup later in DB manually because we used a real prompt_rel
    await oltpPool.query('UPDATE asset_bases SET prompt_rel = $1 WHERE id = $2', [TEST_PROMPT_REL, createdBaseId]);
  });

  test('POST /assets/generate-bases returns 404 for invalid prompt_rel', async () => {
    const res = await authFetch(`http://localhost:${port}/assets/generate-bases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_rel: 'invalid_prompt_rel_does_not_exist', count: 1 }),
    });
    
    expect(res.status).toBe(404);
  });

  test('POST /assets/approve-base marks base as chosen and unchoses previous base', async () => {
    // Create a second base
    const base2Res = await oltpPool.query(
      `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, chosen, asset_type, prompt_text, negative_prompt, width, height)
       VALUES ($1, 2, 'dummy', false, 'app-icon', 'test prompt', '', 1024, 1024)
       RETURNING id`,
      [TEST_PROMPT_REL]
    );
    const base2Id = base2Res.rows[0].id;

    // Approve first base
    const res1 = await authFetch(`http://localhost:${port}/assets/approve-base`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_id: createdBaseId }),
    });
    expect(res1.status).toBe(200);

    // Approve second base (should unchoose first)
    const res2 = await authFetch(`http://localhost:${port}/assets/approve-base`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_id: base2Id }),
    });
    expect(res2.status).toBe(200);

    // Verify: second base should be chosen
    const chosenRes = await oltpPool.query('SELECT chosen FROM asset_bases WHERE id = $1', [base2Id]);
    expect(chosenRes.rows[0].chosen).toBe(true);

    // Verify: first base should NOT be chosen
    const unchosenRes = await oltpPool.query('SELECT chosen FROM asset_bases WHERE id = $1', [createdBaseId]);
    expect(unchosenRes.rows[0].chosen).toBe(false);

    // Cleanup
    await oltpPool.query('DELETE FROM asset_bases WHERE id = $1', [base2Id]);
  });

  test('POST /assets/generate-variants creates variant with i2i', async () => {
    // Generate variant from the base created above
    const res = await authFetch(`http://localhost:${port}/assets/generate-variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_id: createdBaseId,
        variants: [
          {
            variant_name: 'golden',
            prompt: 'A glowing golden variant',
            i2i_strength: 0.7,
          },
        ],
      }),
    });
    
    const data = await res.json();
    console.log('generate-variants status:', res.status, 'body:', JSON.stringify(data));
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBeDefined();
    
    createdVariantId = data.data[0].id;
  });

  let createdVariantId: string;

  test('POST /assets/publish copies to final path', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = (jestGlobals.fn() as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url === 'http://mocked-signed-url') {
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: async () => exactArrayBuffer('fake-variant-image-bytes'),
        });
      }
      return originalFetch(url, init);
    });
    try {
      // Test publishing a variant
      const res = await authFetch(`http://localhost:${port}/assets/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: createdVariantId }),
      });
      
      const data = await res.json();
      console.log('publish variant status:', res.status, 'body:', JSON.stringify(data));
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
    (global as any).fetch = (jestGlobals.fn() as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url === 'http://mocked-signed-url') {
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: async () => exactArrayBuffer('fake-image-bytes'),
        });
      }
      return originalFetch(url, init);
    });
    try {
      const res = await authFetch(`http://localhost:${port}/assets/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_id: createdBaseId }),
      });
      
      const data = await res.json();
      console.log('publish base status:', res.status, 'body:', JSON.stringify(data));
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.final_path).toBeDefined();
      
      // Verify DB update for base
      const check = await oltpPool.query(`SELECT final_path FROM asset_bases WHERE id = $1`, [createdBaseId]);
      expect(check.rows[0].final_path).toBeTruthy();
      
      expect(mockSignMinioUrl).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('GET /assets/image/:id returns base image bytes', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = (jestGlobals.fn() as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url === 'http://mocked-signed-url') {
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: async () => exactArrayBuffer('fake-image-bytes'),
        });
      }
      return originalFetch(url, init);
    });
    try {
      const res = await authFetch(`http://localhost:${port}/assets/image/${createdBaseId}`);
      expect(res.status).toBe(200);
      const buf = await res.arrayBuffer();
      expect(Buffer.from(buf).toString()).toBe('fake-image-bytes');
      expect(mockSignMinioUrl).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('GET /assets/image/:id returns variant image bytes', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = (jestGlobals.fn() as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url === 'http://mocked-signed-url') {
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: async () => exactArrayBuffer('fake-variant-image-bytes'),
        });
      }
      return originalFetch(url, init);
    });
    try {
      const res = await authFetch(`http://localhost:${port}/assets/image/${createdVariantId}`);
      expect(res.status).toBe(200);
      const buf = await res.arrayBuffer();
      expect(Buffer.from(buf).toString()).toEqual('fake-variant-image-bytes');
      expect(mockSignMinioUrl).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('GET /assets/list returns bases and variants', async () => {
    const res = await authFetch(`http://localhost:${port}/assets/list?prompt_rel=${TEST_PROMPT_REL}`);
    const data = await res.json();
    console.log('list status:', res.status, 'body:', JSON.stringify(data));
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.bases)).toBe(true);
    expect(Array.isArray(data.data.variants)).toBe(true);
    expect(data.data.bases.length).toBeGreaterThan(0);
  });

  test('GET /assets/list-all returns group summaries', async () => {
    const res = await authFetch(`http://localhost:${port}/assets/list-all`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.groups)).toBe(true);
  });
});
