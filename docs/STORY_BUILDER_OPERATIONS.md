# Story Builder Operations & Runbook

> Operational findings, verification results, and runbook procedures for the Story Builder pipeline.
>
> **Created**: 2026-07-21 (extracted from `docs/NEXT_STEPS.md`)

## 1. End-to-End Pipeline Verification (2026-07-21)

**Verified**: Full pipeline works end-to-end.

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
   - **Fix**: Added `import { fileURLToPath } from 'node:url'` and `const __dirname = path.dirname(fileURLToPath(import.meta.url))`

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

**Key Finding**: `PlanGenerationJob.ts:121-135` **already** calls `generateForItem()` and `generatePromptForItem()` after `fillFields`, meaning the fill job DOES write `.md` files. The issue was that the scaffold step (`admin-story-builder-generate.ts:72-76`) overwrites them after the async fill starts but before it completes.

**Fix**: Remove lines 72-76 in `admin-story-builder-generate.ts` so the fill job is the sole writer of `.md`/`.prompt.md` files.

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

**Problem**: `LoreGenerator.ts` and `PromptFileGenerator.ts` use `path.resolve(process.cwd(), 'content')` which resolves to `/app/server/content` instead of `/app/content` when running from the server directory.

**Current State**:
- `StoryBuilderLore.ts` — FIXED (uses `__dirname` + `../../../content`)
- `LoreGenerator.ts:30,98` — NOT FIXED
- `PromptFileGenerator.ts:33,105` — NOT FIXED

**Fix**: Update both files to use `resolveContentDir()` from `StoryBuilderLore.ts`.

**Workaround** (used in `fillExistingTodos.ts`): Uses `process.chdir()` to temporarily change working directory to project root before calling the generation functions.

**Cleanup**: If you previously ran without the fix, check for and remove any `server/content/` directory that may have been created.

### 4.2 TODO Placeholders: File vs YAML

- **File-level TODO**: In `.md` or `.prompt.md` files → `fillExistingTodos.ts` handles these
- **YAML field TODO**: In YAML `metadata.faction: 'TODO: Add faction'` → NOT handled by current scripts

`FILL_TARGETS` in `ContentFillService.ts:6-16` defines which YAML fields get filled. Currently only covers `description`, `metadata.personality`, `title`. Fields like `faction` remain as TODO.

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

# Run the end-to-end probe against the story bible
INPUT_FILE=~/Downloads/posts-compilation-complete.md \
  SERVER_URL=http://localhost:3000 \
  npx tsx server/scripts/latency_probe.ts

# After probe completes, check the host's content/ directory:
# ls -la content/characters/graciela_ramirez/
# ls -la content/scenes/central_plaza/
```

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
| `PLAN_FILL_TIMEOUT_MS` | `120000` | Per-item fill timeout |
