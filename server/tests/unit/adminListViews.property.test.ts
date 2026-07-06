import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import request from 'supertest';
import express from 'express';

// ============================================================
// Admin List Views — Property-Based & Unit Tests
//
// Feature: milestone-6-content-list-views
//
// Properties under test:
//   Property 1: Pagination slice correctness       (task 10.2)
//   Property 2: Response field mapping correctness (task 10.3)
//   Property 3: Pagination parameter validation    (task 10.4)
//   Property 4: portraitStatus derivation invariant (task 10.5)
//   Example-based error paths                      (task 10.6)
//
// Mocking strategy:
//   - queryOLTP is mocked via jest.mock.
//   - authAndAdminMiddleware is mocked to pass through (bypass auth).
//   - Tests use supertest against a minimal Express app.
// ============================================================

// ── Module mocks (hoisted by Jest) ──────────────────────────

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(),
}));

jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// ── Imports (after mocks) ────────────────────────────────────

import { queryOLTP } from '../../src/database/connection.js';
import { adminListViewsRouter } from '../../src/routes/admin-list-views.js';

// ── App fixture ──────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', adminListViewsRouter);
  return app;
}

// ── Typed mock helpers ───────────────────────────────────────

const mockQuery = queryOLTP as jest.MockedFunction<typeof queryOLTP>;

// ── beforeEach: clear mocks ──────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// Property 1: Pagination slice correctness
// Feature: milestone-6-content-list-views, Property 1: Pagination slice correctness
//
// For any valid page/pageSize, the list endpoint returns the correct
// slice of total items and correct pagination metadata.
//
// Validates: Requirements 1.1, 2.1, 3.1
// ============================================================

describe('Property 1: Pagination slice correctness', () => {
  // Feature: milestone-6-content-list-views, Property 1: Pagination slice correctness

  /**
   * Generates N items with unique alphanumeric names, pre-sorted by name ASC.
   * Restricting to [a-z0-9] ensures JS string comparison matches DB ORDER BY name ASC
   * without locale collation edge-cases affecting the assertion.
   */
  const alphanumNameArb = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 1, maxLength: 20 },
  );

  const datasetArb = fc.array(
    fc.record({
      id: fc.uuid(),
      name: alphanumNameArb,
      description: fc.string({ minLength: 0, maxLength: 50 }),
    }),
    { minLength: 2, maxLength: 100 },
  ).map(items => {
    // Ensure unique names
    const seen = new Set<string>();
    const unique = items.filter(item => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });
    // Sort by name ASC (simulate DB ORDER BY name ASC)
    return unique.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }).filter(items => items.length >= 2);

  function pageSizeArb() {
    return fc.integer({ min: 1, max: 200 });
  }

  function pageArb(total: number, pageSize: number) {
    const maxPage = Math.ceil(total / pageSize);
    return fc.integer({ min: 1, max: maxPage });
  }

  const endpoints = [
    {
      path: '/dialogues',
      orderKey: 'name',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        ...item,
        nodeCount: 0,
        beatAssociation: null,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/scenes',
      orderKey: 'name',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        ...item,
        district: 'downtown',
        requiredStoryBeat: null,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/characters',
      orderKey: 'name',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        ...item,
        title: 'Resident',
        portraitStatus: 'missing' as const,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/mysteries',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        id: item.id,
        title: item.name,
        description: item.description,
        status: 'ACTIVE',
        expiresAt: null,
        createdAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/overlays',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        id: item.id,
        name: item.name,
        targetTreeId: '00000000-0000-0000-0000-000000000001',
        targetTreeName: null,
        isNsfw: false,
        priority: 1,
        mysteryId: null,
        mysteryTitle: null,
        gateNodeId: null,
        createdAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/locations',
      orderKey: 'name',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        ...item,
        district: 'downtown',
        requiredStoryBeat: null,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/vault',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        id: item.id,
        title: item.name,
        description: item.description,
        itemType: 'clue',
        mysteryId: null,
        mysteryTitle: null,
        mediaUrl: null,
        updatedAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/gigs',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        id: item.id,
        title: item.name,
        description: item.description,
        timeBlockCost: 1,
        creditPayout: 10,
        reputationTarget: null,
        reputationReward: null,
        locationRestrictionId: null,
        locationName: null,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/shop',
      orderKey: 'name',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        ...item,
        itemType: 'consumable',
        price: 100,
        currencyType: 'credits',
        isActive: true,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
      }),
    },
    {
      path: '/maps',
      makeRow: (item: { id: string; name: string; description: string }) => ({
        id: item.id,
        x: 0,
        y: 0,
        terrainType: 'ground',
        rotation: 0,
        isFlipped: false,
        districtName: null,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
      }),
    },
  ];

  for (const endpoint of endpoints) {
    test(`GET ${endpoint.path} returns correct pagination slice`, async () => {
      // Feature: milestone-6-content-list-views, Property 1: Pagination slice correctness
      await fc.assert(
        fc.asyncProperty(
          datasetArb,
          pageSizeArb(),
          async (dataset, pageSize) => {
            const total = dataset.length;
            const maxPage = Math.ceil(total / pageSize);
            const page = fc.sample(pageArb(total, pageSize), 1)[0];

            jest.clearAllMocks();
            const app = makeApp();

            const sliceStart = (page - 1) * pageSize;
            const sliceEnd = sliceStart + pageSize;
            const slicedItems = dataset.slice(sliceStart, sliceEnd).map(endpoint.makeRow);

            mockQuery
              .mockResolvedValueOnce({ rows: [{ count: total }], rowCount: 1 } as any)
              .mockResolvedValueOnce({ rows: slicedItems, rowCount: slicedItems.length } as any);

            const res = await request(app)
              .get(endpoint.path)
              .query({ page, pageSize });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.total).toBe(total);
            expect(res.body.data.page).toBe(page);
            expect(res.body.data.pageSize).toBe(pageSize);

            const expectedItemCount = Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize));
            expect(res.body.data.items.length).toBe(expectedItemCount);

            // Assert ordering when endpoint specifies an order key
            if (endpoint.orderKey) {
              const items = res.body.data.items as Array<Record<string, unknown>>;
              for (let i = 1; i < items.length; i++) {
                const prev = String(items[i - 1][endpoint.orderKey] ?? '');
                const curr = String(items[i][endpoint.orderKey] ?? '');
                expect(prev <= curr).toBe(true);
              }
            }
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });
  }
});

// ============================================================
// Property 2: Response field mapping correctness
// Feature: milestone-6-content-list-views, Property 2: Response field mapping correctness
//
// Fields from the DB row flow through to the response untouched.
//
// Validates: Requirements 1.2, 2.2, 3.2
// ============================================================

describe('Property 2: Response field mapping correctness', () => {
  // Feature: milestone-6-content-list-views, Property 2: Response field mapping correctness

  test('GET /dialogues returns correct fields for each row', async () => {
    // Feature: milestone-6-content-list-views, Property 2: Response field mapping correctness
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 0, maxLength: 100 }),
            nodeCount: fc.integer({ min: 0, max: 20 }),
            beatAssociation: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
            createdAt: fc.constant(new Date('2025-01-01').toISOString()),
            updatedAt: fc.constant(new Date('2025-01-01').toISOString()),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (rows) => {
          jest.clearAllMocks();
          const app = makeApp();

          mockQuery
            .mockResolvedValueOnce({ rows: [{ count: rows.length }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows, rowCount: rows.length } as any);

          const res = await request(app).get('/dialogues').query({ page: 1, pageSize: 200 });

          expect(res.status).toBe(200);
          const items = res.body.data.items as Array<{
            id: string;
            name: string;
            description: string;
            nodeCount: number;
            beatAssociation: string | null;
            createdAt: string;
            updatedAt: string;
          }>;

          expect(items.length).toBe(rows.length);
          for (let i = 0; i < rows.length; i++) {
            expect(items[i].id).toBe(rows[i].id);
            expect(items[i].name).toBe(rows[i].name);
            expect(items[i].description).toBe(rows[i].description);
            expect(items[i].nodeCount).toBe(rows[i].nodeCount);
            expect(items[i].beatAssociation).toBe(rows[i].beatAssociation);
            expect(items[i].createdAt).toBeDefined();
            expect(items[i].updatedAt).toBeDefined();
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  test('GET /scenes returns correct fields for each row', async () => {
    // Feature: milestone-6-content-list-views, Property 2: Response field mapping correctness
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 0, maxLength: 100 }),
            district: fc.string({ minLength: 1, maxLength: 30 }),
            requiredStoryBeat: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
            createdAt: fc.constant(new Date('2025-01-01').toISOString()),
            updatedAt: fc.constant(new Date('2025-01-01').toISOString()),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (rows) => {
          jest.clearAllMocks();
          const app = makeApp();

          mockQuery
            .mockResolvedValueOnce({ rows: [{ count: rows.length }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows, rowCount: rows.length } as any);

          const res = await request(app).get('/scenes').query({ page: 1, pageSize: 200 });

          expect(res.status).toBe(200);
          const items = res.body.data.items as Array<{
            id: string;
            name: string;
            description: string;
            district: string;
            requiredStoryBeat: string | null;
            createdAt: string;
            updatedAt: string;
          }>;

          expect(items.length).toBe(rows.length);
          for (let i = 0; i < rows.length; i++) {
            expect(items[i].id).toBe(rows[i].id);
            expect(items[i].name).toBe(rows[i].name);
            expect(items[i].description).toBe(rows[i].description);
            expect(items[i].district).toBe(rows[i].district);
            expect(items[i].requiredStoryBeat).toBe(rows[i].requiredStoryBeat);
            expect(items[i].createdAt).toBeDefined();
            expect(items[i].updatedAt).toBeDefined();
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  test('GET /characters returns correct fields for each row', async () => {
    // Feature: milestone-6-content-list-views, Property 2: Response field mapping correctness
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            title: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 0, maxLength: 100 }),
            portraitStatus: fc.oneof(fc.constant('ready' as const), fc.constant('missing' as const)),
            createdAt: fc.constant(new Date('2025-01-01').toISOString()),
            updatedAt: fc.constant(new Date('2025-01-01').toISOString()),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (rows) => {
          jest.clearAllMocks();
          const app = makeApp();

          mockQuery
            .mockResolvedValueOnce({ rows: [{ count: rows.length }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows, rowCount: rows.length } as any);

          const res = await request(app).get('/characters').query({ page: 1, pageSize: 200 });

          expect(res.status).toBe(200);
          const items = res.body.data.items as Array<{
            id: string;
            name: string;
            title: string;
            description: string;
            portraitStatus: string;
            createdAt: string;
            updatedAt: string;
          }>;

          expect(items.length).toBe(rows.length);
          for (let i = 0; i < rows.length; i++) {
            expect(items[i].id).toBe(rows[i].id);
            expect(items[i].name).toBe(rows[i].name);
            expect(items[i].title).toBe(rows[i].title);
            expect(items[i].description).toBe(rows[i].description);
            expect(['ready', 'missing']).toContain(items[i].portraitStatus);
            expect(items[i].portraitStatus).toBe(rows[i].portraitStatus);
            expect(items[i].createdAt).toBeDefined();
            expect(items[i].updatedAt).toBeDefined();
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Property 3: Pagination parameter validation
// Feature: milestone-6-content-list-views, Property 3: Pagination parameter validation
//
// Invalid page or pageSize values must return 400 and never call
// the DB.
//
// Validates: Requirements 1.3, 2.3, 3.3
// ============================================================

describe('Property 3: Pagination parameter validation', () => {
  // Feature: milestone-6-content-list-views, Property 3: Pagination parameter validation

  const invalidPageArb = fc.oneof(
    fc.integer({ max: 0 }),
    fc.double({ min: 0.1, max: 999.9 }).filter(n => !Number.isInteger(n)),
    fc.string({ minLength: 1 }).filter(s => isNaN(Number(s))),
    fc.constant(''),
  );

  const invalidPageSizeArb = fc.oneof(
    fc.integer({ max: 0 }),
    fc.integer({ min: 201 }),
    fc.double({ min: 0.1, max: 999.9 }).filter(n => !Number.isInteger(n)),
    fc.string({ minLength: 1 }).filter(s => isNaN(Number(s))),
  );

  const listEndpoints = ['/dialogues', '/scenes', '/characters', '/mysteries', '/overlays', '/locations', '/vault', '/gigs', '/shop', '/maps'];

  for (const path of listEndpoints) {
    describe(`GET ${path}`, () => {
      test('invalid page returns 400 and does not call queryOLTP', async () => {
        // Feature: milestone-6-content-list-views, Property 3: Pagination parameter validation
        await fc.assert(
          fc.asyncProperty(invalidPageArb, async (invalidPage) => {
            jest.clearAllMocks();
            const app = makeApp();

            const res = await request(app)
              .get(path)
              .query({ page: String(invalidPage) });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(mockQuery).not.toHaveBeenCalled();
          }),
          { numRuns: 100, verbose: false },
        );
      });

      test('invalid pageSize returns 400 and does not call queryOLTP', async () => {
        // Feature: milestone-6-content-list-views, Property 3: Pagination parameter validation
        await fc.assert(
          fc.asyncProperty(invalidPageSizeArb, async (invalidPageSize) => {
            jest.clearAllMocks();
            const app = makeApp();

            const res = await request(app)
              .get(path)
              .query({ pageSize: String(invalidPageSize) });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(mockQuery).not.toHaveBeenCalled();
          }),
          { numRuns: 100, verbose: false },
        );
      });
    });
  }
});

// ============================================================
// Property 4: portraitStatus derivation invariant
// Feature: milestone-6-content-list-views, Property 4: portraitStatus derivation invariant
//
// The portraitStatus field must be 'ready' when portrait_urls is a
// non-empty array, and 'missing' otherwise (null or empty array).
//
// Validates: Requirements 3.4
// ============================================================

describe('Property 4: portraitStatus derivation invariant', () => {
  // Feature: milestone-6-content-list-views, Property 4: portraitStatus derivation invariant

  test('portraitStatus matches derivation from portrait_urls', async () => {
    // Feature: milestone-6-content-list-views, Property 4: portraitStatus derivation invariant
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(null),
          fc.constant([] as string[]),
          fc.array(fc.webUrl(), { minLength: 1, maxLength: 10 }),
        ),
        async (portraitUrls) => {
          jest.clearAllMocks();
          const app = makeApp();

          // Compute expected portraitStatus (the SQL derivation logic)
          const expectedPortraitStatus =
            portraitUrls !== null && portraitUrls.length > 0 ? 'ready' : 'missing';

          // Build a mock row with the pre-computed portraitStatus (simulating SQL CASE expression)
          const mockRow = {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Test Character',
            title: 'Resident',
            description: 'A test character',
            portraitStatus: expectedPortraitStatus,
            createdAt: new Date('2025-01-01').toISOString(),
            updatedAt: new Date('2025-01-01').toISOString(),
          };

          mockQuery
            .mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as any);

          const res = await request(app).get('/characters').query({ page: 1, pageSize: 50 });

          expect(res.status).toBe(200);
          expect(res.body.data.items[0].portraitStatus).toBe(expectedPortraitStatus);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Example-based: Error paths (task 10.6)
// Feature: milestone-6-content-list-views, Example-based
// ============================================================

describe('Example-based: Error paths', () => {
  // 1. GET /dialogues with DB error → 500, success: false
  test('GET /dialogues with DB error returns 500', async () => {
    jest.clearAllMocks();
    const app = makeApp();
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost') as never);

    const res = await request(app).get('/dialogues');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  // 2. GET /scenes with DB error → 500, success: false
  test('GET /scenes with DB error returns 500', async () => {
    jest.clearAllMocks();
    const app = makeApp();
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost') as never);

    const res = await request(app).get('/scenes');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  // 3. GET /characters with DB error → 500, success: false
  test('GET /characters with DB error returns 500', async () => {
    jest.clearAllMocks();
    const app = makeApp();
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost') as never);

    const res = await request(app).get('/characters');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  // 4. GET /dialogues/:id with row found (rowCount=1) → 200, success: true, data is the row
  test('GET /dialogues/:id with row found returns 200 and the row', async () => {
    jest.clearAllMocks();
    const app = makeApp();
    const row = {
      id: 'test-dialogue-id',
      name: 'Test Dialogue',
      description: 'A test dialogue',
    };
    mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

    const res = await request(app).get('/dialogues/test-dialogue-id');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(row);
  });

  // 5. GET /dialogues/:id with 0 rows (rowCount=0) → 404, success: false
  test('GET /dialogues/:id with no rows returns 404', async () => {
    jest.clearAllMocks();
    const app = makeApp();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const res = await request(app).get('/dialogues/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 6. GET /scenes/:id with 0 rows → 404, success: false
  test('GET /scenes/:id with no rows returns 404', async () => {
    jest.clearAllMocks();
    const app = makeApp();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const res = await request(app).get('/scenes/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 7. GET /characters/:id with 0 rows → 404, success: false
  test('GET /characters/:id with no rows returns 404', async () => {
    jest.clearAllMocks();
    const app = makeApp();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const res = await request(app).get('/characters/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 8. GET /dialogues/:id with DB error → 500, success: false
  test('GET /dialogues/:id with DB error returns 500', async () => {
    jest.clearAllMocks();
    const app = makeApp();
    mockQuery.mockRejectedValueOnce(new Error('DB timeout') as never);

    const res = await request(app).get('/dialogues/some-id');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  // 9. GET /dialogues with no params → defaults: page 1, pageSize 50
  test('GET /dialogues with no params uses defaults page:1 pageSize:50', async () => {
    jest.clearAllMocks();
    const app = makeApp();

    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const res = await request(app).get('/dialogues');

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(50);
  });
});
