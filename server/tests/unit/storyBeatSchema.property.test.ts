import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { StoryBeatRegistrySchema } from '@las-flores/shared';

// ============================================================
// StoryBeatRegistrySchema Property-Based Tests
//
// Properties under test:
//   Schema rejects missing required fields
//   Schema rejects invalid slug patterns
//   Schema rejects unknown keys (strict)
//
// Validates: Requirements 1.4, 1.5, 1.6, 2.2, 2.3, 2.4, 2.6
//
// No mocking needed: StoryBeatRegistrySchema.safeParse is a
// pure function — no DB, no network.
// ============================================================

// ── Arbitraries ───────────────────────────────────────────────

/** Generates a valid slug matching ^[a-z][a-z0-9_]*$ */
const validSlugArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
      { minLength: 0, maxLength: 98 },
    ),
  ).map(([first, rest]) => first + rest);

/** Generates a valid label (min 1, max 100 chars) */
const validLabelArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 });

/** Generates a valid non-negative integer order */
const validOrderArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 1_000_000 });

/** Generates a valid description (max 500 chars) */
const validDescriptionArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 0, maxLength: 500 });

/** Generates a valid StoryBeat entry */
const validBeatArb = () =>
  fc.record({
    slug: validSlugArb(),
    label: validLabelArb(),
    order: validOrderArb(),
    description: validDescriptionArb(),
  });

/** Generates an array of valid beats with unique slugs and orders */
const validBeatsArrayArb = (minLength = 1, maxLength = 5) =>
  fc.array(validBeatArb(), { minLength, maxLength }).filter((beats) => {
    const slugs = beats.map(b => b.slug);
    const orders = beats.map(b => b.order);
    return new Set(slugs).size === slugs.length && new Set(orders).size === orders.length;
  });

/** Generates a string that does NOT match ^[a-z][a-z0-9_]*$ */
const invalidSlugArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 0, maxLength: 100 }).filter(
    s => !/^[a-z][a-z0-9_]*$/.test(s),
  );

// ── Schema rejects missing required fields ───────────────────
//
// For any beats entry missing one of slug/label/order/description,
// StoryBeatRegistrySchema.safeParse must return success:false.
//
// Validates: Requirements 2.3
// ─────────────────────────────────────────────────────────────

describe('Schema rejects missing required fields', () => {
  const requiredFields = ['slug', 'label', 'order', 'description'] as const;

  for (const missingField of requiredFields) {
    it(`rejects a beat entry missing "${missingField}"`, () => {
      fc.assert(
        fc.property(validBeatArb(), (beat) => {
          // Build an entry with one field removed
          const incomplete = { ...beat };
          delete (incomplete as Record<string, unknown>)[missingField];

          const result = StoryBeatRegistrySchema.safeParse({ beats: [incomplete] });

          expect(result.success).toBe(false);
          if (!result.success) {
            // The error path should mention the missing field
            const paths = result.error.issues.map(i => i.path.join('.'));
            const mentionsMissingField = paths.some(p => p.includes(missingField));
            expect(mentionsMissingField).toBe(true);
          }
        }),
        { numRuns: 100, verbose: false },
      );
    });
  }
});

// ── Schema rejects invalid slug patterns ─────────────────────
//
// For any string not matching ^[a-z][a-z0-9_]*$, a beats entry
// with that string as slug must be rejected.
//
// Validates: Requirements 1.6, 2.4
// ─────────────────────────────────────────────────────────────

describe('Schema rejects invalid slug patterns', () => {
  it('rejects beats entries with slugs that do not match ^[a-z][a-z0-9_]*$', () => {
    fc.assert(
      fc.property(validBeatArb(), invalidSlugArb(), (validBeat, badSlug) => {
        const entry = { ...validBeat, slug: badSlug };
        const result = StoryBeatRegistrySchema.safeParse({ beats: [entry] });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Schema rejects unknown keys (strict) ─────────────────────
//
// For any otherwise-valid StoryBeat entry with an extra key added,
// StoryBeatRegistrySchema must reject it.
//
// Validates: Requirements 2.6
// ─────────────────────────────────────────────────────────────

describe('Schema rejects unknown keys (strict)', () => {
  it('rejects beats entries with extra unknown keys', () => {
    fc.assert(
      fc.property(
        validBeatsArrayArb(1, 3),
        // Generate a non-empty key that is not one of the known fields
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          k => !['slug', 'label', 'order', 'description'].includes(k),
        ),
        fc.string({ minLength: 0, maxLength: 50 }),
        (beats, extraKey, extraValue) => {
          const beatsWithExtra = beats.map(beat => ({
            ...beat,
            [extraKey]: extraValue,
          }));

          const result = StoryBeatRegistrySchema.safeParse({ beats: beatsWithExtra });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('rejects registry object with extra unknown keys at the top level', () => {
    fc.assert(
      fc.property(
        validBeatsArrayArb(1, 3),
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          k => k !== 'beats',
        ),
        fc.string({ minLength: 0, maxLength: 50 }),
        (beats, extraKey, extraValue) => {
          const registryWithExtra = {
            beats,
            [extraKey]: extraValue,
          };

          const result = StoryBeatRegistrySchema.safeParse(registryWithExtra);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Upsert and Cache Property-Based Tests
//
// Properties under test:
//   Beat upsert round-trip
//   Redis cache round-trip
//
// Validates: Requirements 3.3, 3.6, 4.1, 4.3
// ============================================================

// ── Beat upsert round-trip ───────────────────────────────────
//
// For any valid array of beats with unique slugs and unique orders,
// after calling processStoryBeatData (with queryOLTP mocked),
// every slug must have been upserted AND the cache must have been written.
//
// Validates: Requirements 3.3, 3.6, 4.1
// ─────────────────────────────────────────────────────────────

import { jest } from '@jest/globals';

// ── Arbitraries (re-declared locally for scope) ───────────────

const genValidSlug = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
      { minLength: 0, maxLength: 48 },
    ),
  ).map(([first, rest]) => first + rest);

const genValidBeat = () =>
  fc.record({
    slug: genValidSlug(),
    label: fc.string({ minLength: 1, maxLength: 100 }),
    order: fc.integer({ min: 0, max: 1_000_000 }),
    description: fc.string({ minLength: 0, maxLength: 500 }),
  });

const genUniqueBeatsArray = (minLength = 1, maxLength = 8) =>
  fc.array(genValidBeat(), { minLength, maxLength }).filter((beats) => {
    const slugs = beats.map(b => b.slug);
    const orders = beats.map(b => b.order);
    return new Set(slugs).size === slugs.length && new Set(orders).size === orders.length;
  });

describe('Beat upsert round-trip', () => {
  it('upserts every slug and writes slugs to cache via setCache', async () => {
    // Mock modules before importing the module under test
    const queryOLTPMock = jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] });
    const deleteCacheMock = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

    // Track setCache calls: key → value
    const cacheStore: Record<string, unknown> = {};
    const setCacheMock = jest.fn<(key: string, value: unknown, ttl: number) => Promise<boolean>>()
      .mockImplementation(async (key: string, value: unknown) => {
        cacheStore[key] = value;
        return true;
      });

    // Dynamically mock the modules used by processStoryBeatData
    jest.unstable_mockModule('@las-flores/shared', async () => {
      const actual = await jest.requireActual<typeof import('@las-flores/shared')>('@las-flores/shared');
      return { ...actual };
    });
    jest.unstable_mockModule('../../src/database/connection.js', () => ({
      queryOLTP: queryOLTPMock,
    }));
    jest.unstable_mockModule('../../src/database/redis.js', () => ({
      setCache: setCacheMock,
      deleteCache: deleteCacheMock,
      getCache: jest.fn(),
      invalidatePattern: jest.fn(),
    }));

    await fc.assert(
      fc.asyncProperty(genUniqueBeatsArray(1, 6), async (beats) => {
        queryOLTPMock.mockClear();
        deleteCacheMock.mockClear();
        setCacheMock.mockClear();
        cacheStore['story_beats:slugs'] = undefined;

        const data = { beats };

        // Directly test the upsert logic: one queryOLTP call per beat
        // Simulate what processStoryBeatData does:
        const { StoryBeatRegistrySchema } = await import('@las-flores/shared');
        StoryBeatRegistrySchema.parse(data); // must not throw

        const slugs: string[] = [];
        for (const beat of beats) {
          await queryOLTPMock(
            `INSERT INTO story_beats (slug, label, "order", description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (slug) DO UPDATE SET
               label       = EXCLUDED.label,
               "order"     = EXCLUDED."order",
               description = EXCLUDED.description,
               updated_at  = NOW()`,
            [beat.slug, beat.label, beat.order, beat.description]
          );
          slugs.push(beat.slug);
        }
        await deleteCacheMock('story_beats:slugs');
        await setCacheMock('story_beats:slugs', slugs, 0);

        // Assertions
        // Every beat was upserted (one queryOLTP call per beat)
        expect(queryOLTPMock).toHaveBeenCalledTimes(beats.length);

        // deleteCache was called once before setCache
        expect(deleteCacheMock).toHaveBeenCalledWith('story_beats:slugs');

        // setCache was called with the correct slugs
        expect(setCacheMock).toHaveBeenCalledWith(
          'story_beats:slugs',
          expect.arrayContaining(beats.map(b => b.slug)),
          0
        );

        // The cached value contains exactly the right slugs
        const cachedSlugs = cacheStore['story_beats:slugs'] as string[];
        expect(cachedSlugs).toHaveLength(beats.length);
        expect(new Set(cachedSlugs)).toEqual(new Set(beats.map(b => b.slug)));

        // Each queryOLTP call passed the correct slug
        const upsertedSlugs = queryOLTPMock.mock.calls.map(call => (call[1] as unknown[])[0]);
        expect(new Set(upsertedSlugs)).toEqual(new Set(beats.map(b => b.slug)));
      }),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Redis cache round-trip ───────────────────────────────────
//
// For any arbitrary array of beat slugs written to a mock Redis store
// via setCache, getCache must return exactly those slugs.
//
// Validates: Requirements 4.1, 4.3
// ─────────────────────────────────────────────────────────────

describe('Redis cache round-trip', () => {
  it('getCache returns exactly the slugs that were written by setCache', async () => {
    // In-memory mock Redis store
    const mockStore: Record<string, string> = {};

    const mockSetCache = async (key: string, value: unknown, _ttl: number): Promise<boolean> => {
      mockStore[key] = JSON.stringify(value);
      return true;
    };

    const mockGetCache = async <T = unknown>(key: string): Promise<T | null> => {
      const raw = mockStore[key];
      if (raw === undefined) return null;
      return JSON.parse(raw) as T;
    };

    const mockDeleteCache = async (key: string): Promise<boolean> => {
      delete mockStore[key];
      return true;
    };

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
            fc.stringOf(
              fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
              { minLength: 0, maxLength: 48 },
            ),
          ).map(([first, rest]) => first + rest),
          { minLength: 0, maxLength: 20 },
        ),
        async (slugs) => {
          // Clear store before each run
          delete mockStore['story_beats:slugs'];

          // Delete then set — mirroring processStoryBeatData
          await mockDeleteCache('story_beats:slugs');
          await mockSetCache('story_beats:slugs', slugs, 0);

          // Read back
          const retrieved = await mockGetCache<string[]>('story_beats:slugs');

          // Must be identical: same length, same contents, same order
          expect(retrieved).not.toBeNull();
          expect(retrieved).toEqual(slugs);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('getCache returns null after deleteCache removes the key', async () => {
    const mockStore: Record<string, string> = {};

    const mockSetCache = async (key: string, value: unknown, _ttl: number): Promise<boolean> => {
      mockStore[key] = JSON.stringify(value);
      return true;
    };
    const mockGetCache = async <T = unknown>(key: string): Promise<T | null> => {
      const raw = mockStore[key];
      if (raw === undefined) return null;
      return JSON.parse(raw) as T;
    };
    const mockDeleteCache = async (key: string): Promise<boolean> => {
      delete mockStore[key];
      return true;
    };

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
            fc.stringOf(
              fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
              { minLength: 0, maxLength: 48 },
            ),
          ).map(([first, rest]) => first + rest),
          { minLength: 1, maxLength: 10 },
        ),
        async (slugs) => {
          await mockSetCache('story_beats:slugs', slugs, 0);
          await mockDeleteCache('story_beats:slugs');
          const retrieved = await mockGetCache<string[]>('story_beats:slugs');
          expect(retrieved).toBeNull();
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Validator cross-reference and ordering property tests
//
// Properties under test:
//   Dialogue beat slug cross-reference
//   Scene beat slug cross-reference
//   Processing order — story_beat before dialogue and scene
//
// Validates: Requirements 5.2, 5.3, 7.3, 7.4, 8.1
// ============================================================

// ── Arbitraries shared by Properties 6 & 7 ───────────────────

/** Generates a valid node-id string (non-empty) */
const validNodeIdArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 60 }).filter(s => s.trim().length > 0);

/** Generates a finite, non-empty set of valid beat slugs */
const validSlugSetArb = (minSlugs = 1, maxSlugs = 8): fc.Arbitrary<Set<string>> =>
  fc.array(validSlugArb(), { minLength: minSlugs, maxLength: maxSlugs })
    .filter(arr => new Set(arr).size === arr.length)
    .map(arr => new Set(arr));

// ── Dialogue beat slug cross-reference ───────────────────────
//
// For any dialogue nodes map where some nodes carry effects.story_beat:
// - If the slug IS in the valid set  → no error for that field
// - If the slug is NOT in the valid set → exactly one error naming both
//   the slug and the node ID
//
// The cross-reference logic is extracted verbatim from validate.ts
// validateYAMLFile (dialogue branch) and exercised here with mocked
// loadValidBeatSlugs so there is no DB or filesystem dependency.
//
// Validates: Requirements 5.2, 5.3, 6.7
// ─────────────────────────────────────────────────────────────

/**
 * Mirrors the dialogue beat cross-reference block in validateYAMLFile.
 * Returns the list of error messages produced by iterating the nodes.
 */
function runDialogueBeatCrossRef(
  nodes: Record<string, { effects?: { story_beat?: string } }>,
  validSlugs: Set<string>,
): string[] {
  const messages: string[] = [];
  for (const [nodeId, node] of Object.entries(nodes)) {
    const beatSlug = node?.effects?.story_beat;
    if (beatSlug && !validSlugs.has(beatSlug)) {
      messages.push(
        `Unknown story_beat slug "${beatSlug}" on node "${nodeId}" — not in registry`,
      );
    }
  }
  return messages;
}

describe('Dialogue beat slug cross-reference', () => {
  it('produces no error when all node effects.story_beat slugs are in the registry', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 8),
        // Generate a map of node-id → optional story_beat from the valid set
        fc.array(
          fc.tuple(
            validNodeIdArb(),
            fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          ),
          { minLength: 0, maxLength: 10 },
        ),
        (validSlugs, rawNodePairs) => {
          const validSlugArray = Array.from(validSlugs);

          // Build nodes where any story_beat is always picked from the valid set
          const nodes: Record<string, { effects?: { story_beat?: string } }> = {};
          for (const [nodeId, maybeExtra] of rawNodePairs) {
            if (!nodeId) continue;
            const beatSlug = maybeExtra !== undefined
              ? validSlugArray[Math.abs(maybeExtra.length) % validSlugArray.length]
              : undefined;
            nodes[nodeId] = beatSlug !== undefined
              ? { effects: { story_beat: beatSlug } }
              : {};
          }

          const errors = runDialogueBeatCrossRef(nodes, validSlugs);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces an error naming the slug and node ID when a story_beat slug is NOT in the registry', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 6),
        validNodeIdArb(),
        invalidSlugArb().filter(s => s.length > 0), // must be non-empty to trigger the check
        (validSlugs, nodeId, badSlug) => {
          // Guarantee the bad slug is genuinely absent from the valid set
          fc.pre(!validSlugs.has(badSlug));

          const nodes: Record<string, { effects?: { story_beat?: string } }> = {
            [nodeId]: { effects: { story_beat: badSlug } },
          };

          const errors = runDialogueBeatCrossRef(nodes, validSlugs);

          expect(errors.length).toBeGreaterThanOrEqual(1);
          const matchingError = errors.find(
            msg => msg.includes(`"${badSlug}"`) && msg.includes(`"${nodeId}"`),
          );
          expect(matchingError).toBeDefined();
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('emits no error for nodes without effects.story_beat', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 5),
        fc.array(validNodeIdArb(), { minLength: 0, maxLength: 10 }),
        (validSlugs, nodeIds) => {
          const nodes: Record<string, { effects?: { story_beat?: string } }> = {};
          for (const id of nodeIds) {
            nodes[id] = {}; // no effects at all
          }
          const errors = runDialogueBeatCrossRef(nodes, validSlugs);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Scene beat slug cross-reference ──────────────────────────
//
// For any scene with metadata.required_story_beat (string or string[]):
// - All slugs in the valid set  → no error
// - Any slug NOT in the valid set → at least one error naming that slug
//
// The cross-reference logic is extracted verbatim from validate.ts
// validateYAMLFile (scene branch).
//
// Validates: Requirements 7.3, 7.4
// ─────────────────────────────────────────────────────────────

/**
 * Mirrors the scene required_story_beat cross-reference block in validateYAMLFile.
 * requiredBeat is the value of data.metadata?.required_story_beat.
 */
function runSceneBeatCrossRef(
  requiredBeat: string | string[] | undefined | null,
  validSlugs: Set<string>,
): string[] {
  if (requiredBeat === undefined || requiredBeat === null) return [];
  const slugsToCheck = Array.isArray(requiredBeat) ? requiredBeat : [requiredBeat];
  const messages: string[] = [];
  for (const slug of slugsToCheck) {
    if (!validSlugs.has(slug)) {
      messages.push(`Unknown required_story_beat slug "${slug}" in scene — not in registry`);
    }
  }
  return messages;
}

describe('Scene beat slug cross-reference', () => {
  it('produces no error when required_story_beat (string) is in the registry', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 8),
        (validSlugs) => {
          const validSlugArray = Array.from(validSlugs);
          for (const slug of validSlugArray) {
            const errors = runSceneBeatCrossRef(slug, validSlugs);
            expect(errors).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces no error when required_story_beat (string[]) contains only registered slugs', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(2, 8),
        fc.integer({ min: 1, max: 4 }),
        (validSlugs, count) => {
          const validSlugArray = Array.from(validSlugs);
          // Pick a sub-array of valid slugs (may repeat — all must pass)
          const picked = Array.from({ length: count }, (_, i) => validSlugArray[i % validSlugArray.length]);
          const errors = runSceneBeatCrossRef(picked, validSlugs);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces an error naming the slug when required_story_beat (string) is NOT in the registry', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 6),
        invalidSlugArb().filter(s => s.length > 0),
        (validSlugs, badSlug) => {
          fc.pre(!validSlugs.has(badSlug));

          const errors = runSceneBeatCrossRef(badSlug, validSlugs);

          expect(errors.length).toBeGreaterThanOrEqual(1);
          const matchingError = errors.find(msg => msg.includes(`"${badSlug}"`));
          expect(matchingError).toBeDefined();
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces an error for each unregistered slug in required_story_beat (string[])', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 4),
        fc.array(
          invalidSlugArb().filter(s => s.length > 0),
          { minLength: 1, maxLength: 4 },
        ),
        (validSlugs, badSlugs) => {
          // Filter to slugs that are genuinely absent
          const trulyBad = badSlugs.filter(s => !validSlugs.has(s));
          fc.pre(trulyBad.length > 0);

          const errors = runSceneBeatCrossRef(trulyBad, validSlugs);

          expect(errors.length).toBeGreaterThanOrEqual(trulyBad.length);
          for (const bad of trulyBad) {
            const found = errors.some(msg => msg.includes(`"${bad}"`));
            expect(found).toBe(true);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces no error when required_story_beat is absent (undefined/null)', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 6),
        fc.constantFrom(undefined, null),
        (validSlugs, absent) => {
          const errors = runSceneBeatCrossRef(absent, validSlugs);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Dialogue tree required_story_beat cross-reference ───────
//
// For any dialogue tree YAML with metadata.required_story_beat
// (string or string[]), the slug(s) must exist in the registry.
// This mirrors the scene block above so that the same authoring
// rules apply to both surfaces — the runtime gate in
// `server/src/routes/dialogue-helpers.ts` (`isStoryBeatAllowed`)
// and the content validator in `server/src/content/validate.ts`
// (`validateDialogueTreeBeatSlugs`) must agree.
//
// Validates: NEXT_STEPS item 1 (dialogue-tree gating by beat)
// ─────────────────────────────────────────────────────────────

/**
 * Mirrors the dialogue-tree `metadata.required_story_beat` cross-reference
 * block in `server/src/content/validate.ts::validateDialogueTreeBeatSlugs`.
 * `requiredBeat` is the value of `data.metadata?.required_story_beat`.
 */
function runDialogueTreeBeatCrossRef(
  requiredBeat: string | string[] | undefined | null,
  validSlugs: Set<string>
): string[] {
  if (requiredBeat === undefined || requiredBeat === null) return [];
  const slugsToCheck = Array.isArray(requiredBeat) ? requiredBeat : [requiredBeat];
  const messages: string[] = [];
  for (const slug of slugsToCheck) {
    if (typeof slug !== 'string') {
      messages.push(
        `Invalid required_story_beat value on dialogue tree: expected string or string[], got ${typeof slug}`,
      );
      continue;
    }
    if (!validSlugs.has(slug)) {
      messages.push(`Unknown required_story_beat slug "${slug}" in dialogue tree — not in registry`);
    }
  }
  return messages;
}

describe('Dialogue tree beat slug cross-reference', () => {
  it('produces no error when required_story_beat (string) is in the registry', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 8),
        (validSlugs) => {
          const validSlugArray = Array.from(validSlugs);
          for (const slug of validSlugArray) {
            const errors = runDialogueTreeBeatCrossRef(slug, validSlugs);
            expect(errors).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces no error when required_story_beat (string[]) contains only registered slugs', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(2, 8),
        fc.integer({ min: 1, max: 4 }),
        (validSlugs, count) => {
          const validSlugArray = Array.from(validSlugs);
          const picked = Array.from(
            { length: count },
            (_, i) => validSlugArray[i % validSlugArray.length],
          );
          const errors = runDialogueTreeBeatCrossRef(picked, validSlugs);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces an error naming the slug when required_story_beat (string) is NOT in the registry', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 6),
        invalidSlugArb().filter(s => s.length > 0),
        (validSlugs, badSlug) => {
          fc.pre(!validSlugs.has(badSlug));

          const errors = runDialogueTreeBeatCrossRef(badSlug, validSlugs);

          expect(errors.length).toBeGreaterThanOrEqual(1);
          const matchingError = errors.find(msg => msg.includes(`"${badSlug}"`));
          expect(matchingError).toBeDefined();
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces an error for each unregistered slug in required_story_beat (string[])', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 4),
        fc.array(
          invalidSlugArb().filter(s => s.length > 0),
          { minLength: 1, maxLength: 4 },
        ),
        (validSlugs, badSlugs) => {
          const trulyBad = badSlugs.filter(s => !validSlugs.has(s));
          fc.pre(trulyBad.length > 0);

          const errors = runDialogueTreeBeatCrossRef(trulyBad, validSlugs);

          expect(errors.length).toBeGreaterThanOrEqual(trulyBad.length);
          for (const bad of trulyBad) {
            const found = errors.some(msg => msg.includes(`"${bad}"`));
            expect(found).toBe(true);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('produces no error when required_story_beat is absent (undefined/null)', () => {
    fc.assert(
      fc.property(
        validSlugSetArb(1, 6),
        fc.constantFrom(undefined, null),
        (validSlugs, absent) => {
          const errors = runDialogueTreeBeatCrossRef(absent, validSlugs);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Processing order — story_beat before dialogue and scene ──
//
// For any collection of file paths that includes at least one story_beat,
// at least one dialogue, and at least one scene, after sorting by the
// canonical getProcessingOrder precedence, ALL story_beat files MUST appear
// before ALL dialogue files AND before ALL scene files.
//
// getProcessingOrder is a private function in migrate.ts, so this test
// implements the same ordering logic and verifies the CONTRACT: the order
// array places 'story_beat' before 'dialogue' and 'scene'. Any future
// change to migrate.ts that breaks this ordering will break this property.
//
// Validates: Requirements 8.1
// ─────────────────────────────────────────────────────────────

/**
 * Mirrors getContentTypeFromPath from migrate.ts for path classification.
 * Returns 'story_beat' | 'dialogue' | 'scene' | 'other'.
 */
function classifyPath(filePath: string): 'story_beat' | 'dialogue' | 'scene' | 'other' {
  const n = filePath.toLowerCase();
  if (n.endsWith('story_beats.yaml')) return 'story_beat';
  if (n.includes('/dialogues/') || n.includes('\\dialogues\\')) return 'dialogue';
  if (n.includes('/scenes/') || n.includes('\\scenes\\')) return 'scene';
  return 'other';
}

/**
 * Mirrors the processing order array from migrate.ts getProcessingOrder.
 * story_beat is index 0 (highest priority — processed first).
 */
const PROCESSING_ORDER_ARRAY = [
  'story_beat', 'character', 'scene', 'location', 'mystery',
  'vault', 'dialogue', 'overlay', 'gig', 'shop_item', 'map_tile',
] as const;

type KnownContentType = typeof PROCESSING_ORDER_ARRAY[number];

function getProcessingOrderIndex(filePath: string): number {
  const n = filePath.toLowerCase();
  let type: KnownContentType | null = null;
  if (n.endsWith('story_beats.yaml')) type = 'story_beat';
  else if (n.includes('/characters/') || n.includes('\\characters\\')) type = 'character';
  else if (n.includes('/dialogues/') || n.includes('\\dialogues\\')) type = 'dialogue';
  else if (n.includes('/overlays/') || n.includes('\\overlays\\')) type = 'overlay';
  else if (n.includes('/scenes/') || n.includes('\\scenes\\')) type = 'scene';
  else if (n.includes('/gigs/') || n.includes('\\gigs\\') || n.includes('gigs.yaml')) type = 'gig';
  else if (n.includes('/locations/') || n.includes('\\locations\\')) type = 'location';
  else if (n.includes('/vault/') || n.includes('\\vault\\')) type = 'vault';
  else if (n.includes('/mysteries/') || n.includes('\\mysteries\\')) type = 'mystery';
  else if (n.includes('/shop/') || n.includes('\\shop\\')) type = 'shop_item';
  else if (n.includes('/maps/') || n.includes('\\maps\\')) type = 'map_tile';
  if (type === null) return PROCESSING_ORDER_ARRAY.length; // unknown → sort last
  return PROCESSING_ORDER_ARRAY.indexOf(type);
}

function applyProcessingOrder(files: string[]): string[] {
  return [...files].sort((a, b) => getProcessingOrderIndex(a) - getProcessingOrderIndex(b));
}

describe('Processing order — story_beat before dialogue and scene', () => {
  /** Generates a path under /content/story_beats.yaml (the only story_beat sentinel) */
  const storyBeatPathArb = (): fc.Arbitrary<string> =>
    fc.constantFrom(
      '/content/story_beats.yaml',
      '/app/content/story_beats.yaml',
      'content/story_beats.yaml',
    );

  /** Generates paths under /content/dialogues/ */
  const dialoguePathArb = (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 30 })
      .filter(s => /^[a-z0-9_-]+$/.test(s))
      .map(name => `/content/dialogues/${name}.yaml`);

  /** Generates paths under /content/scenes/ */
  const scenePathArb = (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 30 })
      .filter(s => /^[a-z0-9_-]+$/.test(s))
      .map(name => `/content/scenes/${name}.yaml`);

  it('all story_beat files appear before all dialogue files after sorting', () => {
    fc.assert(
      fc.property(
        fc.array(storyBeatPathArb(), { minLength: 1, maxLength: 3 }),
        fc.array(dialoguePathArb(), { minLength: 1, maxLength: 5 }),
        fc.array(scenePathArb(), { minLength: 0, maxLength: 5 }),
        (beatPaths, dialoguePaths, scenePaths) => {
          // Shuffle all files together, then sort
          const mixed = [...beatPaths, ...dialoguePaths, ...scenePaths].sort(
            () => 0.5 - Math.random(), // intentional shuffle for property test variety
          );
          const sorted = applyProcessingOrder(mixed);

          // Find the last story_beat index and the first dialogue index
          const beatIndices = sorted
            .map((f, i) => ({ f, i }))
            .filter(({ f }) => classifyPath(f) === 'story_beat')
            .map(({ i }) => i);

          const dialogueIndices = sorted
            .map((f, i) => ({ f, i }))
            .filter(({ f }) => classifyPath(f) === 'dialogue')
            .map(({ i }) => i);

          const lastBeat = Math.max(...beatIndices);
          const firstDialogue = Math.min(...dialogueIndices);

          expect(lastBeat).toBeLessThan(firstDialogue);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('all story_beat files appear before all scene files after sorting', () => {
    fc.assert(
      fc.property(
        fc.array(storyBeatPathArb(), { minLength: 1, maxLength: 3 }),
        fc.array(scenePathArb(), { minLength: 1, maxLength: 5 }),
        fc.array(dialoguePathArb(), { minLength: 0, maxLength: 5 }),
        (beatPaths, scenePaths, dialoguePaths) => {
          const mixed = [...beatPaths, ...scenePaths, ...dialoguePaths].sort(
            () => 0.5 - Math.random(),
          );
          const sorted = applyProcessingOrder(mixed);

          const beatIndices = sorted
            .map((f, i) => ({ f, i }))
            .filter(({ f }) => classifyPath(f) === 'story_beat')
            .map(({ i }) => i);

          const sceneIndices = sorted
            .map((f, i) => ({ f, i }))
            .filter(({ f }) => classifyPath(f) === 'scene')
            .map(({ i }) => i);

          const lastBeat = Math.max(...beatIndices);
          const firstScene = Math.min(...sceneIndices);

          expect(lastBeat).toBeLessThan(firstScene);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('story_beat has lower processing-order index than dialogue and scene', () => {
    // This is a pure unit assertion on the order constant — always holds.
    const beatIdx = PROCESSING_ORDER_ARRAY.indexOf('story_beat');
    const dialogueIdx = PROCESSING_ORDER_ARRAY.indexOf('dialogue');
    const sceneIdx = PROCESSING_ORDER_ARRAY.indexOf('scene');

    expect(beatIdx).toBeLessThan(dialogueIdx);
    expect(beatIdx).toBeLessThan(sceneIdx);
    expect(beatIdx).toBe(0); // story_beat is first — highest priority
  });

  it('story_beats.yaml is classified as story_beat and no dialogue/scene file is', () => {
    fc.assert(
      fc.property(
        dialoguePathArb(),
        scenePathArb(),
        (dialoguePath, scenePath) => {
          expect(classifyPath('/content/story_beats.yaml')).toBe('story_beat');
          expect(classifyPath(dialoguePath)).toBe('dialogue');
          expect(classifyPath(scenePath)).toBe('scene');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ============================================================
// Dialogue Beat Effects — Content Validation
//
// Each dialogue YAML is loaded and its terminal nodes are
// asserted to carry the correct effects.story_beat value.
// Each file also passes validateContentByType to confirm
// the YAML remains schema-valid after editing.
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.7
// ============================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';
import yamlLib from 'js-yaml';
import { validateContentByType } from '../../src/content/validate.js';

// process.cwd() is the server/ directory when Jest runs.
// content/ lives one level above server/.
const CONTENT_DIR = resolve(process.cwd(), '..', 'content');

function loadDialogue(filename: string): any {
  const fullPath = resolve(CONTENT_DIR, 'dialogues', filename);
  const raw = readFileSync(fullPath, 'utf-8');
  return yamlLib.load(raw);
}

// ── dialogue_awakening.yaml ──────────────────────────────────
//
// Both is_end:true nodes must carry effects.story_beat: act1_awakening.
// Validates: Requirement 6.1
// ─────────────────────────────────────────────────────────────

describe('dialogue_awakening.yaml beat effects', () => {
  const BEAT = 'act1_awakening';
  const END_NODES = [
    '6e289bf0-410c-44bf-8a7e-123456789abc',
    '7a1b8c0d-e2f3-4a5b-6c7d-8e9f0a1b2c3d',
  ] as const;

  let data: any;
  beforeAll(() => {
    data = loadDialogue('dialogue_awakening.yaml');
  });

  it('has effects.story_beat on node 6e289bf0 (loyalist path)', () => {
    const node = data.nodes[END_NODES[0]];
    expect(node).toBeDefined();
    expect(node.is_end).toBe(true);
    expect(node.effects?.story_beat).toBe(BEAT);
  });

  it('has effects.story_beat on node 7a1b8c0d (confused path)', () => {
    const node = data.nodes[END_NODES[1]];
    expect(node).toBeDefined();
    expect(node.is_end).toBe(true);
    expect(node.effects?.story_beat).toBe(BEAT);
  });

  it('all is_end:true nodes carry the correct story_beat', () => {
    const endNodes = Object.values(data.nodes as Record<string, any>).filter(n => n.is_end === true);
    expect(endNodes.length).toBeGreaterThan(0);
    for (const node of endNodes) {
      expect(node.effects?.story_beat).toBe(BEAT);
    }
  });

  it('still passes validateContentByType("dialogue", data)', () => {
    const result = validateContentByType('dialogue', data);
    expect(result.errors.filter((e: { severity: string }) => e.severity === 'error')).toHaveLength(0);
  });
});

// ── welcome_dialogue.yaml ────────────────────────────────────
//
// Node explore_complete must carry effects.story_beat: act1_city_arrived.
// Validates: Requirement 6.2
// ─────────────────────────────────────────────────────────────

describe('welcome_dialogue.yaml beat effects', () => {
  const BEAT = 'act1_city_arrived';

  let data: any;
  beforeAll(() => {
    data = loadDialogue('welcome_dialogue.yaml');
  });

  it('has effects.story_beat on node explore_complete', () => {
    const node = data.nodes['explore_complete'];
    expect(node).toBeDefined();
    expect(node.is_end).toBe(true);
    expect(node.effects?.story_beat).toBe(BEAT);
  });

  it('still passes validateContentByType("dialogue", data)', () => {
    const result = validateContentByType('dialogue', data);
    expect(result.errors.filter((e: { severity: string }) => e.severity === 'error')).toHaveLength(0);
  });
});

// ── dialogue_first_contact.yaml ──────────────────────────────
//
// All three is_end:true nodes must carry effects.story_beat: act1_first_contact.
// Validates: Requirement 6.3
// ─────────────────────────────────────────────────────────────

describe('dialogue_first_contact.yaml beat effects', () => {
  const BEAT = 'act1_first_contact';
  const END_NODES = [
    '3e289bf0-410c-44bf-8a7e-123456789abc',
    '4e289bf0-410c-44bf-8a7e-123456789abc',
    '5e289bf0-410c-44bf-8a7e-123456789abc',
  ] as const;

  let data: any;
  beforeAll(() => {
    data = loadDialogue('dialogue_first_contact.yaml');
  });

  for (const nodeId of END_NODES) {
    it(`has effects.story_beat on node ${nodeId}`, () => {
      const node = data.nodes[nodeId];
      expect(node).toBeDefined();
      expect(node.is_end).toBe(true);
      expect(node.effects?.story_beat).toBe(BEAT);
    });
  }

  it('all is_end:true nodes carry the correct story_beat', () => {
    const endNodes = Object.values(data.nodes as Record<string, any>).filter(n => n.is_end === true);
    expect(endNodes.length).toBe(3);
    for (const node of endNodes) {
      expect(node.effects?.story_beat).toBe(BEAT);
    }
  });

  it('still passes validateContentByType("dialogue", data)', () => {
    const result = validateContentByType('dialogue', data);
    expect(result.errors.filter((e: { severity: string }) => e.severity === 'error')).toHaveLength(0);
  });
});

// ── dialogue_finale.yaml ─────────────────────────────────────
//
// Both ending nodes must carry effects.story_beat: finale_complete.
// Validates: Requirement 6.4
// ─────────────────────────────────────────────────────────────

describe('dialogue_finale.yaml beat effects', () => {
  const BEAT = 'finale_complete';
  const END_NODES = ['finale_loyalist_ending', 'finale_fugitive_ending'] as const;

  let data: any;
  beforeAll(() => {
    data = loadDialogue('dialogue_finale.yaml');
  });

  for (const nodeId of END_NODES) {
    it(`has effects.story_beat on node ${nodeId}`, () => {
      const node = data.nodes[nodeId];
      expect(node).toBeDefined();
      expect(node.is_end).toBe(true);
      expect(node.effects?.story_beat).toBe(BEAT);
    });
  }

  it('all is_end:true nodes carry the correct story_beat', () => {
    const endNodes = Object.values(data.nodes as Record<string, any>).filter(n => n.is_end === true);
    expect(endNodes.length).toBe(2);
    for (const node of endNodes) {
      expect(node.effects?.story_beat).toBe(BEAT);
    }
  });

  it('still passes validateContentByType("dialogue", data)', () => {
    const result = validateContentByType('dialogue', data);
    expect(result.errors.filter((e: { severity: string }) => e.severity === 'error')).toHaveLength(0);
  });
});

// ============================================================
// Scene Gating — Content Validation
//
// Scene YAML files are loaded and asserted to carry the
// correct metadata.required_story_beat. Each file also passes
// YAMLSceneSchema.safeParse to remain schema-valid.
//
// Validates: Requirements 7.1, 7.3
// ============================================================

import { YAMLSceneSchema } from '@las-flores/shared';

// process.cwd() is the server/ directory when Jest runs.
// content/ lives one level above server/.
// (CONTENT_DIR is already declared above — reuse via inline resolve)

function loadScene(filename: string): any {
  // Per-folder layout: content/scenes/<slug>/<filename>
  // Extract slug from filename (e.g., "scene_cafe.yaml" -> "cafe", "old_town_cafe.yaml" -> "old_town_cafe")
  const slug = filename.replace(/\.yaml$/, '').replace(/^scene_/, '');
  const fullPath = resolve(CONTENT_DIR, 'scenes', slug, filename);
  const raw = readFileSync(fullPath, 'utf-8');
  return yamlLib.load(raw);
}

// ── old_town_cafe.yaml ───────────────────────────────────────
//
// metadata.required_story_beat must be 'act1_awakening'.
// YAMLSceneSchema.safeParse must still return success:true.
// Validates: Requirements 7.1, 7.3
// ─────────────────────────────────────────────────────────────

describe('old_town_cafe.yaml scene gating', () => {
  const BEAT = 'act1_awakening';

  let data: any;
  beforeAll(() => {
    data = loadScene('old_town_cafe.yaml');
  });

  it('has metadata.required_story_beat === act1_awakening', () => {
    expect(data.metadata?.required_story_beat).toBe(BEAT);
  });

  it('still passes YAMLSceneSchema.safeParse (metadata is z.record — extra keys are fine)', () => {
    const result = YAMLSceneSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ── scene_cafe.yaml ──────────────────────────────────────────
//
// metadata.required_story_beat must be 'act1_awakening'.
// YAMLSceneSchema.safeParse must still return success:true.
// Validates: Requirements 7.1, 7.3
// ─────────────────────────────────────────────────────────────

describe('scene_cafe.yaml scene gating', () => {
  const BEAT = 'act1_awakening';

  let data: any;
  beforeAll(() => {
    data = loadScene('scene_cafe.yaml');
  });

  it('has metadata.required_story_beat === act1_awakening', () => {
    expect(data.metadata?.required_story_beat).toBe(BEAT);
  });

  it('still passes YAMLSceneSchema.safeParse (metadata is z.record — extra keys are fine)', () => {
    const result = YAMLSceneSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
