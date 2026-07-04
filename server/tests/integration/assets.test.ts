/**
 * Assets Integration Tests
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import pg from 'pg';
import express from 'express';
import path from 'node:path';

// Set PROMPT_ROOT to the actual location relative to repo root
// In CI and podman, process.cwd() is the server directory.
process.env.PROMPT_ROOT = path.resolve(process.cwd(), '../docs/lore/assets/ui-concepts');

// Mock AWS SDK and StorageService using ESM mocks
// These must be set up before importing the routes
import { jest as jestGlobals } from '@jest/globals';

const mockSignMinioUrl = jestGlobals.fn().mockResolvedValue('http://mocked-signed-url');
const mockUploadToMinio = jestGlobals.fn().mockImplementation((buf: any, key: string, contentType?: string) => 
  Promise.resolve(`s3://las-flores/${key}`)
);
const mockDeleteFromMinio = jestGlobals.fn().mockResolvedValue(undefined);
const mockGenerateBaseImage = jestGlobals.fn().mockResolvedValue(Buffer.from('base-image-data'.repeat(1000)));
const mockGenerateVariantImage = jestGlobals.fn().mockResolvedValue(Buffer.from('variant-image-data'.repeat(1000)));
const mockFetchImageAsBase64 = jestGlobals.fn().mockResolvedValue(Buffer.from('mock-image-data').toString('base64'));

function exactArrayBuffer(value: Buffer | string): ArrayBuffer {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

// Mock AWS SDK modules
jestGlobals.doMock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jestGlobals.fn().mockResolvedValue('http://mocked-signed-url'),
  default: {
    getSignedUrl: jestGlobals.fn().mockResolvedValue('http://mocked-signed-url'),
  },
}));

jestGlobals.doMock('@aws-sdk/client-s3', () => ({
  S3Client: jestGlobals.fn().mockImplementation(() => ({
    send: jestGlobals.fn().mockResolvedValue({}),
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

const { Pool } = pg;

let app: express.Express;
let closeRedis: () => Promise<void>;
let server: ReturnType<typeof express.Application.listen>;
let oltpPool: pg.Pool;
let port: number;

let TEST_PROMPT_REL: string;
let adminCookie: string;

beforeAll(async () => {
  const { assetsRouter } = await import('../../src/routes/assets.js');
  const { authRouter } = await import('../../src/routes/auth.js');
  const redisModule = await import('../../src/database/redis.js');
  const { cookieParserMiddleware } = await import('../../src/utils/cookies.js');
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

  // Login as admin to get cookie for subsequent requests
  const loginRes = await fetch(`http://localhost:${port}/auth/dev-admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const loginData = await loginRes.json();
  
  // Extract cookie from response headers
  const cookieHeader = loginRes.headers.get('set-cookie');
  if (cookieHeader) {
    adminCookie = cookieHeader.split(';')[0]; // Get just the session cookie part
  }
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
  // Helper to make authenticated requests
  const authFetch = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Cookie: adminCookie,
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
    const data1 = await res1.json();
    console.log('approve-base status:', res1.status, 'body:', JSON.stringify(data1));
    expect(res1.status).toBe(200);

    const check1 = await oltpPool.query(`SELECT chosen FROM asset_bases WHERE id = $1`, [createdBaseId]);
    expect(check1.rows[0].chosen).toBe(true);

    // Approve second base
    const res2 = await authFetch(`http://localhost:${port}/assets/approve-base`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_id: base2Id }),
    });
    expect(res2.status).toBe(200);

    const finalCheck1 = await oltpPool.query(`SELECT chosen FROM asset_bases WHERE id = $1`, [createdBaseId]);
    const finalCheck2 = await oltpPool.query(`SELECT chosen FROM asset_bases WHERE id = $1`, [base2Id]);
    
    expect(finalCheck1.rows[0].chosen).toBe(false);
    expect(finalCheck2.rows[0].chosen).toBe(true);
  });

  let createdVariantId: string;

  test('POST /assets/generate-variants creates variant with i2i', async () => {
    const res = await authFetch(`http://localhost:${port}/assets/generate-variants`, {
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
    console.log('generate-variants status:', res.status, 'body:', JSON.stringify(data));
    console.log('mockGenerateVariantImage called:', mockGenerateVariantImage.mock.calls.length, 'times');
    console.log('mockUploadToMinio called:', mockUploadToMinio.mock.calls.length, 'times');
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBeDefined();

    createdVariantId = data.data[0].id;
  });

  test('POST /assets/publish copies to final path', async () => {
    const originalFetch = global.fetch;
    
    // Mock fetch to handle the signed URL calls from executePublishAsset
    (global as any).fetch = jestGlobals.fn().mockImplementation((url: string, init?: RequestInit) => {
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
      // Test publishing a variant
      const res = await authFetch(`http://localhost:${port}/assets/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: createdVariantId,
        }),
      });
      
      const data = await res.json();
      console.log('publish variant status:', res.status, 'body:', JSON.stringify(data));
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.final_path).toBeDefined();

      // Verify DB update for variant
      const check = await oltpPool.query(`SELECT final_path FROM asset_variants WHERE id = $1`, [createdVariantId]);
      expect(check.rows[0].final_path).toBeTruthy();
      
      expect(mockSignMinioUrl).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('POST /assets/publish copies base to final path', async () => {
    const originalFetch = global.fetch;
    
    // Mock fetch to handle the signed URL calls from executePublishAsset
    (global as any).fetch = jestGlobals.fn().mockImplementation((url: string, init?: RequestInit) => {
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
      // Test publishing a base
      const res = await authFetch(`http://localhost:${port}/assets/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_id: createdBaseId,
        }),
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
    (global as any).fetch = jestGlobals.fn().mockImplementation((url: string, init?: RequestInit) => {
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
    (global as any).fetch = jestGlobals.fn().mockImplementation((url: string, init?: RequestInit) => {
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
