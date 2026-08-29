# Story Builder Operations & Runbook

> Operational findings, verification results, and runbook procedures for the Story Builder pipeline.
>
> **Created**: 2026-07-21 (extracted from `docs/NEXT_STEPS.md`)

## 1. End-to-End Pipeline Verification (2026-07-21)

**Verified**: Full pipeline works end-to-end.

## 1.1. CLI-First Plan Intake

Use the CLI to exercise the same proposal boundary that the future admin textarea
endpoint should use. Write the request as Markdown outside `content/`, then run:

```bash
npm run seed:dev --workspace=server
npm run plan:intake --workspace=server -- path/to/intake.md \
  --user-id f0000000-0000-4000-8000-00000000a001
```

> `seedAdmin.ts` derives the seeded admin's email from `ADMIN_EMAIL` (default
> `dev-admin-f0000000-0000-4000-8000-00000000a001@example.com`), so `--user-email
> admin@example.com` does **not** match the seeded account. Use `--user-id` with the
> seeded admin UUID above, or `--user-email` with the actual `ADMIN_EMAIL` value.

The command reads the Markdown as the plan description, calls the graph-based AI
intake service, and records the result as a `content_plans` row with status
`proposed` and `created_by` set to the selected admin/developer user. It also writes
the generated `ContentDelta` nodes and edges to Neo4j. The command prints the plan
ID, graph counts, and an admin review URL.

The default development actor is the seeded admin ID
`f0000000-0000-4000-8000-00000000a001` (email derived from `ADMIN_EMAIL`; not
`admin@example.com`). Prefer `--user-email` with the real `ADMIN_EMAIL` value or
`--user-id` with that UUID when several development users exist. `PLAN_ACTOR_USER_ID`
can provide the actor non-interactively.

### Prerequisites

- A live local stack: `npm run seed:dev --workspace=server` (seeds the admin user
  and content context), an OLTP database reachable via `DATABASE_URL`, and the
  intake-worker / game-server env loaded from `.env`.
- **Neo4j enabled** — `NEO4J_ENABLED=true` with `NEO4J_URI` / `NEO4J_USER` /
  `NEO4J_PASSWORD` set. The graph intake path throws `GraphIntakeDisabledError`
  when the authoring graph is off, because plan deltas are written to Neo4j.
- **LiteLLM reachable** — `LITELLM_BASE_URL` / `LITELLM_API_KEY` / `LLM_MODEL` set
  so `chatService.propose` can return structured deltas + edges. Write the intake
  request as Markdown **outside** `content/` (e.g. `/tmp/intake.md`).

### Live-stack probe

The probe in `server/scripts/probe_plan_intake.ts` exercises the same
`createPlanFromDescription` path the CLI uses and asserts the M50 acceptance
criteria against the live stack (with Neo4j + LiteLLM enabled):

```bash
npx tsx server/scripts/probe_plan_intake.ts /tmp/intake.md \
  --user-id f0000000-0000-4000-8000-00000000a001
```

It checks that `content_plans.status = proposed`, `created_by` matches the actor,
Neo4j contains `ContentDelta` nodes and edges for the returned `planId`, and the
review URL is well-formed. It exits non-zero on any assertion failure. Note: the
probe does **not** stage files, migrate content, publish assets, or approve — it
stops at `proposed` exactly like the CLI.

### Unit tests

`server/tests/unit/plan-intake-cli.test.ts` covers the pure CLI helpers (argument
parsing, actor resolution, missing-user and non-admin rejection, and review-URL
formatting) without a live stack. Run with:

```bash
npm run test:unit --workspace=server -- plan-intake-cli
```

This is intentionally review-only. It does not stage files, migrate canonical
content, publish assets, approve the plan, or run solidify. Review the plan in the
admin UI and inspect its Neo4j deltas before a later approval step. `proposed` is
the existing review-ready state; no separate `working` status is needed.

#### 1.1.1 Fail-open intake: a plan full of notes + the amend loop

Intake is **lenient by contract**. If the LLM cannot confidently resolve a
natural-language reference (e.g. "City Center"), or if a delta/edge references a
node that does not exist in the canonical graph, intake does **not** abort. It:

- drops the offending delta/edge from the write set,
- keeps the plan (the `content_plans` row survives — it is never deleted on an
  ambiguity),
- and records each unresolved reference as a **note** with a human-actionable
  suggestion.

Every note is persisted as a `critique_annotations` row scoped `'intake'`
(`type: 'suggestion'`), so it reuses the exact comment/amend loop the critique
system already has. The printed JSON carries `notes: [{ nodeType, nodeId, field,
status, raw, suggestion, candidates, annotationId }]`, and stderr prints one
directly-runnable line per note:

```text
[note] Scene:8f2a... (district) "City Center" is ambiguous — City District (0.82) or Central District (0.71). <suggestion text>
  → npm run plan:amend --workspace=server -- <planId> --annotation <annotationId>:"<your comment>"
```

**Prerequisites** are the same as §1.1 (live `npm run seed:dev`, Neo4j enabled,
LiteLLM reachable).

**Amend runbook.** Reply to any note by attaching a comment to its annotation id.
`plan:amend` re-proposes against the *same* plan scoped to that annotation, applies
the resulting deltas (the `MERGE` on `(nodeType, nodeId, planId)` overwrites the
flagged delta in place — no separate "replace" step), and re-runs the same triage +
suggestion + annotation-attach flow, so the printed notes reflect the refreshed
state — including a fresh note when the amendment only partially resolved the
ambiguity. An annotation whose comment resolved its delta is auto-marked
`'addressed'`; an empty/again-unresolvable correction leaves it `'open'`.

```bash
# After an intake run, reply to one note:
npm run plan:amend --workspace=server -- <planId> \
  --annotation <annotationId>:"it means City District"

# Reply to several notes in one run (repeatable flag):
npm run plan:amend --workspace=server -- <planId> \
  --annotation <id1>:"it means City District" \
  --annotation <id2>:"link it to Scene:abc123"

# Actor resolution mirrors plan:intake (--user-id / --user-email / PLAN_ACTOR_USER_ID).
```

Unit coverage: `server/tests/unit/plan-intake-cli.test.ts` (`parseAmendArgs`,
`amendUsage`). Integration coverage:
`server/tests/integration/graph-intake.integration.test.ts` (the "fail-open graph
intake" block forces a missing base node + dangling edge and asserts the plan is
created, not deleted, with `notes`/annotations present).

### M50 — Graph-assisted entity resolution + consistency validation (2026-08-28)

M50 adds a graph-assisted validation layer **in front of** the approve gate (the
materialize/migrate/verify path is unchanged). Two new services and an alias seed
make natural-language intake references safe.

- **`EntityResolutionService`** (`server/src/services/EntityResolutionService.ts`)
  resolves each natural-language reference found in a delta (e.g. a Scene's
  `district` field) to ranked canonical `:Content` nodes with a confidence score
  and a status: `resolved` (single high-confidence match), `ambiguous` (several
  plausible matches), or `unresolved` (nothing above threshold). Strategy order:
  exact name/alias match → normalized match (lowercase, strip accents/punctuation,
  drop role words like `district`/`zone`) → Levenshtein-bounded fuzzy match →
  graph-context disambiguation (a candidate whose neighbors are also referenced by
  the plan scores higher). The result is persisted on each `:ContentDelta` as
  `resolutionJson` and surfaced in the plan's `_resolution` blocks. The materialize
  path ignores `_resolution`.
- **`PlanConsistencyChecker`** (`server/src/services/PlanConsistencyChecker.ts`)
  runs at approve time (after the drift check, before status flips to `approved`)
  and attaches a non-blocking `_consistency` report to the plan: location-district
  mismatch, prose-vs-field district contradiction, and orphan relationships. It
  **warns** on conflicts but does not block (the structural "Unmapped edge type"
  failure still blocks, as before).
- **`GraphAliasService`** (`server/src/services/GraphAliasService.ts`) seeds
  `(:Alias)-[:ALIAS_OF]->(:Content)` nodes from the curated, reviewed
  `server/src/data/seed-aliases.json` (NOT LLM-generated) and prunes orphans whose
  target no longer exists. It is wired into `seed:graph` and `resync:graph`, so
  aliases stay consistent with the canonical graph. Common alternate names
  ("El Centro" → City District, "Industrial Zone" → Industrial District) then
  resolve via the alias match above.

Prerequisites for resolution/aliases to work:

```bash
npm run seed:graph --workspace=server   # seeds :Content base graph + curated aliases
# or, to repair drift and re-seed aliases:
npm run resync:graph --workspace=server
```

The CLI now also returns a `_resolution` count implicitly via the probe; see the
live-stack probe section for the added assertions.

### M50 unit tests

```bash
npm run test:unit --workspace=server -- \
  EntityResolutionService PlanConsistencyChecker GraphAliasService
```

- `EntityResolutionService.test.ts`: exact/normalized/fuzzy/alias match, ambiguous
  case, unresolved case, graph-context disambiguation, and `resolvePlanDeltas`
  attaching `_resolution` (skipping UUID references).
- `PlanConsistencyChecker.test.ts`: location-district mismatch, prose-vs-field
  contradiction, orphan relationship, and a clean plan producing an empty report.
- `GraphAliasService.test.ts`: curated-alias load, seed-as-`(:Alias)-[:ALIAS_OF]`,
  prune-orphans, and no-op when Neo4j is disabled.

Integration (guarded by `NEO4J_ENABLED`):

```bash
npm run test:integration --workspace=server -- \
  tests/integration/graph-intake.integration.test.ts
```

If the plan is accepted as a new milestone, record the reviewed decision in the
appropriate `docs/milestones/` document and use the normal approve → solidify →
migrate → verify pipeline to materialize authored content.

| Test | Input | Result | Notes |
|------|-------|--------|-------|
| LiteLLM health | `curl localhost:4000/health` | PASS | Healthy endpoints confirmed |
| Server → LiteLLM | `wget from container` | PASS | Model list returned successfully |
| Plan generation | "UNIQUE TEST XYZ789 - cyberpunk detective named Alice in Las Flores 2077" | PASS | `outline_source: llm`, 3 items created |
| File creation | `find content/` | PASS | Files in `content/<type>/<slug>/` with correct names |
| File names | `ls content/...` | PASS | No `${item.slug}.md` files, correct filenames |
| Fill job | `GET /plans/:id/generation-status` | PASS | status: done, 3/3 items completed |

### Issues Fixed During Verification

1. **`__dirname` undefined in ES modules** (`StoryBuilderLore.ts:12`)
   - **Root Cause**: TypeScript ES modules don't have `__dirname` available by default
   - **Fix**: Added `import { fileURLToPath } from 'node:url'` and `const __dirname = path.dirname(fileURLToPath(import.meta.url))`. `resolveContentDir()` now uses `path.resolve(__dirname, '..', '..', 'content')`.

2. **Template literal evaluation bug** (`admin-story-builder-generate.ts:70,73`)
   - **Root Cause**: `tsx` doesn't evaluate template literals like `${item.slug}.md` in certain contexts
   - **Fix**: Replaced `${item.slug}.md` with `item.slug + '.md'` and `${item.slug}.prompt.md` with `item.slug + '.prompt.md'`

3. **Import path using .ts extension** (`admin-story-builder-generate.ts:7`)
   - **Fix**: Changed `from '../services/StoryBuilderLore.ts'` to `from '../services/StoryBuilderLore.js'`

4. **Missing LITELLM_API_KEY**
   - **Fix**: Added `-e LITELLM_API_KEY="local-key"` to container startup

5. **`outline_source` not set for non-repaired plans** (`ContentPlanService.ts:153-159`)
   - **Fix**: Always set `outline_source` to `'llm'` by default in `validateAndRepairOutline`

### Plan Quality Check

- `outline_source: 'llm'` (confirmed after fix)
- Item names reflect input: "Alice", "Alice's Office", "XYZ789 Investigation"
- Top-level descriptions are LLM-generated and relevant
- Field descriptions contain `TODO:` placeholders (by design for fill step)
- Files created with correct structure: YAML + .md + .prompt.md

---

## 2. Probe Content Production Verification (2026-07-21)

**Input File**: `~/Downloads/posts-compilation-complete.md` (Real Heroism in Latam story bible)
**Plan ID**: `aa6687b9-1c6f-48f8-853e-a3bc392c0f49`

| Test | Result | Notes |
|------|--------|-------|
| Input file check | PASS | `posts-compilation-complete.md` exists with 18834 bytes |
| Server health | PASS | `wget localhost:3000/health` returns `{success: true}` |
| LiteLLM connectivity | PASS | `curl localhost:4000/health` returns healthy endpoints |
| Plan creation (retry) | PASS | 12 items, 55698ms |
| Fill job completion | PASS | status: done, 12/12 items completed, 0 failed |
| YAML files created | PASS | `char_*.yaml` and `scene_*.yaml` files exist with LLM content |
| MD files have content | FAIL | `.md` files contain only "TODO: Add lore content." (not filled) |

### Generated Content Summary

- **Story**: real_heroism_in_latam
- **Characters**: sofia_mendoza, mateo_salazar, valentina_cruz (3 total)
- **Scenes**: secondary_city_sunset, school_classroom, rainy_street_motorcycle (3 total)
- **Story Beats**: episode_1_friend_dies, episode_2_superhero_fantasy_challenged, episode_3_institutional_collapse (3 total)
- **Dialogues**: superhero_talk_between_classes, criticism_from_peers (2 total)

### Root Cause: Scaffold vs Fill Race Condition

The scaffold step (synchronous, in `POST /plan`) and the fill step (asynchronous, background job) both write to the same files, but the scaffold step runs second and overwrites the LLM-generated content with TODO placeholders.

**Current Flow**:
1. `generateOutline` → calls `generateForPlan` (async, fire-and-forget) → creates `.md` files with LLM content
2. Scaffold step → unconditionally overwrites `.md` files with TODO placeholders
3. Fill job → only writes YAML files, doesn't touch `.md` files

**Historical Key Finding**: the former async fill job called `generateForItem()` and `generatePromptForItem()` after `fillFields`. That path was retired in M32 and fill behavior is now inlined in `StoryBuilderPlanOps.ts`.

**Fix (historical, resolved)**: the former race was fixed by removing the scaffold
overwrite in `admin-story-builder-generate.ts` so the fill path is the sole writer
of `.md`/`.prompt.md` files. Fill behavior now lives inlined in `StoryBuilderPlanOps.ts`;
verify by confirming `StoryBuilderPlanOps.ts` performs the `.md`/`.prompt.md` writes
after `fillFields` in the current fill implementation.

---

## 3. Fill Existing TODOs Tool

### Purpose

Standalone script to bulk-fill existing TODO placeholders in content files that were scaffolded but never filled with LLM content.

### Implementation

- **File**: `server/src/scripts/fillExistingTodos.ts`
- **Command**: `npm run fill-todos --workspace=server`
- **Provider**: Uses MockProvider (suitable for testing without LiteLLM)

### Behavior

1. Scans content directory using `scanForTodoPlaceholders()`
2. Logs all files with TODO placeholders
3. For each item, calls `generateForItem()` for `.md` files and `generatePromptForItem()` for `.prompt.md` files
4. Only overwrites files that contain TODO placeholders (preserves user-edited content)
5. Handles errors gracefully and reports summary: `{ filled: N, skipped: M, errors: K }`

### Verification Results (2026-07-21)

| Run | Result | Notes |
|-----|--------|-------|
| First run from project root | PASS | Found 13 items with TODO, filled 14 files, skipped 12 |
| Second run (resume mode) | PASS | Found 9 items with TODO, filled 3 files, skipped 15 |
| Third run (resume mode) | PASS | Found 9 items with TODO, filled 3 files, skipped 15 |

### Acceptance Criteria Met

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `rainy_street_motorcycle.prompt.md` no longer contains "TODO" | PASS | grep returns exit code 1 (not found) |
| `sofia_mendoza.md` no longer contains "TODO" | PASS | grep returns exit code 1 (not found) |
| `sofia_mendoza.md` contains >50 chars | PASS | 1569 characters |
| Script outputs summary format | PASS | `{ filled: N, skipped: M, errors: K }` |

### Known Limitations

- Files with TODO in YAML metadata (e.g., `faction: 'TODO: Add faction'`) will generate prompts containing "TODO" — this is expected; the script only fills file-level TODO placeholders, not YAML field values
- Dialogue YAML files with TODO in node text are not processed — these require a separate YAML fill operation

---

## 4. Pipeline Gotchas

### 4.1 Content Directory Path Resolution

**Problem**: `LoreGenerator.ts` and `PromptFileGenerator.ts` used `path.resolve(process.cwd(), 'content')` which resolves to `/app/server/content` instead of `/app/content` when running from the server directory.

**Current State**: FIXED. `LoreGenerator.ts` uses `resolveContentDir()` from `StoryBuilderLore.ts` (also re-exported from `server/src/routes/admin-content.helpers.ts`). `PromptFileGenerator.ts` takes `contentDir` as a parameter — callers pass the correct resolved path.

**Cleanup**: If you previously ran without the fix, check for and remove any `server/content/` directory that may have been created.

### 4.2 TODO Placeholders: File vs YAML

- **File-level TODO**: In `.md` or `.prompt.md` files → `fillExistingTodos.ts` handles these
- **YAML field TODO**: In YAML `metadata.faction: 'TODO: Add faction'` → the inlined fill logic in `StoryBuilderPlanOps.ts` handles these fields.

The inlined fill logic defines which YAML fields get LLM-filled. Characters cover 20+ fields (description, title, physical_description, psychological_description, metadata.personality, metadata.faction, metadata.age, etc.). Scene, location, mission, overlay, vault, gig, shop_item, story, and story_beat types are also covered. See `StoryBuilderPlanOps.ts` for the current implementation.

### 4.3 LLM Placeholder Behavior

The outline step intentionally creates items with `TODO:` placeholders for all prose fields. The fill step replaces them with LLM-generated content. The `name` and top-level `description` are LLM-generated during outline; `fields.*` are all `TODO:` by design.

---

## 5. Podman + LiteLLM Operational Findings

### 5.1 Key Findings

1. **`podman-compose` does not expand `${VAR:-default}` syntax** — Environment variables are passed literally. Use `podman run` with explicit `-e` flags instead.
2. **No aardvark-dns = no container DNS** — Container hostnames don't resolve. Use container IPs directly in `DATABASE_URL`, `REDIS_URL`, etc.
3. **litellm must run on the host** — The litellm container can't reach external APIs. Run litellm on the host: `litellm --config ~/litellm_config/config.yaml --port 4000`. Server reaches it via `--add-host=host.containers.internal:host-gateway` + `LITELLM_BASE_URL=http://host.containers.internal:4000`.
4. **Server requires `LLM_PROVIDER=litellm`** — Default is `mock`, which returns minimal deterministic plans.
5. **LiteLLM connectivity confirmed**: Server container CAN reach LiteLLM with `LITELLM_API_KEY=local-key`.
6. **Intermittent timeouts**: Some requests succeed, others timeout. May be due to poolside model streaming.
7. **LiteLLM `content` vs `reasoning_content`**: `callLLM` falls back to `reasoning_content` when `content` is null (poolside models omit `content` on the first chunk).

### 5.2 Working Local Startup Sequence

```bash
# 1. Start litellm on the host
pkill -f litellm 2>/dev/null; sleep 1
litellm --config ~/litellm_config/config.yaml --port 4000 &
sleep 5 && curl -s http://localhost:4000/health

# 2. Start infrastructure containers
podman network create las-flores-net 2>/dev/null
podman run -d --name las-flores-postgres-oltp --network las-flores-net -p 5434:5432 \
  -e POSTGRES_DB=las_flores -e POSTGRES_USER=las_flores \
  -e POSTGRES_PASSWORD=las_flores_dev_password docker.io/library/postgres:16-alpine
podman run -d --name las-flores-postgres-olap --network las-flores-net -p 5433:5432 \
  -e POSTGRES_DB=las_flores_analytics -e POSTGRES_USER=las_flores_analytics \
  -e POSTGRES_PASSWORD=las_flores_analytics_dev_password docker.io/library/postgres:16-alpine
podman run -d --name las-flores-redis --network las-flores-net -p 6379:6379 \
  docker.io/library/redis:7-alpine

# 3. Get container IPs and start server
OLTP_IP=$(podman inspect las-flores-postgres-oltp --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
OLAP_IP=$(podman inspect las-flores-postgres-olap --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
REDIS_IP=$(podman inspect las-flores-redis --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

podman build -f server/Dockerfile -t las-flores-server .
podman run -d --name las-flores-server --network las-flores-net \
  --add-host=host.containers.internal:host-gateway -p 3000:3000 \
  -v ./server/src:/app/server/src -v ./shared:/app/shared \
  -v ./content:/app/content -v ./docs:/app/docs:ro \
  -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@${OLTP_IP}:5432/las_flores" \
  -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@${OLAP_IP}:5432/las_flores_analytics" \
  -e REDIS_URL="redis://${REDIS_IP}:6379" \
  -e MINIO_ENDPOINT=10.89.0.5 -e MINIO_PORT=9000 \
  -e MINIO_ACCESS_KEY=minioadmin -e MINIO_SECRET_KEY=minioadmin \
  -e JWT_SECRET=your-jwt-secret-change-in-production \
  -e LITELLM_BASE_URL=http://host.containers.internal:4000 \
  -e LITELLM_API_KEY=local-key \
  -e LLM_PROVIDER=litellm -e LLM_MODEL=poolside/laguna-m.1 \
  las-flores-server

# 4. Verify health
sleep 25 && podman exec las-flores-server wget -qO- http://localhost:3000/health
```

### 5.3 LiteLLM Troubleshooting

If litellm is not responding:
1. Ensure litellm is running: `litellm --config ~/litellm_config/config.yaml --port 4000`
2. Verify litellm is reachable: `curl -s -H "Authorization: Bearer local-key" http://localhost:4000/health`
3. Test connectivity from server container: `podman exec las-flores-server wget -qO- --header="Authorization: Bearer local-key" http://host.containers.internal:4000/v1/models`
4. If DNS resolution fails, use the host's actual IP address in `LITELLM_BASE_URL`
5. For quick testing without LLM: Set `LLM_PROVIDER=mock` in server env, rebuild, and restart.

---

## 6. Story Bible Ingestion Probe

### Input File

`~/Downloads/posts-compilation-complete.md` — 1k-line story bible for "Real Heroism in Latam" (character Graciela Ramírez, family members, South American city scenes). Reuse as the canonical input for any future end-to-end authoring or latency tests. Do not move into `content/` or `docs/`.

### Running the Probe

```bash
# Server must be running and migrated
podman exec las-flores-server wget -qO- http://localhost:3000/health   # expect {"success":true}

# Run the end-to-end probe against the story bible (argv form)
npx tsx server/scripts/latency_probe.ts ~/Downloads/posts-compilation-complete.md \
  --full --server http://localhost:3000

# Env form still supported (and the file defaults to ~/Downloads/posts-compilation-complete.md):
# INPUT_FILE=~/Downloads/posts-compilation-complete.md SERVER_URL=http://localhost:3000 \
#   npx tsx server/scripts/latency_probe.ts
# FULL_INPUT=1 sends the whole body (same as --full). BRIEF_MAX_CHARS controls default truncation.

# After probe completes, check the host's content/ directory:
# ls -la content/characters/graciela_ramirez/
# ls -la content/scenes/central_plaza/
```

Exit codes: `0` = probe completed, `1` = runtime/probe failure (including an
unreadable input file — there is no silent fallback description), `2` = bad CLI
usage (`--help` prints usage and exits `0`). `--description "<text>"` runs the
probe without any story-bible file.

---

## 7. Env Vars Reference

| Var | Default | Purpose |
|-----|---------|---------|
| `LLM_PROVIDER` | `mock` | `mock` or `litellm` |
| `LITELLM_BASE_URL` | `http://litellm:4000` | LiteLLM gateway URL |
| `LITELLM_API_KEY` | — | LiteLLM API key |
| `LLM_MODEL` | `poolside/laguna-m.1` | Model name |
| `LLM_TIMEOUT_MS` | `60000` | Base LLM timeout |
| `LLM_MAX_TIMEOUT_MS` | `300000` | Max LLM timeout (escalation cap) |
| `LLM_OUTLINE_MODEL` | `<LLM_MODEL>` | Alternative model for outline fallback |
| `PLAN_FILL_CONCURRENCY` | `3` | Parallel fill workers |
| `PLAN_OUTLINE_CONTEXT_DEPTH` | `names` | Context depth for outline |
| `PLAN_OUTLINE_MAX_INPUT_CHARS` | `10000` | Input size threshold for two-pass chunked ingestion |
| `LLM_OUTLINE_MAX_TOKENS` | `4096` | Max tokens on outline LLM calls |
| `LLM_OUTLINE_INITIAL_MAX_ITEMS` | `15` | Initial item count cap for outline generation |
| `PLAN_FILL_TIMEOUT_MS` | `120000` | Per-item fill timeout |
## 8. Telemetry: admin_events is OLTP

The `admin_events` table stores Story Builder telemetry and admin audit events.
It is **intentionally OLTP** (not OLAP) to provide low-latency event capture.

- **Why OLTP**: Admin UI event emission must not introduce the latency or
  overhead of an OLAP write path.
- **Implementation**: `AdminEventEmitter.emitAdminEvent()` uses `queryOLTP`
  and swallows errors internally so the caller is never blocked.
- **Migration**: `060_admin_events_solidified.sql` extends the `event_type`
  CHECK to include `'plan_solidified'` for the Approve & Ship flow.
