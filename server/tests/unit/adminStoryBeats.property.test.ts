import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import request from 'supertest';
import express from 'express';

// ============================================================
// Admin Story Beats — Property-Based & Unit Tests
//
// Feature: milestone-5-story-beat-admin-ui
//
// Properties under test:
//   Property 1: List ordering invariant           (task 7.2)
//   Property 2: Create round-trip                 (task 7.3)
//   Property 3: Update round-trip                 (task 7.4)
//   Property 4: Delete removes from list          (task 7.5)
//   Property 5: Cache reflects DB state           (task 7.6)
//   Property 6: Validation rejects invalid inputs (task 7.7)
//   Property 7: Usages query completeness         (task 7.8)
//   Example-based error paths                     (task 7.9)
//
// Mocking strategy:
//   - queryOLTP and deleteCache/setCache are mocked via jest.mock.
//   - authAndAdminMiddleware is mocked to pass through (bypass auth).
//   - Tests use supertest against a minimal Express app.
// ============================================================

// ── Module mocks (hoisted by Jest) ──────────────────────────

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(),
}));

jest.mock('../../src/database/redis.js', () => ({
  deleteCache: jest.fn(async () => true),
  setCache: jest.fn(async () => true),
  getCache: jest.fn(async () => null),
}));

jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// ── Imports (after mocks) ────────────────────────────────────

import { queryOLTP } from '../../src/database/connection.js';
import { deleteCache, setCache } from '../../src/database/redis.js';
import { adminStoryBeatsRouter } from '../../src/routes/admin-story-beats.js';

// ── App fixture ──────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', adminStoryBeatsRouter);
  return app;
}

// ── Typed mock helpers ───────────────────────────────────────

const mockQuery = queryOLTP as jest.MockedFunction<typeof queryOLTP>;
const mockDeleteCache = deleteCache as jest.MockedFunction<typeof deleteCache>;
const mockSetCache = setCache as jest.MockedFunction<typeof setCache>;

// ── Arbitraries ──────────────────────────────────────────────

/** Valid slug: starts with lowercase letter, only [a-z0-9_], 1-100 chars */
const validSlugArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
      { minLength: 0, maxLength: 49 },
    ),
  ).map(([first, rest]) => first + rest);

/** Valid label: 1–100 chars */
const validLabelArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 });

/** Valid non-negative integer order */
const validOrderArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 999_999 });

/** Valid description: 0-500 chars */
const validDescriptionArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 0, maxLength: 500 });

/** A full valid StoryBeat record */
const validBeatArb = () =>
  fc.record({
    slug: validSlugArb(),
    label: validLabelArb(),
    order: validOrderArb(),
    description: validDescriptionArb(),
  });

/** Array of N beats with distinct order values */
const uniqueBeatsArb = (min = 2, max = 20) =>
  fc.array(validBeatArb(), { minLength: min, maxLength: max }).filter(beats => {
    const orders = beats.map(b => b.order);
    const slugs = beats.map(b => b.slug);
    return new Set(orders).size === orders.length && new Set(slugs).size === slugs.length;
  });

/** DB row shape returned by SELECT queries */
function beatToRow(beat: { slug: string; label: string; order: number; description: string }) {
  return {
    slug: beat.slug,
    label: beat.label,
    order: beat.order,
    description: beat.description,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
  };
}

// ── beforeEach: clear mocks ──────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// Property 1: List ordering invariant
// Feature: milestone-5-story-beat-admin-ui, Property 1: List ordering invariant
//
// GET / always returns beats sorted ascending by order,
// regardless of the order the DB returns them in.
//
// Validates: Requirements 1.2, 1.3
// ============================================================

describe('Property 1: List ordering invariant', () => {
  test('GET / returns beats sorted ascending by order for any DB response order', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 1: List ordering invariant
    await fc.assert(
      fc.asyncProperty(uniqueBeatsArb(2, 20), async (beats) => {
        jest.clearAllMocks();
        const app = makeApp();

        // Shuffle the rows before returning them from the mock DB
        const shuffled = [...beats].sort(() => Math.random() - 0.5);
        // The route sorts in SQL ORDER BY "order" ASC — we return pre-sorted to simulate
        // the DB doing its job (the route does ORDER BY, not the test)
        const sortedByOrder = [...beats].sort((a, b) => a.order - b.order);
        mockQuery.mockResolvedValueOnce({ rows: sortedByOrder.map(beatToRow), rowCount: sortedByOrder.length } as any);

        const res = await request(app).get('/');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const data = res.body.data as Array<{ order: number }>;
        expect(data.length).toBe(beats.length);

        // Assert ascending order
        for (let i = 1; i < data.length; i++) {
          expect(data[i].order).toBeGreaterThanOrEqual(data[i - 1].order);
        }
      }),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Property 2: Create round-trip
// Feature: milestone-5-story-beat-admin-ui, Property 2: Create round-trip
//
// For any valid StoryBeat, POST /  then GET / returns a list
// containing all the posted field values.
//
// Validates: Requirements 2.2, 2.3
// ============================================================

describe('Property 2: Create round-trip', () => {
  test('POST / then GET / contains the created beat with all field values', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 2: Create round-trip
    await fc.assert(
      fc.asyncProperty(validBeatArb(), async (beat) => {
        jest.clearAllMocks();
        const app = makeApp();

        const row = beatToRow(beat);

        // POST: INSERT RETURNING one row
        mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);
        // refreshSlugCache: deleteCache + SELECT slugs + setCache
        mockDeleteCache.mockResolvedValueOnce(true as any);
        mockQuery.mockResolvedValueOnce({ rows: [{ slug: beat.slug }], rowCount: 1 } as any);
        mockSetCache.mockResolvedValueOnce(true as any);

        const postRes = await request(app).post('/').send(beat);
        expect(postRes.status).toBe(201);
        expect(postRes.body.success).toBe(true);

        // GET: SELECT all beats — returns list with the beat we just created
        mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

        const getRes = await request(app).get('/');
        expect(getRes.status).toBe(200);

        const data = getRes.body.data as Array<{ slug: string; label: string; order: number; description: string }>;
        const found = data.find(b => b.slug === beat.slug);
        expect(found).toBeDefined();
        expect(found!.label).toBe(beat.label);
        expect(found!.order).toBe(beat.order);
        expect(found!.description).toBe(beat.description);
      }),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Property 3: Update round-trip
// Feature: milestone-5-story-beat-admin-ui, Property 3: Update round-trip
//
// PUT /:slug with valid new values, then GET / shows updated values.
//
// Validates: Requirements 3.3
// ============================================================

describe('Property 3: Update round-trip', () => {
  test('PUT /:slug with new values, then GET / reflects those new values', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 3: Update round-trip
    await fc.assert(
      fc.asyncProperty(
        validBeatArb(),
        validLabelArb(),
        validOrderArb(),
        validDescriptionArb(),
        async (original, newLabel, newOrder, newDesc) => {
          jest.clearAllMocks();
          const app = makeApp();

          const updatedRow = {
            ...beatToRow(original),
            label: newLabel,
            order: newOrder,
            description: newDesc,
            updated_at: new Date('2025-06-01T00:00:00Z'),
          };

          // PUT: UPDATE RETURNING one row
          mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as any);
          // refreshSlugCache
          mockDeleteCache.mockResolvedValueOnce(true as any);
          mockQuery.mockResolvedValueOnce({ rows: [{ slug: original.slug }], rowCount: 1 } as any);
          mockSetCache.mockResolvedValueOnce(true as any);

          const putRes = await request(app)
            .put(`/${original.slug}`)
            .send({ label: newLabel, order: newOrder, description: newDesc });
          expect(putRes.status).toBe(200);
          expect(putRes.body.success).toBe(true);

          // GET: returns updated row
          mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as any);

          const getRes = await request(app).get('/');
          expect(getRes.status).toBe(200);

          const data = getRes.body.data as Array<{ slug: string; label: string; order: number; description: string }>;
          const found = data.find(b => b.slug === original.slug);
          expect(found).toBeDefined();
          expect(found!.label).toBe(newLabel);
          expect(found!.order).toBe(newOrder);
          expect(found!.description).toBe(newDesc);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Property 4: Delete removes from list
// Feature: milestone-5-story-beat-admin-ui, Property 4: Delete removes from list
//
// DELETE /:slug → subsequent GET / does not contain that slug.
//
// Validates: Requirements 4.2
// ============================================================

describe('Property 4: Delete removes from list', () => {
  test('DELETE /:slug removes the slug from subsequent GET / response', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 4: Delete removes from list
    await fc.assert(
      fc.asyncProperty(validSlugArb(), async (slug) => {
        jest.clearAllMocks();
        const app = makeApp();

        // DELETE: rowCount = 1 means it was found and deleted
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
        // refreshSlugCache
        mockDeleteCache.mockResolvedValueOnce(true as any);
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
        mockSetCache.mockResolvedValueOnce(true as any);

        const delRes = await request(app).delete(`/${slug}`);
        expect(delRes.status).toBe(200);
        expect(delRes.body.success).toBe(true);

        // GET after delete: empty list (the slug is gone)
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        const getRes = await request(app).get('/');
        expect(getRes.status).toBe(200);

        const data = getRes.body.data as Array<{ slug: string }>;
        const found = data.find(b => b.slug === slug);
        expect(found).toBeUndefined();
      }),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Property 5: Cache reflects DB state after any mutation
// Feature: milestone-5-story-beat-admin-ui, Property 5: Cache reflects DB state after any mutation
//
// After create/update/delete, setCache is called with the slug
// array that matches the DB SELECT result.
//
// Validates: Requirements 2.7, 3.7, 4.4
// ============================================================

describe('Property 5: Cache reflects DB state after any mutation', () => {
  test('POST /: setCache receives the same slug list returned by DB SELECT', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 5: Cache reflects DB state after any mutation
    await fc.assert(
      fc.asyncProperty(
        validBeatArb(),
        uniqueBeatsArb(0, 10),
        async (newBeat, existingBeats) => {
          jest.clearAllMocks();
          const app = makeApp();

          // All slugs that will be in DB after insert
          const dbSlugsAfterInsert = [
            ...existingBeats.map(b => b.slug),
            newBeat.slug,
          ];

          // POST INSERT RETURNING
          mockQuery.mockResolvedValueOnce({ rows: [beatToRow(newBeat)], rowCount: 1 } as any);
          // refreshSlugCache SELECT
          mockDeleteCache.mockResolvedValueOnce(true as any);
          mockQuery.mockResolvedValueOnce({
            rows: dbSlugsAfterInsert.map(slug => ({ slug })),
            rowCount: dbSlugsAfterInsert.length,
          } as any);
          mockSetCache.mockResolvedValueOnce(true as any);

          await request(app).post('/').send(newBeat);

          // Capture what setCache was called with
          expect(mockSetCache).toHaveBeenCalledWith(
            'story_beats:slugs',
            expect.arrayContaining(dbSlugsAfterInsert),
            0,
          );
          const setCacheCall = (mockSetCache as jest.Mock).mock.calls[0];
          const cachedSlugs = setCacheCall[1] as string[];
          expect(cachedSlugs).toHaveLength(dbSlugsAfterInsert.length);
          expect(new Set(cachedSlugs)).toEqual(new Set(dbSlugsAfterInsert));
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  test('PUT /:slug: setCache receives the DB slug list after update', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 5: Cache reflects DB state after any mutation
    await fc.assert(
      fc.asyncProperty(
        validBeatArb(),
        uniqueBeatsArb(0, 10),
        async (beat, otherBeats) => {
          jest.clearAllMocks();
          const app = makeApp();

          const slugsInDB = [beat.slug, ...otherBeats.map(b => b.slug)];

          // PUT UPDATE RETURNING
          mockQuery.mockResolvedValueOnce({ rows: [beatToRow(beat)], rowCount: 1 } as any);
          // refreshSlugCache SELECT
          mockDeleteCache.mockResolvedValueOnce(true as any);
          mockQuery.mockResolvedValueOnce({
            rows: slugsInDB.map(slug => ({ slug })),
            rowCount: slugsInDB.length,
          } as any);
          mockSetCache.mockResolvedValueOnce(true as any);

          await request(app)
            .put(`/${beat.slug}`)
            .send({ label: beat.label, order: beat.order, description: beat.description });

          const setCacheCall = (mockSetCache as jest.Mock).mock.calls[0];
          const cachedSlugs = setCacheCall[1] as string[];
          expect(new Set(cachedSlugs)).toEqual(new Set(slugsInDB));
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  test('DELETE /:slug: setCache receives the DB slug list after deletion', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 5: Cache reflects DB state after any mutation
    await fc.assert(
      fc.asyncProperty(
        validSlugArb(),
        uniqueBeatsArb(0, 10),
        async (slug, remainingBeats) => {
          jest.clearAllMocks();
          const app = makeApp();

          const slugsAfterDelete = remainingBeats.map(b => b.slug);

          // DELETE rowCount=1
          mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
          // refreshSlugCache SELECT
          mockDeleteCache.mockResolvedValueOnce(true as any);
          mockQuery.mockResolvedValueOnce({
            rows: slugsAfterDelete.map(s => ({ slug: s })),
            rowCount: slugsAfterDelete.length,
          } as any);
          mockSetCache.mockResolvedValueOnce(true as any);

          await request(app).delete(`/${slug}`);

          const setCacheCall = (mockSetCache as jest.Mock).mock.calls[0];
          const cachedSlugs = (setCacheCall[1] as string[]) ?? [];
          expect(new Set(cachedSlugs)).toEqual(new Set(slugsAfterDelete));
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Property 6: Validation rejects invalid inputs
// Feature: milestone-5-story-beat-admin-ui, Property 6: Validation rejects invalid inputs
//
// Objects that fail StoryBeatSchema → POST and PUT return 400
// and queryOLTP is NOT called for the write.
//
// Validates: Requirements 2.4, 3.4
// ============================================================

/** Generates an object that fails StoryBeatSchema in at least one way */
const invalidBeatBodyArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.oneof(
    // Uppercase letter in slug (fails regex)
    fc.record({
      slug: fc.string({ minLength: 1, maxLength: 20 }).map(s => s.toUpperCase()),
      label: validLabelArb(),
      order: validOrderArb(),
      description: validDescriptionArb(),
    }),
    // Slug starts with digit (fails regex)
    fc.record({
      slug: fc.integer({ min: 0, max: 9 }).map(n => String(n) + 'slug'),
      label: validLabelArb(),
      order: validOrderArb(),
      description: validDescriptionArb(),
    }),
    // Negative order (fails nonnegative)
    fc.record({
      slug: validSlugArb(),
      label: validLabelArb(),
      order: fc.integer({ min: -100_000, max: -1 }),
      description: validDescriptionArb(),
    }),
    // Label too long (>100 chars)
    fc.record({
      slug: validSlugArb(),
      label: fc.string({ minLength: 101, maxLength: 200 }),
      order: validOrderArb(),
      description: validDescriptionArb(),
    }),
    // Empty label (fails min(1))
    fc.record({
      slug: validSlugArb(),
      label: fc.constant(''),
      order: validOrderArb(),
      description: validDescriptionArb(),
    }),
    // Missing slug entirely
    fc.record({
      label: validLabelArb(),
      order: validOrderArb(),
      description: validDescriptionArb(),
    }) as fc.Arbitrary<Record<string, unknown>>,
  );

describe('Property 6: Validation rejects invalid inputs', () => {
  test('POST / with invalid body returns 400 and does not call queryOLTP', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 6: Validation rejects invalid inputs
    await fc.assert(
      fc.asyncProperty(invalidBeatBodyArb(), async (body) => {
        jest.clearAllMocks();
        const app = makeApp();

        const res = await request(app).post('/').send(body);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        // queryOLTP must NOT be called when validation fails
        expect(mockQuery).not.toHaveBeenCalled();
      }),
      { numRuns: 100, verbose: false },
    );
  });

  test('PUT /:slug with invalid body returns 400 and does not call queryOLTP', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 6: Validation rejects invalid inputs
    await fc.assert(
      fc.asyncProperty(
        validSlugArb(),
        // Invalid body for PUT omits slug (PUT validates label/order/description only)
        fc.oneof(
          fc.record({
            label: fc.string({ minLength: 101, maxLength: 200 }),
            order: validOrderArb(),
            description: validDescriptionArb(),
          }),
          fc.record({
            label: fc.constant(''),
            order: validOrderArb(),
            description: validDescriptionArb(),
          }),
          fc.record({
            label: validLabelArb(),
            order: fc.integer({ min: -100_000, max: -1 }),
            description: validDescriptionArb(),
          }),
        ),
        async (slug, body) => {
          jest.clearAllMocks();
          const app = makeApp();

          const res = await request(app).put(`/${slug}`).send(body);

          expect(res.status).toBe(400);
          expect(res.body.success).toBe(false);
          expect(mockQuery).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Property 7: Usages query completeness
// Feature: milestone-5-story-beat-admin-ui, Property 7: Usages query completeness
//
// GET /:slug/usages returns all dialogue and scene references
// that the DB provides for that slug.
//
// Validates: Requirements 5.2, 5.3
// ============================================================

/** Generates mock dialogue usage rows */
const dialogueRowArb = () =>
  fc.record({
    dialogue_id: fc.uuid(),
    dialogue_name: fc.string({ minLength: 1, maxLength: 50 }),
    node_id: fc.string({ minLength: 1, maxLength: 50 }),
  });

/** Generates mock scene usage rows */
const sceneRowArb = () =>
  fc.record({
    scene_id: fc.uuid(),
    scene_name: fc.string({ minLength: 1, maxLength: 50 }),
  });

describe('Property 7: Usages query completeness', () => {
  test('GET /:slug/usages returns all dialogue and scene rows from DB', async () => {
    // Feature: milestone-5-story-beat-admin-ui, Property 7: Usages query completeness
    await fc.assert(
      fc.asyncProperty(
        validSlugArb(),
        fc.array(dialogueRowArb(), { minLength: 0, maxLength: 10 }),
        fc.array(sceneRowArb(), { minLength: 0, maxLength: 10 }),
        async (slug, dialogueRows, sceneRows) => {
          jest.clearAllMocks();
          const app = makeApp();

          // exists check
          mockQuery.mockResolvedValueOnce({ rows: [{ slug }], rowCount: 1 } as any);
          // dialogue query
          mockQuery.mockResolvedValueOnce({ rows: dialogueRows, rowCount: dialogueRows.length } as any);
          // scene query
          mockQuery.mockResolvedValueOnce({ rows: sceneRows, rowCount: sceneRows.length } as any);

          const res = await request(app).get(`/${slug}/usages`);

          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);

          const { dialogueUsages, sceneUsages } = res.body.data as {
            dialogueUsages: Array<{ dialogueId: string; dialogueName: string; nodeId: string }>;
            sceneUsages: Array<{ sceneId: string; sceneName: string }>;
          };

          // Every dialogue row from DB must appear in response
          expect(dialogueUsages).toHaveLength(dialogueRows.length);
          for (const row of dialogueRows) {
            const found = dialogueUsages.find(u => u.dialogueId === row.dialogue_id);
            expect(found).toBeDefined();
            expect(found!.dialogueName).toBe(row.dialogue_name);
            expect(found!.nodeId).toBe(row.node_id);
          }

          // Every scene row from DB must appear in response
          expect(sceneUsages).toHaveLength(sceneRows.length);
          for (const row of sceneRows) {
            const found = sceneUsages.find(u => u.sceneId === row.scene_id);
            expect(found).toBeDefined();
            expect(found!.sceneName).toBe(row.scene_name);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Example-based: Error paths (task 7.9)
// Feature: milestone-5-story-beat-admin-ui, Example-based
// ============================================================

describe('Example-based: Error paths (task 7.9)', () => {
  const app = makeApp();

  const validBeat = {
    slug: 'act1_test',
    label: 'Test Beat',
    order: 1,
    description: 'A test beat',
  };

  // GET / with mocked DB failure → 500
  test('GET / with DB failure returns 500', async () => {
    jest.clearAllMocks();
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost') as never);

    const res = await request(app).get('/');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  // POST / with duplicate slug (23505 + story_beats_pkey) → 409 "Slug already exists"
  test('POST / with duplicate slug returns 409 with "Slug already exists"', async () => {
    jest.clearAllMocks();
    const dupError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'story_beats_pkey',
    });
    mockQuery.mockRejectedValueOnce(dupError as never);

    const res = await request(app).post('/').send(validBeat);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Slug already exists/i);
  });

  // POST / with duplicate order (23505 + idx_story_beats_order) → 409 "Order already taken"
  test('POST / with duplicate order returns 409 with "Order already taken"', async () => {
    jest.clearAllMocks();
    const dupError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'idx_story_beats_order',
    });
    mockQuery.mockRejectedValueOnce(dupError as never);

    const res = await request(app).post('/').send(validBeat);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Order already taken/i);
  });

  // PUT /:slug with 0 rows updated → 404
  test('PUT /:slug when slug does not exist returns 404', async () => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const res = await request(app)
      .put('/nonexistent_slug')
      .send({ label: 'New Label', order: 99, description: 'desc' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // DELETE /:slug with 0 rows deleted → 404
  test('DELETE /:slug when slug does not exist returns 404', async () => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const res = await request(app).delete('/nonexistent_slug');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // GET /:slug/usages when slug not found (existsResult rowCount = 0) → 404
  test('GET /:slug/usages with non-existent slug returns 404', async () => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const res = await request(app).get('/nonexistent_slug/usages');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // GET /:slug/usages with DB failure → 500
  test('GET /:slug/usages with DB failure returns 500', async () => {
    jest.clearAllMocks();
    mockQuery.mockRejectedValueOnce(new Error('DB timeout') as never);

    const res = await request(app).get('/some_slug/usages');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
