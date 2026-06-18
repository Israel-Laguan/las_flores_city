# UGC Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land four independent foundation slices that prepare the Las Flores 2077 codebase for the UGC Portal & Admin Bridge (Task 5.2 proper) — without building any actual UGC submission/approval/GitHub features yet.

**Architecture:** Four independent slices across four workspaces (shared, server, server, admin). Each slice is its own commit. No slice depends on code from another slice except Slice 2's tests exercising Slice 1's schema field. Each slice is independently verifiable per the AGENTS.md verification checklist.

**Tech Stack:** TypeScript, Zod schemas (`shared`), Express middleware backed by existing ioredis (`server`), Next.js 14 App Router with `pg` (`admin`). No new runtime dependencies except `pg` in the admin workspace.

**Reference spec:** `docs/superpowers/specs/2026-06-18-ugc-foundations-design.md`

---

## File Structure

**Slice 1 — `written_by` schema field (shared):**
- Modify: `shared/src/index.ts` — add field to 5 schemas (YAMLCharacterSchema, YAMLDialogueSchema, YAMLOverlaySchema, YAMLMysterySchema, YAMLSceneSchema)
- Modify: `shared/src/schemas/vault.ts` — add field to VaultItemSchema
- Modify: `shared/src/schemas/shop.ts` — add field to ShopItemSchema
- Modify: `shared/src/schemas/gig.ts` — add field to GigSchema

**Slice 2 — Validator refactor (server):**
- Modify: `server/src/content/validate.ts` — extract `validateContentString()`, export `validateContentByType()`, make `validateYAMLFile()` a wrapper
- Create: `server/tests/unit/validateContentString.unit.test.ts` — unit tests for the new API

**Slice 3 — Rate-limit middleware (server):**
- Create: `server/src/middleware/rateLimiter.ts` — `createRateLimiter(config)` factory backed by existing redis client
- Create: `server/tests/unit/rateLimiter.unit.test.ts` — unit tests with mocked redis

**Slice 4 — Admin DB scaffold (admin):**
- Modify: `admin/package.json` — add `pg` dependency
- Create: `admin/src/lib/database.ts` — `oltpPool` and `withOLTPTransaction` mirroring server's connection.ts
- Create: `admin/src/app/api/health/route.ts` — proof-of-life health endpoint
- Modify: `docker-compose.yml` — add DATABASE_URL to admin service
- Modify: `.env.example` — document the admin DATABASE_URL

---

## Slice 1: `written_by` schema field

**Workspace:** shared
**Goal:** Add an optional `written_by: z.string().max(100).optional()` to all 8 YAML content schemas so future UGC content can carry author metadata. Non-breaking — existing YAML without the field keeps parsing.

**Files:**
- Modify: `shared/src/index.ts` (schemas at lines 268, 279, 290, 309, 329)
- Modify: `shared/src/schemas/vault.ts` (VaultItemSchema at line 3)
- Modify: `shared/src/schemas/shop.ts` (ShopItemSchema at line 21)
- Modify: `shared/src/schemas/gig.ts` (GigSchema at line 3)

### Task 1.1: Add `written_by` to all schemas

- [ ] **Step 1: Add field to YAMLCharacterSchema in `shared/src/index.ts`**

Edit `shared/src/index.ts`. The current `YAMLCharacterSchema` (line 268) is:

```typescript
export const YAMLCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  description: z.string().max(1000),
  avatar_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
```

Add `written_by` as the last field (after `metadata`):

```typescript
export const YAMLCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  description: z.string().max(1000),
  avatar_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});
```

- [ ] **Step 2: Add field to YAMLDialogueSchema**

In `shared/src/index.ts`, the `YAMLDialogueSchema` (line 279) currently ends with `metadata`. Replace the whole object body to add `written_by` after `metadata`:

```typescript
export const YAMLDialogueSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  start_node_id: z.string(),
  nodes: z.record(z.string(), DialogueNodeSchema),
  metadata: z.record(z.string(), z.any()).optional(),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});
```

- [ ] **Step 3: Add field to YAMLOverlaySchema**

In `shared/src/index.ts`, the `YAMLOverlaySchema` (line 290) currently ends with `is_nsfw`. Add `written_by` after `is_nsfw`:

```typescript
export const YAMLOverlaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  target_tree_id: z.string().uuid(),
  mystery_id: z.string().uuid().optional(),
  modifications: z.array(z.object({
    node_id: z.string(),
    action: z.enum(['replace', 'add_choice', 'remove_choice', 'modify_text']),
    data: z.record(z.string(), z.any()),
  })).default([]),
  nodes: z.record(z.string(), DialogueNodeSchema).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  priority: z.number().int().default(0),
  is_nsfw: z.boolean().default(false),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});
```

- [ ] **Step 4: Add field to YAMLMysterySchema**

In `shared/src/index.ts`, the `YAMLMysterySchema` (line 309) currently ends with `aftermath_payload`. Add `written_by` after `aftermath_payload`:

```typescript
export const YAMLMysterySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  status: z.enum(['ACTIVE', 'RESOLVING', 'ARCHIVED']).default('ACTIVE'),
  expires_at: z.string().datetime().optional(),
  // Task 5.1: aftermath directives executed atomically by the
  // LeaderboardWorker when this mystery's Breakthrough window
  // closes. Defaults to {} so existing mystery YAMLs still parse.
  aftermath_payload: AftermathSchema.optional().default({}),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});
```

- [ ] **Step 5: Add field to YAMLSceneSchema**

In `shared/src/index.ts`, the `YAMLSceneSchema` (line 329) currently ends with `metadata`. Add `written_by` after `metadata`:

```typescript
export const YAMLSceneSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  district: z.string().max(50),
  image_url: z.string().url().optional(),
  background_url: z.string().optional(),
  ambient_sound_url: z.string().nullable().optional(),
  mood: z.string().max(50).optional(),
  available_dialogues: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});
```

- [ ] **Step 6: Add field to VaultItemSchema in `shared/src/schemas/vault.ts`**

The current `VaultItemSchema` (line 3) ends with `requires_signed_url`. Add `written_by` as the last field:

```typescript
export const VaultItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  thumbnail_url: z.string().url(),
  media_path: z.string().min(1),
  item_type: z.enum(['clue', 'memento', 'premium_cg']),
  mystery_id: z.string().uuid().optional(),
  requires_signed_url: z.boolean().optional(),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});
```

- [ ] **Step 7: Add field to ShopItemSchema in `shared/src/schemas/shop.ts`**

The current `ShopItemSchema` (line 21) ends with `is_active`. Add `written_by` as the last field:

```typescript
export const ShopItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  item_type: ShopItemTypeSchema,
  price: z.number().int().min(0),
  currency_type: ShopCurrencySchema.default('gold_credits'),
  asset_url: z.string().url(),
  is_active: z.boolean().default(true),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});
```

- [ ] **Step 8: Add field to GigSchema in `shared/src/schemas/gig.ts`**

The current `GigSchema` (line 3) ends with `location_restriction_id`. Add `written_by` as the last field:

```typescript
export const GigSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  time_block_cost: z.number().int().min(1).max(48),
  credit_payout: z.number().int().min(1),
  reputation_target: z.string().optional(),
  reputation_reward: z.number().int().optional(),
  location_restriction_id: z.string().uuid().optional(),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});
```

### Task 1.2: Verify Slice 1

- [ ] **Step 1: Build the shared workspace**

Run: `npm run build --workspace=shared`
Expected: Completes with no TypeScript errors. The new optional field is type-safe and inferred automatically via `z.infer`.

- [ ] **Step 2: Run content validation to confirm existing content still parses**

Run: `npm run validate:content`
Expected: `✅ Content validation passed!` — existing content files lack `written_by` but parse successfully because the field is `.optional()`. If any file FAILS, that file is malformed in a way unrelated to this change — investigate but do not modify the schema.

- [ ] **Step 3: Commit**

```bash
git add shared/src/index.ts shared/src/schemas/vault.ts shared/src/schemas/shop.ts shared/src/schemas/gig.ts
git commit -m "feat(shared): add written_by authorship field to all content schemas

Optional z.string().max(100) field on all 8 YAML content schemas
(character, dialogue, overlay, mystery, scene, vault, shop, gig).
Non-breaking — existing content without the field still parses.

Foundation for Task 5.2 UGC portal: future migration engine will
read this field to credit community authors. No behavior change
in this commit — the field is parsed but not yet consumed."
```

---

## Slice 2: Validator refactor — `validateContentString()`

**Workspace:** server
**Goal:** Extract a pure `validateContentString(yamlString, contentType)` from the file-bound `validateYAMLFile()`. Export `validateContentByType()`. Future UGC endpoint will call `validateContentString` directly with request-body YAML.

**Files:**
- Modify: `server/src/content/validate.ts`
- Create: `server/tests/unit/validateContentString.unit.test.ts`

### Task 2.1: Write failing tests for `validateContentString`

- [ ] **Step 1: Create the test file**

Create `server/tests/unit/validateContentString.unit.test.ts` with this exact content:

```typescript
import { describe, test, expect } from '@jest/globals';
import { validateContentString, validateContentByType } from '../../src/content/validate.js';

// ============================================================
// validateContentString Unit Tests (Task 5.2 Foundations)
//
// Pure tests for the new string-in validator extracted from
// validateYAMLFile. This is the API the future UGC submit
// endpoint will call with request-body YAML. No file I/O, no
// DB, no Redis.
// ============================================================

const VALID_DIALOGUE_YAML = `
id: 11111111-1111-1111-1111-111111111111
name: Test Dialogue
start_node_id: start
nodes:
  start:
    id: start
    type: narrator
    text: Hello world.
    is_end: true
`;

const VALID_CHARACTER_YAML = `
id: 22222222-2222-2222-2222-222222222222
name: Test Character
description: A test character for unit testing.
`;

const MALFORMED_YAML = `
id: not-a-uuid
name:
  - this is a list where a string was expected
`;

const YAML_WITH_XSS = `
id: 33333333-3333-3333-3333-333333333333
name: Evil Character
description: <script>alert('xss')</script> hello
`;

const YAML_WITH_WRITTEN_BY = `
id: 44444444-4444-4444-4444-444444444444
name: UGC Character
description: Authored by a player.
written_by: "@architect_kai"
`;

describe('validateContentString', () => {
  test('accepts valid dialogue YAML', async () => {
    const result = await validateContentString(VALID_DIALOGUE_YAML, 'dialogue');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts valid character YAML', async () => {
    const result = await validateContentString(VALID_CHARACTER_YAML, 'character');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts YAML with written_by field (Slice 1 integration)', async () => {
    const result = await validateContentString(YAML_WITH_WRITTEN_BY, 'character');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects malformed YAML with a parse error', async () => {
    const result = await validateContentString(MALFORMED_YAML, 'character');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.includes('Schema validation failed') || e.message.includes('YAML parse error'))).toBe(true);
  });

  test('rejects YAML containing a script tag (XSS)', async () => {
    const result = await validateContentString(YAML_WITH_XSS, 'character');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('XSS') || e.message.includes('script'))).toBe(true);
  });

  test('rejects YAML that is not valid YAML syntax at all', async () => {
    const result = await validateContentString('foo: [unclosed', 'character');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('YAML parse error'))).toBe(true);
  });
});

describe('validateContentByType (now exported)', () => {
  test('validates a parsed character object directly', () => {
    const result = validateContentByType('character', {
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Direct Character',
      description: 'Called without file I/O.',
    });
    expect(result.valid).toBe(true);
  });

  test('flags an invalid character object', () => {
    const result = validateContentByType('character', {
      id: 'not-a-uuid',
      // missing name and description
    });
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test --workspace=server -- tests/unit/validateContentString.unit.test.ts`
Expected: FAIL — `validateContentString` is not exported, and `validateContentByType` is not exported. Error messages will reference missing exports.

### Task 2.2: Implement `validateContentString` and export `validateContentByType`

- [ ] **Step 1: Add the `validateContentString` export to `server/src/content/validate.ts`**

Insert this new exported function immediately BEFORE the existing `validateContent` function (which starts around line 303, marked `// Main validation function`). Place it after the `checkForXSS` function (which ends around line 300):

```typescript
// Validate a YAML content string directly (no file I/O).
// Used by the UGC submission endpoint to validate request-body YAML.
// contentType is required because there's no file path to infer it from.
export async function validateContentString(
  yamlString: string,
  contentType: ContentType
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Parse YAML
  let data: any;
  try {
    data = yaml.load(yamlString);
  } catch (e: any) {
    errors.push({
      message: `YAML parse error: ${e.message}`,
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  // Schema + cycle validation
  const typeResult = validateContentByType(contentType, data);
  errors.push(...typeResult.errors);
  warnings.push(...typeResult.warnings);

  // XSS check (the file-based validateYAMLFile omits this; the full
  // validateContent CLI pipeline runs it separately. For request-body
  // validation we run both passes here.)
  const xssErrors = checkForXSS(data);
  errors.push(...xssErrors);

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings,
  };
}
```

- [ ] **Step 2: Export `validateContentByType` by changing its declaration**

In `server/src/content/validate.ts`, find the `validateContentByType` function declaration (around line 85):

```typescript
// Validate content by type
function validateContentByType(type: ContentType, data: any): ValidationResult {
```

Change it to add the `export` keyword:

```typescript
// Validate content by type (exported for direct use by validateContentString
// and the future UGC submission endpoint)
export function validateContentByType(type: ContentType, data: any): ValidationResult {
```

- [ ] **Step 3: Add a TODO comment for the gig validation gap**

In the `validateContentByType` switch statement (around lines 90-121), find the `case 'shop_item':` block and add a `case 'gig':` TODO immediately before the closing `}` of the switch. The switch currently ends:

```typescript
      case 'shop_item':
        ShopItemFileSchema.parse(data);
        break;
    }
```

Change to:

```typescript
      case 'shop_item':
        ShopItemFileSchema.parse(data);
        break;
      // TODO: add gig schema validation. Currently gigs fall through
      // silently — pre-existing gap, out of scope for Task 5.2 foundations.
      // case 'gig': GigFileSchema.parse(data); break;
    }
```

- [ ] **Step 4: Verify `validateYAMLFile` still works unchanged**

Read `server/src/content/validate.ts` from the top through line 130. Confirm `validateYAMLFile` (line 32) still reads the file, parses YAML, calls `getContentTypeFromPath`, and calls `validateContentByType`. **Do not modify `validateYAMLFile`.** Its behavior must remain byte-for-byte identical so the existing `validate:content` CLI output is unchanged.

### Task 2.3: Verify Slice 2

- [ ] **Step 1: Run the new unit tests**

Run: `npm run test --workspace=server -- tests/unit/validateContentString.unit.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 2: Run lint on the server workspace**

Run: `npm run lint --workspace=server`
Expected: No errors. If lint reports an unused import or similar, fix it.

- [ ] **Step 3: Build the server workspace**

Run: `npm run build --workspace=server`
Expected: TypeScript compiles cleanly. `validateContentString` and `validateContentByType` are both exported.

- [ ] **Step 4: Confirm existing content validation is byte-for-byte unchanged**

Run: `npm run validate:content`
Expected: `✅ Content validation passed!` with the same number of files processed as before. This confirms the refactor didn't change `validateYAMLFile`'s behavior.

- [ ] **Step 5: Run the full server unit test suite to confirm no regressions**

Run: `npm run test --workspace=server -- tests/unit`
Expected: All existing unit tests (importantTags, resolver, mediaSigner, byokEncryption) plus the new validateContentString tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/content/validate.ts server/tests/unit/validateContentString.unit.test.ts
git commit -m "refactor(server): extract validateContentString for request-body validation

Extracts validateContentString(yamlString, contentType) from the
file-bound validateYAMLFile(). Also exports validateContentByType()
which was previously private.

validateYAMLFile() is now a thin wrapper and its behavior is
unchanged — existing content validation output is identical.

The new validateContentString runs schema validation, cycle detection
(dialogues only), AND XSS checking in one pass. This is the API the
future UGC submission endpoint will call to validate player-submitted
YAML before it enters the queue."
```

---

## Slice 3: Rate-limit middleware factory

**Workspace:** server
**Goal:** A `createRateLimiter(config)` factory backed by the existing `redis` client (from `server/src/database/redis.ts`). Zero new dependencies. Not wired to any route yet — purely additive.

**Files:**
- Create: `server/src/middleware/rateLimiter.ts`
- Create: `server/tests/unit/rateLimiter.unit.test.ts`

### Task 3.1: Write failing tests for the rate limiter

- [ ] **Step 1: Create the test file**

Create `server/tests/unit/rateLimiter.unit.test.ts` with this exact content. It mocks the redis module so no real Redis is needed:

```typescript
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// ============================================================
// createRateLimiter Unit Tests (Task 5.2 Foundations)
//
// Mocks the redis client so no real Redis connection is needed.
// Tests the three contract points:
//   1. Passes through (calls next) when under the limit
//   2. Returns 429 with Retry-After when over the limit
//   3. Fails open (calls next) when Redis throws
// ============================================================

// Mock the redis module BEFORE importing the limiter.
const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
};

jest.mock('../../src/database/redis.js', () => ({
  redis: mockRedis,
}));

// Import AFTER the mock is registered.
const { createRateLimiter } = await import('../../src/middleware/rateLimiter.js');

// Minimal Express-like stubs. We don't need real Express — just the
// three properties the middleware touches (path, userId, ip) and the
// res.status().json() chain.
function makeReq(overrides: any = {}) {
  return {
    path: '/test',
    userId: undefined,
    ip: '127.0.0.1',
    ...overrides,
  };
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('createRateLimiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes through (calls next) when under the limit', async () => {
    mockRedis.incr.mockResolvedValue(1);   // first request
    mockRedis.expire.mockResolvedValue(1);

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('test:'));
  });

  test('sets expire only on the first request in a window', async () => {
    mockRedis.incr.mockResolvedValue(1);

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 60);
  });

  test('does NOT call expire on subsequent requests in the window', async () => {
    mockRedis.incr.mockResolvedValue(2);  // second request

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(mockRedis.expire).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('returns 429 with Retry-After when limit exceeded', async () => {
    mockRedis.incr.mockResolvedValue(4);   // over the limit of 3
    mockRedis.ttl.mockResolvedValue(45);   // 45 seconds remaining in window

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '45');
    expect(res.json).toHaveBeenCalledWith({ error: 'TOO_MANY_REQUESTS' });
    expect(mockRedis.ttl).toHaveBeenCalledTimes(1);
  });

  test('uses default Retry-After of windowSeconds when TTL returns -1 (expired/no key)', async () => {
    mockRedis.incr.mockResolvedValue(4);
    mockRedis.ttl.mockResolvedValue(-1);   // key has no TTL (expired or missing)

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '60');
  });

  test('falls back to req.ip when userId is absent (unauthenticated routes)', async () => {
    mockRedis.incr.mockResolvedValue(1);

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'anon' });
    const req = makeReq({ userId: undefined, ip: '203.0.113.5' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('anon:/test:203.0.113.5'));
  });

  test('fails open (calls next) when Redis throws', async () => {
    mockRedis.incr.mockRejectedValue(new Error('Redis connection refused'));

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    // Fail open: gameplay must not break because Redis is down.
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('uses default keyPrefix "rl" when none provided', async () => {
    mockRedis.incr.mockResolvedValue(1);

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3 });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('rl:'));
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test --workspace=server -- tests/unit/rateLimiter.unit.test.ts`
Expected: FAIL — `createRateLimiter` does not exist. Error will be a module resolution failure or undefined import.

### Task 3.2: Implement `createRateLimiter`

- [ ] **Step 1: Create the middleware file**

Create `server/src/middleware/rateLimiter.ts` with this exact content:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { redis } from '../database/redis.js';

// ============================================================
// Rate Limiter Middleware Factory (Task 5.2 Foundations)
//
// Fixed-window counter backed by the existing ioredis client.
// Zero new dependencies — uses INCR + EXPIRE directly.
//
// Fail-open design: if Redis is unreachable, the middleware logs
// the error and calls next(). Gameplay must not break because the
// rate limiter is down.
//
// This factory is NOT wired to any route in this slice. Routes
// configure their own limits at mount time, e.g. the future UGC
// submit endpoint will use 3 requests / 86400s.
// ============================================================

export interface RateLimiterConfig {
  /** Fixed-window duration in seconds. */
  windowSeconds: number;
  /** Max requests allowed per window per identity. */
  maxRequests: number;
  /** Redis key namespace. Defaults to 'rl'. Each route provides its own. */
  keyPrefix?: string;
}

export function createRateLimiter(config: RateLimiterConfig) {
  const { windowSeconds, maxRequests } = config;
  const prefix = config.keyPrefix ?? 'rl';

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Identity: prefer authenticated userId, fall back to IP for anon routes.
    const identity = req.userId || req.ip || 'unknown';
    const key = `${prefix}:${req.path}:${identity}`;

    try {
      const current = await redis.incr(key);

      // Only set the TTL on the first request in a window. Subsequent
      // requests inherit the existing TTL — avoids resetting the window
      // on every hit.
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        // Compute Retry-After from the key's remaining TTL. If TTL is
        // missing/expired (-1 or -2), fall back to the full window.
        let ttl = await redis.ttl(key);
        if (ttl < 0) {
          ttl = windowSeconds;
        }
        res.status(429);
        res.set('Retry-After', String(ttl));
        res.json({ error: 'TOO_MANY_REQUESTS' });
        return;
      }

      next();
    } catch (err) {
      // Fail open: log and continue. Never block gameplay on Redis.
      console.error('Rate limiter error (failing open):', err);
      next();
    }
  };
}
```

### Task 3.3: Verify Slice 3

- [ ] **Step 1: Run the new unit tests**

Run: `npm run test --workspace=server -- tests/unit/rateLimiter.unit.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 2: Run lint on the server workspace**

Run: `npm run lint --workspace=server`
Expected: No errors.

- [ ] **Step 3: Build the server workspace**

Run: `npm run build --workspace=server`
Expected: TypeScript compiles cleanly.

- [ ] **Step 4: Run the full server unit test suite to confirm no regressions**

Run: `npm run test --workspace=server -- tests/unit`
Expected: All unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/rateLimiter.ts server/tests/unit/rateLimiter.unit.test.ts
git commit -m "feat(server): add createRateLimiter middleware factory

Fixed-window rate limiter backed by the existing ioredis client.
Zero new dependencies — uses INCR + EXPIRE directly on the existing
redis instance from database/redis.ts.

Fail-open design: Redis errors are logged but never block gameplay.
Returns 429 with Retry-After header (computed from key TTL) when the
limit is exceeded.

Not wired to any route in this commit. Routes configure their own
limits at mount time, e.g. the future UGC submit endpoint will use
createRateLimiter({ windowSeconds: 86400, maxRequests: 3 })."
```

---

## Slice 4: Admin DB scaffold

**Workspace:** admin (+ docker-compose, .env.example)
**Goal:** Wire the admin Next.js app to the OLTP database. One proof-of-life `/api/health` endpoint that runs `SELECT 1`. No auth, no UGC routes — just the DB connection foundation.

**Files:**
- Modify: `admin/package.json` — add `pg` dependency
- Create: `admin/src/lib/database.ts` — `oltpPool`, `withOLTPTransaction`, `closeConnections`
- Create: `admin/src/app/api/health/route.ts` — proof-of-life endpoint
- Modify: `docker-compose.yml` — add DATABASE_URL to admin service (line 120-121)
- Modify: `.env.example` — document admin DATABASE_URL

### Task 4.1: Add `pg` dependency to admin

- [ ] **Step 1: Add `pg` to `admin/package.json`**

Edit `admin/package.json`. The current full file is:

```json
{
  "name": "las-flores-admin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@next/eslint-plugin-next": "^14.2.3",
    "@types/node": "^20.12.7",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.4.5"
  }
}
```

Add `pg` (same major as the server's `^8.12.0`) to `dependencies` — insert it alphabetically between `next` and `react`:

```json
  "dependencies": {
    "next": "14.2.3",
    "pg": "^8.12.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
```

Add `@types/pg` to the existing `devDependencies` — preserve all existing entries, insert `@types/pg` alphabetically between `@types/node` and `@types/react`:

```json
  "devDependencies": {
    "@next/eslint-plugin-next": "^14.2.3",
    "@types/node": "^20.12.7",
    "@types/pg": "^8.11.5",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.4.5"
  },
```

Do not remove or reorder any existing entries.

- [ ] **Step 2: Install the new dependency**

Run: `npm install --workspace=admin`
Expected: `pg` and `@types/pg` are installed. `package-lock.json` updates. No errors.

### Task 4.2: Create the database connection module

- [ ] **Step 1: Create `admin/src/lib/database.ts`**

Create the file with this exact content. It mirrors `server/src/database/connection.ts` but only exposes the OLTP pool (admin has no analytics use case in this slice):

```typescript
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';

// ============================================================
// Admin Database Connection (Task 5.2 Foundations)
//
// Mirrors server/src/database/connection.ts — same contract,
// separate process. The admin container runs its own Node/Next
// process and cannot import from server/src/. The helpers below
// are byte-compatible with the server's oltpPool +
// withOLTPTransaction so that future admin API routes use the
// exact same patterns as server routes.
//
// No auth in this slice — admin auth is deferred to Task 5.2
// proper. Until then, port 3001 must NOT be publicly exposed.
// ============================================================

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const { Pool } = pg;

// OLTP Database Connection (Main Game State) — same config as server.
export const oltpPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

let poolClosed = false;

// Close database connections (call on graceful shutdown).
export async function closeConnections(): Promise<void> {
  if (poolClosed) {
    return;
  }
  poolClosed = true;
  await oltpPool.end();
  console.log('🔌 Admin database connection closed');
}

// Transaction helper — identical contract to the server's
// withOLTPTransaction. Future admin routes (UGC approve, etc.)
// use this for atomic status updates.
export async function withOLTPTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await oltpPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Task 4.3: Create the proof-of-life health endpoint

- [ ] **Step 1: Create `admin/src/app/api/health/route.ts`**

Create the file with this exact content. It's a Next.js 14 App Router route handler:

```typescript
import { NextResponse } from 'next/server';
import { oltpPool } from '../../../../lib/database';

// ============================================================
// Admin Health Endpoint (Task 5.2 Foundations)
//
// Proof-of-life: confirms the admin app can reach the OLTP
// database. Runs SELECT 1 and returns { status: 'ok', db: true }
// on success, or { status: 'degraded', db: false } on failure.
//
// No auth required — this is the admin equivalent of the server's
// GET /health. Does not expose any data.
// ============================================================

export async function GET() {
  try {
    await oltpPool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: true });
  } catch (error) {
    console.error('Admin DB health check failed:', error);
    return NextResponse.json(
      { status: 'degraded', db: false },
      { status: 503 }
    );
  }
}
```

### Task 4.4: Wire DATABASE_URL into docker-compose and .env.example

- [ ] **Step 1: Add DATABASE_URL to the admin service in `docker-compose.yml`**

In `docker-compose.yml`, the admin service environment block (around lines 120-121) currently is:

```yaml
    environment:
      API_URL: http://localhost:3000
```

Add the `DATABASE_URL` using the Docker service name (same pattern as the server service at line 87):

```yaml
    environment:
      API_URL: http://localhost:3000
      DATABASE_URL: postgresql://las_flores:las_flores_dev_password@postgres-oltp:5432/las_flores
```

Also add `postgres-oltp` to the admin `depends_on` block (currently line 122-123 only has `server`), so the admin waits for the DB to be healthy:

```yaml
    depends_on:
      - server
      postgres-oltp:
        condition: service_healthy
```

Note: `depends_on` with both the short form (`- server`) and long form (the `postgres-oltp` map) in the same list is a YAML/docker-compose quirk. To be safe and consistent, convert the whole `depends_on` to the long form:

```yaml
    depends_on:
      server:
        condition: service_started
      postgres-oltp:
        condition: service_healthy
```

- [ ] **Step 2: Add DATABASE_URL to `.env.example`**

The admin uses the same `DATABASE_URL` as the server. It's already documented at line 4 of `.env.example`:

```
DATABASE_URL=postgresql://las_flores:las_flores_dev_password@localhost:5432/las_flores
```

Add a clarifying comment block after the PayPal section (after line 63) to document that the admin app consumes the same `DATABASE_URL`:

```
# Admin Panel Configuration (Task 5.2 Foundations)
# The admin Next.js app (port 3001) reads the same DATABASE_URL as
# the server. In Docker, docker-compose injects this automatically
# using the postgres-oltp service name. For local dev outside Docker,
# set DATABASE_URL here and it applies to both server and admin.
```

### Task 4.5: Verify Slice 4

- [ ] **Step 1: Build the admin workspace**

Run: `npm run build --workspace=admin`
Expected: Next.js builds successfully. The new `/api/health` route compiles. The `lib/database.ts` module type-checks.

- [ ] **Step 2: Rebuild and restart the admin container**

Run: `docker compose build admin && docker compose up -d admin`
Expected: Image builds, container starts. Note: if a host proxy has stale state (per AGENTS.md gotcha), use `docker compose down && docker compose up -d` instead.

- [ ] **Step 3: Hit the health endpoint**

Run: `curl http://localhost:3001/api/health`
Expected: `{"status":"ok","db":true}` (HTTP 200). This proves the admin container can reach the OLTP Postgres via the Docker network using the `postgres-oltp` service name.

- [ ] **Step 4: Confirm the server is unaffected**

Run: `curl http://localhost:3000/health`
Expected: 200 OK — the server health check still works, confirming the admin changes didn't break the server container.

- [ ] **Step 5: Commit**

```bash
git add admin/package.json admin/package-lock.json admin/src/lib/database.ts admin/src/app/api/health/route.ts docker-compose.yml .env.example
git commit -m "feat(admin): wire admin app to OLTP database with health endpoint

Adds the admin's database connection layer, mirroring the server's
connection.ts contract (oltpPool + withOLTPTransaction). Separate
process — the helpers live in admin/src/lib/ because the admin
container cannot import from server/src/.

Adds GET /api/health that runs SELECT 1 and returns
{ status: 'ok', db: true }. Proof-of-life that the admin can reach
Postgres via the Docker network (postgres-oltp service name).

No auth in this commit — admin auth is deferred to Task 5.2 proper.
Port 3001 must not be publicly exposed until auth lands."
```

---

## Post-implementation sanity check

- [ ] **Step 1: Run the full verification checklist from AGENTS.md**

Run these in order and confirm each passes:

```bash
# Content (Slice 1 should not have changed validation output)
npm run validate:content

# Server (Slices 2 + 3)
npm run lint --workspace=server
npm run build --workspace=server
npm run test --workspace=server -- tests/unit

# Admin (Slice 4)
npm run build --workspace=admin
```

- [ ] **Step 2: Confirm all four commits landed**

Run: `git log --oneline -6`
Expected: Four new commits visible, one per slice, on top of the spec commit:
1. `feat(shared): add written_by authorship field...`
2. `refactor(server): extract validateContentString...`
3. `feat(server): add createRateLimiter middleware factory`
4. `feat(admin): wire admin app to OLTP database...`

- [ ] **Step 3: Confirm no schema migration was needed**

Run: `git status`
Expected: Working tree clean. No `.sql` migration files were created in any slice — this foundations work is purely code/config, no DDL changes.

---

## Notes for the executor

- **Worktree:** If following the using-git-worktrees skill, create one worktree for the whole plan (all four slices), not one per slice. The slices are small and the context-switch overhead exceeds the isolation benefit.
- **Slice 2 depends on Slice 1 only for one test** (`YAML_WITH_WRITTEN_BY`). If implementing out of order, that single test will fail until Slice 1 lands. Slices 3 and 4 are fully independent.
- **AGENTS.md hard constraint reminder:** Do NOT introduce new pools or cache layers. Slice 4's `oltpPool` is a new Pool *instance* in a new *process* (admin container), not a new pool in the server — this complies. The rate limiter uses the existing `redis` client, not a new one — this complies.
- **Don't modify `validateYAMLFile`'s behavior in Slice 2.** The whole point is zero behavioral change for the file-based path. If `npm run validate:content` output differs after Slice 2, something went wrong.
