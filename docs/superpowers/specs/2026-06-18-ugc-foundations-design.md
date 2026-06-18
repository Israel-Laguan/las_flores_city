# Task 5.2 Foundations — UGC Portal Prep

**Date:** 2026-06-18
**Status:** Approved
**Scope:** Four independent foundation slices that prepare the codebase for the UGC Portal & Admin Bridge (Task 5.2 proper). Does NOT include the actual UGC submission endpoint, admin review UI, or GitHub integration.

## Motivation

The Task 5.2 spec describes a UGC pipeline where players submit YAML, admins review it, and approved content gets pushed to Git. The spec assumes several foundations exist that do not: a reusable validator API, a `written_by` authorship field on schemas, rate-limiting middleware, and an admin app with database access. This design builds those foundations as four independent slices, each verifiable on its own.

### Spec drift corrections

The original Task 5.2 spec contains multiple inaccuracies against the current codebase. These are corrected in this design:

| Spec claim | Reality |
|---|---|
| `validateDialogueYAML()` from "Spike 10" | No such function or "Spike 10" exists. Real validators: `validateYAMLFile()`, `validateContent()`, `checkForXSS()`, `sanitizeText()` in `server/src/content/validate.ts` |
| XSS via `he.escape` | `he` package not installed. Sanitization is hand-rolled in `sanitizeText()` (regex-based) |
| `req.user.id` in auth middleware | Contract is `req.userId` (bare string). `user` object in `AuthRequest` is dead interface code |
| Migration `013_ugc_submissions.sql` in `/db-migrations/` | `013` is taken. Highest is `027`. Migrations live in `server/src/database/migrations/` |
| `written_by` field with auto-feed-post | Field does not exist. Auto-post deferred to Task 5.2 proper |
| Admin panel with DB access and API routes | Admin is an empty Next.js shell — single static page, no DB, no API, no auth |
| Existing rate limiting | None exists — no deps, no middleware |
| `GITHUB_ADMIN_TOKEN` / `GITHUB_CONTENT_REPO` env vars | Not in `.env.example` — deferred to Task 5.2 |

## Design

Four independent slices, ordered by dependency and workspace. Each slice is committable, testable, and verifiable independently.

---

### Slice 1: `written_by` schema field

**Workspace:** shared
**Files changed:** `shared/src/index.ts`, `shared/src/schemas/vault.ts`, `shared/src/schemas/shop.ts`, `shared/src/schemas/gig.ts`

Add an optional `written_by: z.string().max(100).optional()` to all YAML content schemas. The field sits at the top level of each schema object (alongside `id`, `name`, etc.) and names the content author (e.g., `written_by: "@architect_kai"`).

**Schemas modified (8 total):**

- `YAMLCharacterSchema` — `shared/src/index.ts:268`
- `YAMLDialogueSchema` — `shared/src/index.ts:279`
- `YAMLOverlaySchema` — `shared/src/index.ts:290`
- `YAMLMysterySchema` — `shared/src/index.ts:309`
- `YAMLSceneSchema` — `shared/src/index.ts:329`
- `VaultItemSchema` — `shared/src/schemas/vault.ts`
- `ShopItemSchema` — `shared/src/schemas/shop.ts`
- `GigSchema` — `shared/src/schemas/gig.ts`

Non-breaking additive change. All existing YAML files without the field continue to parse. TypeScript types gain optional `written_by?: string` automatically.

**Deferred:** The migration engine does NOT read or act on `written_by` in this slice. No feed-post side effect. That ships with Task 5.2 proper.

**Verification:**
- `npm run build --workspace=shared` passes
- `npm run validate:content` passes against existing content

---

### Slice 2: Validator refactor — `validateContentString()`

**Workspace:** server
**Files changed:** `server/src/content/validate.ts`

Extract a pure function `validateContentString(yamlString, contentType)` that takes a YAML string and explicit content type, returning `ValidationResult`. The existing `validateYAMLFile()` becomes a thin wrapper that reads the file and delegates.

**Current call chain:**
```
validateYAMLFile(filePath)
  ├── fs.readFile(filePath)
  ├── yaml.load(content)
  ├── getContentTypeFromPath(filePath)
  └── validateContentByType(contentType, data)   ← private
```

**Refactored call chain:**
```
validateContentString(yamlString, contentType)    ← NEW export
  ├── yaml.load(yamlString)
  ├── validateContentByType(contentType, data)   ← now exported
  └── checkForXSS(data)

validateYAMLFile(filePath)                        ← thin wrapper
  ├── fs.readFile(filePath)
  ├── getContentTypeFromPath(filePath)
  └── validateContentString(content, contentType)

validateContentByType(type, data)                 ← exported (was private)
detectCycles(nodes)                                ← unchanged
checkForXSS(content)                              ← unchanged
sanitizeText(text)                                ← unchanged
```

**New exports:**

```typescript
export async function validateContentString(
  yamlString: string,
  contentType: ContentType
): Promise<ValidationResult>

export function validateContentByType(
  type: ContentType,
  data: any
): ValidationResult
```

**Behavioral note — XSS check:** The current `validateYAMLFile()` does NOT call `checkForXSS()`. Only the top-level CLI `validateContent()` does. The new `validateContentString()` includes the XSS check — strictly better. The file-based wrapper remains unchanged (no XSS check) to preserve exact current behavior for existing callers.

**Known gap:** `validateContentByType` has no `case 'gig':` in its switch — gigs silently skip schema validation. Pre-existing, out of scope. A `// TODO` comment will be added.

**Verification:**
- `npm run lint --workspace=server` passes
- `npm run build --workspace=server` passes
- `npm run test --workspace=server` passes
- `npm run validate:content` produces identical output
- New unit test: `validateContentString` with valid dialogue returns `{ valid: true }`, with malformed YAML returns `{ valid: false }` with parse error

---

### Slice 3: Rate-limit middleware factory

**Workspace:** server
**Files changed:** `server/src/middleware/rateLimiter.ts` (new), `server/package.json` (types only, no new runtime deps)

A factory function `createRateLimiter(config)` that returns Express middleware backed by the existing `redis` client from `server/src/database/redis.ts`. Zero new runtime dependencies.

**Config interface:**

```typescript
interface RateLimiterConfig {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix?: string;  // defaults to 'rl'
}
```

**Mechanism:** Redis fixed-window counter using `INCR` + `EXPIRE`:

1. Build key: `${keyPrefix}:${routePath}:${userId || ip}`
2. `INCR` the key. If result is `1`, `EXPIRE` to `windowSeconds`
3. If count exceeds `maxRequests`, return HTTP 429 with body `{ error: 'TOO_MANY_REQUESTS' }` and header `Retry-After: <seconds>` (value is the TTL remaining on the Redis key, fetched via `TTL` on the 429 path only)
4. On Redis error, fail open — log and call `next()`

**`retryAfter` calculation:** When limit is hit, fetch `TTL` on the key to get seconds remaining. Only called on 429 path, not on every successful request.

**Key prefix convention:** Routes configure their own prefix at mount time. Examples for future use:
- UGC submit: `keyPrefix: 'ugc_submit'` (3 req / 86400s)
- Login: `keyPrefix: 'auth_login'` (5 req / 900s)

**No existing routes are rate-limited in this slice.** The middleware is added and exported but not wired. Wiring happens when the UGC endpoint (or other routes) are built.

**Verification:**
- `npm run lint --workspace=server` passes
- `npm run build --workspace=server` passes
- Unit test: passes through under limit, returns 429 when exceeded, fails open on Redis error

---

### Slice 4: Admin DB scaffold

**Workspace:** admin
**Files changed:** `admin/package.json`, `admin/src/lib/database.ts` (new), `admin/src/app/api/health/route.ts` (new), `docker-compose.yml`, `.env.example`

Wire the admin Next.js app to the OLTP database so future Task 5.2 can build UGC review/approval API routes. The admin currently has zero database access.

**What's added:**

1. **`pg` dependency** in `admin/package.json` — same driver the server uses (`pg` v8.x). The one necessary new dep for this entire design.

2. **`admin/src/lib/database.ts`** — exports `oltpPool` and `withOLTPTransaction` with the same shapes and config as `server/src/database/connection.ts`. Intentional duplication (separate container, separate process; the helpers live in `server/src/` not `shared/`). Header comment: `// Mirrors server/src/database/connection.ts — same contract, separate process.`

3. **Env wiring** — add `DATABASE_URL` to admin service in `docker-compose.yml` using the Docker service name: `DATABASE_URL: postgresql://las_flores:las_flores@postgres-oltp:5432/las_flores`. Add to `.env.example`.

4. **`admin/src/app/api/health/route.ts`** — `GET` handler that runs `SELECT 1` via `oltpPool` and returns `{ status: 'ok', db: true }`. Proof-of-life endpoint. No auth required.

**What's not added:**
- No admin auth middleware (deferred)
- No UGC routes (deferred to Task 5.2)
- No GitHub integration (deferred to Task 5.2)
- No server-side code changes
- No schema migrations

**Verification:**
- `npm run build --workspace=admin` passes
- `docker compose build admin && docker compose up -d admin`
- `curl http://localhost:3001/api/health` returns `{ status: 'ok', db: true }`

---

## Out of scope (deferred to Task 5.2 proper)

- `ugc_submissions` table migration (`028_ugc_submissions.sql`)
- `POST /ugc/submit` game server endpoint
- Admin UGC review UI (Monaco editor, dashboard table)
- Admin approval API route (`/api/ugc/approve`)
- GitHub API integration (`GITHUB_ADMIN_TOKEN`, `GITHUB_CONTENT_REPO`)
- `written_by` → auto-feed-post in migration engine
- Wiring rate limiter to actual endpoints
- Admin authentication middleware

## Dependency graph

```
Slice 1 (shared schemas)  ←── no deps on other slices
Slice 2 (server validator) ←── depends on Slice 1 (new schemas must parse)
Slice 3 (rate limiter)      ←── no deps on other slices
Slice 4 (admin DB)          ←── no deps on other slices
```

Slices 1, 3, and 4 are fully independent. Slice 2 should land after Slice 1 (the `written_by` field must exist in schemas before the validator tests it), but the code change is trivial and won't break if Slice 1 hasn't landed yet (the validator just won't exercise the new field).

## Risks

| Risk | Mitigation |
|---|---|
| Validator refactor accidentally changes behavior | `validateYAMLFile()` wrapper preserves exact same code path. `validateContentString()` is additive only. Verified by `validate:content` output comparison. |
| `pg` dep bloats admin container | Admin already runs in Docker; `pg` is ~2MB unpacked. Same major version as server. No alternative — this is the only way to talk to Postgres from Node. |
| Admin `DATABASE_URL` leaks if admin container is exposed | Admin auth is deferred but port 3001 should NOT be publicly exposed. Network isolation is the interim security posture. Documented as a TODO. |
| Rate limiter Redis failure blocks all rate-limited routes | Fail-open design: Redis errors log and pass through. Gameplay unaffected. |
