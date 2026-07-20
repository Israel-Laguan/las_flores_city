# Next Steps

> Open **action items** and **gaps** across the admin panel, content intake, and story-progression areas. When an item is done, remove it here and update the relevant long-term reference doc.
>
> Last updated: 2026-07-20

---

## Open work

### NEXT — Split story-bible plan generation into outline → scaffold → async fill

**Status:** planned, not started. Pick up here in a new chat.

**Problem.** `POST /admin/story-builder/plan` makes **one** LLM call (`LiteLLMProvider.parseDescription` → `callLLM`, `server/src/services/LiteLLMProvider.ts:168`) with a 60s timeout (`timeoutMs ?? 60_000`, line 23) that must emit the **entire** plan — including all prose (descriptions, mood, personality, history, daytime, nightlife) — in one JSON blob. For the 1k-line story bible (`~/Downloads/posts-compilation-complete.md`) the completion blows past 60s → `The operation was aborted due to timeout`. The "current is fine" assumption does not hold for non-trivial inputs.

**Root cause, verified from code.** The LLM is genuinely needed for only two things: (1) **deciding** the m new items given the N existing (which types, names/slugs, relations) — the "reason over N+m" step; (2) **writing prose** to replace `TODO:` placeholders. The scaffolding itself (file names/types + `TODO:` prose) is already **deterministic and template-driven** — `ContentSkeletonGenerator.generateYaml` (`server/src/services/ContentSkeletonGenerator.ts:178`) + `resolveFilePath` (line 186) map `type → content/<type>/<slug>/<prefix><slug>.yaml` with full `TODO:` structure, no LLM. It runs today inside `stagePlan` (`server/src/services/StoryBuilderPlanOps.ts:273`). The per-item fill infra also already exists and is dormant: `ContentFillService.fillFields`/`mergeFilledFields` (`server/src/services/ContentFillService.ts:46,85`), `buildFillFieldsPrompt` (`server/src/services/LLMPrompts.ts:212`), `generateFill` (`LiteLLMProvider.ts:186`), provenance via `filled_fields` (consumed by `admin/src/app/story-builder/components/ContentCard.tsx:224`). It's dormant because `parseDescription` writes all prose itself, so nothing is `TODO:` by the time `stagePlan` runs.

**Two design decisions (locked).**
1. **Async fill with job-status poll** (mirrors the solidify pattern in `server/src/services/StoryBuilderOrchestrator.ts:38-88`, `setJobStatus`/`getSolidifyJobStatus`). Outline stays synchronous (output is identifiers only → *expected* to be output-bound and fast, but treat "under 60s even for large N" as a **hypothesis to validate** in the verification probe, not a given; if large N makes the outline itself slow, trim context to names-only).
2. **Files written directly to `content/` during generate, git is the rollback.** Aligns with the content-layering contract (`content/` = dev-mode file database; `migrateContent` upserts file → DB). This just reorders *when* files appear (generate instead of approve).

**Generation flow (4 steps).**

1. **Outline — sync, LLM, the one "reason over N+m" step** (`POST /admin/story-builder/plan`). `gatherContext()` loads N existing items (`ContentPlanService.ts:181`) + description → one LLM call → per new item `{id, type, name, slug, action, one-line description, dependsOn}`, all prose fields `TODO:`. `ContentPlanSchema` already accepts `TODO:` strings (`fields: z.record(string, any)`, `shared/src/schemas/story-builder.ts:20`) + optional `filled_fields` → **no schema change, no new migration**.
2. **Scaffold + write files — sync, deterministic, no LLM** (still in `POST /plan`, before returning). Run `checkCreateConflicts` (moved up from `stagePlan:240`) first. For **`create`** items: write `content/<type>/<slug>/<prefix><slug>.yaml` (via `generateYaml` with `TODO:` placeholders) + `<slug>.md` lore stub + `<slug>.prompt.md`, exactly as `stagePlan`'s `writePlanItems`/`generateLoreStubs`/`generatePromptFiles` do. For **`update`** items: no file write (targeted merges happen at fill/stage). Persist `content_plans` row (`status: draft`) with `plan_json` = skeleton. Fire background `runPlanFill(planId)`. Return `{ planId, plan: skeleton, status: 'generating' }` immediately.
3. **Fill — async, LLM, per-item, bounded-parallel (~3-4), non-fatal** (`runPlanFill`). For each item: `fillFields`+`mergeFilledFields` → `generateFill`. **Dual-write**: replace `TODO:` in the file on disk **and** mirror filled values into `plan_json` (so the Review UI, which reads `plan_json`, stays correct). Lore generation folds in here (today it's a detached `.catch` in `ContentPlanService.parseDescription:36`). Update cache `story-builder:gen:<planId>` at each stage (separate prefix from solidify's `story-builder:job:`). Per-item failure → warn + leave `TODO:` (the `stagePlan` fill loop stays as a safety net). Terminal: flip `draft → proposed`, write final `plan_json`.
4. **Approve-and-solidify — revised** (`approveAndSolidifyPlan` → `runSolidify`). Files already exist → `stagePlan` **skips its write-files step** for already-scaffolded plans; it now does: re-run fill safety-net for leftover `TODO:`s → `applyLink` (cross-links) → `validateContent` → `migrateStagedPlan` (DB upsert). `rollbackFiles` on validation failure stays.

**File-level changes.**

- *Server*: `LLMPrompts.ts` (`buildSystemPrompt` → skeleton-only output with `TODO:` prose placeholders; `buildFillFieldsPrompt` unchanged); `ContentPlanService.ts` (split `parseDescription` into `generateOutline(description)` + reusable `fillPlanItems(plan, context, provider)` bounded-parallel/non-fatal; remove detached lore `.catch`); **new** `server/src/services/PlanGenerationJob.ts` (`PlanFillJobStatus`, `setPlanFillJobStatus`/`getPlanFillJobStatus`, `runPlanFill(planId, userId)`, `resetOrphanedFillJobs()` for startup recovery); `StoryBuilderPlanOps.ts` (`stagePlan`: skip write-files when plan already scaffolded, keep fill safety-net/applyLink/validate/migrate; reuse `checkCreateConflicts` in generate); `routes/admin-story-builder-actions.ts` (`POST /plan`: outline → scaffold+write → persist draft → fire `runPlanFill` → return `{planId, plan, status:'generating'}`; add `GET /plans/:id/generation-status`); `LiteLLMProvider.ts` (optional per-call `timeoutMs` so outline can use a shorter timeout); `MockProvider.ts` (outline returns skeleton with `TODO:`; `generateFill` already deterministic); `server/src/index.ts` (call `resetOrphanedFillJobs()` next to `resetOrphanedSolidifyJobs()`).
- *Shared/DB*: none. `draft`→`proposed`→approve path; all statuses already in the CHECK constraint (migration 055).
- *Client* (`admin/src/app/story-builder`): `hooks/useStoryBuilderApi.ts` (`generatePlan` returns `{planId, plan, status}`; add `getGenerationStatus(planId)` mirroring `getJobStatus`); `hooks/useStoryPlanApiHandlers.ts` (`makeGeneratePlan`: set skeleton+planId+step 2 from generate response, then **poll `getGenerationStatus`** and refresh plan from DB as items fill, stop on terminal; **skip the redundant `savePlan`** on the generate path — row now exists; `savePlan` stays for template/clone/edit); `components/ContentCard.tsx` (already keys off `filled_fields`/`TODO:`; add a subtle "generating…" affordance on in-progress fields).
- *Probe*: `server/scripts/latency_probe.ts` (`[2]` reads skeleton+planId, polls `generation-status` to terminal, then calls approve-and-solidify instead of the current `PUT verified` bypass since files now exist and need migration; report outline time, scaffold time, fill time, total).

**Behavioral sub-decisions (made, correct if wrong).** Dual-write (file + `plan_json`) so Review UI works without reading files (alt: files-as-source-of-truth — bigger client change, not recommended). `DELETE /plans/:id` removes the DB row + generation-job cache but **leaves files** for `git checkout content/` rollback (optional `?cleanFiles=true` later). `refinePlan` out of scope this pass — still one-shot; files-during-generate makes refine's slug-conflict surface larger → deliberate follow-up. `create` vs `update` distinction carried forward (create → write new scaffold; update → no file write, targeted merge at fill/stage).

**Risks.** Orphan files on discard — accepted, git rollback (doc'd). Dual-write consistency — both derive from the same fill result; file-write failure marks that item's fill failed and leaves `TODO:`. `previewPlan` (dry-run) must account for files already existing post-generate — verify behavior. `refine` slug conflicts — deferred.

**Verification.** `npm run lint --workspace=server`, `npm run build --workspace=server`, `npm run test --workspace=server` (unit + new outline→scaffold→fill tests + generation-job test). Extend `server/tests/unit/contentPlanService.test.ts`; add `server/tests/unit/plan-generation-job.test.ts`; update tests assuming sync-filled `POST /plan`. Rebuild/restart per AGENTS.md; live probe `INPUT_FILE=~/Downloads/posts-compilation-complete.md SERVER_URL=http://localhost:3000 npx tsx server/scripts/latency_probe.ts` → confirm outline+scaffold completes fast, fill job reaches `done`, files appear under `content/` with non-`TODO:` prose, total outline leg under 60s. Then update the "LLM call timeout" note in the "How to run the story-bible ingestion" section below to reference this split design.

### Future extensions (aspirational, not planned)

- External queue (redis/streams) / SSE / horizontal scaling beyond single server — requires AGENTS.md constraint lift on new infra.

### Input file to reuse for future tests

- **`~/Downloads/posts-compilation-complete.md`** — 1k-line story bible for "Real Heroism in Latam" (character Graciela Ramírez, family members, South American city scenes). Reuse as the canonical input for any future end-to-end authoring or latency tests. Do not move into `content/` or `docs/` — it is not game content; it is the raw ingestion test fixture.

#### How to run the story-bible ingestion

The probe (`server/scripts/latency_probe.ts`) reads the input file and derives the Story Builder description from it (first heading + body brief), so a run always exercises the file path. With the dev server up:

```bash
# Server must be running and migrated (see AGENTS.md clean-shutdown pattern)
podman exec las-flores-server wget -qO- http://localhost:3000/health   # expect {"success":true}

# Run the end-to-end probe against the story bible
INPUT_FILE=~/Downloads/posts-compilation-complete.md \
  SERVER_URL=http://localhost:3000 \
  npx tsx server/scripts/latency_probe.ts
```

**IMPORTANT — LLM call timeout** (current workaround; the `NEXT` plan above replaces this with outline→scaffold→async fill): The full 1k-line story bible generates a large plan prompt that can exceed the 60s default timeout in `LiteLLMProvider`. If the probe fails with `The operation was aborted due to timeout`, either:
1. Use a shorter input file (trims the 1200-char brief)
2. Increase `timeoutMs` in `LiteLLMProvider` constructor (currently defaults to 60_000)
3. Use a faster model via `LLM_MODEL` env var

Expected: plan reaches `verified`; `content/` gains new `characters/`, `scenes/`, `locations/` folders each with `<slug>.yaml`, `<slug>.md`, `<slug>.prompt.md`; asset needs transition `pending → generating → drafted`. If you see `failed` with `ENOENT prompt.md`, the prompt stub step was skipped — that is a separate asset-generation issue, not the `gatherContext` crash.

### Podman + litellm operational findings (2026-07-20)

These findings save significant time on future local runs:

1. **`podman-compose` does not expand `${VAR:-default}` syntax** — Environment variables like `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-las_flores_dev_password}` are passed literally to the container, causing auth failures. **Workaround**: use `podman run` with explicit `-e POSTGRES_PASSWORD=las_flores_dev_password` instead of `podman-compose up`.

2. **No aardvark-dns = no container DNS** — Podman rootless without `aardvark-dns` means container hostnames (e.g., `las-flores-postgres-oltp`) don't resolve. **Workaround**: use container IPs directly in `DATABASE_URL`, `REDIS_URL`, etc. Get IPs with `podman inspect <container> --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`.

3. **litellm must run on the host, not in a container** — The litellm container can't reach external APIs (poolside.ai, openrouter.ai) because DNS resolution fails inside podman containers. **Workaround**: run litellm on the host: `litellm --config ~/litellm_config/config.yaml --port 4000`. The server container reaches it via `--add-host=host.containers.internal:host-gateway` + `LITELLM_BASE_URL=http://host.containers.internal:4000`.

4. **Server requires `LLM_PROVIDER=litellm`** — The default is `mock`, which returns minimal deterministic plans (1 item, 0 asset needs). To exercise the real LLM pipeline, set `LLM_PROVIDER=litellm` in the server container's environment.

5. **Migration 055 must be in `migration-targets.json`** — The CHECK constraint migration for async statuses (`pending`/`staging`/`migrating`/`verifying`) exists on disk but was not registered. Now added; applies automatically on server startup.

### Working local startup sequence (Podman)

```bash
# 1. Start litellm on the host (needs DNS for external APIs)
pkill -f litellm 2>/dev/null; sleep 1
litellm --config ~/litellm_config/config.yaml --port 4000 &
sleep 5 && curl -s http://localhost:4000/health  # verify running

# 2. Start infrastructure containers with explicit passwords
podman network create las-flores-net 2>/dev/null

podman run -d --name las-flores-postgres-oltp --network las-flores-net -p 5434:5432 \
  -e POSTGRES_DB=las_flores -e POSTGRES_USER=las_flores \
  -e POSTGRES_PASSWORD=las_flores_dev_password docker.io/library/postgres:16-alpine

podman run -d --name las-flores-postgres-olap --network las-flores-net -p 5433:5432 \
  -e POSTGRES_DB=las_flores_analytics -e POSTGRES_USER=las_flores_analytics \
  -e POSTGRES_PASSWORD=las_flores_analytics_dev_password docker.io/library/postgres:16-alpine

podman run -d --name las-flores-redis --network las-flores-net -p 6379:6379 \
  docker.io/library/redis:7-alpine

# 3. Get container IPs
OLTP_IP=$(podman inspect las-flores-postgres-oltp --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
OLAP_IP=$(podman inspect las-flores-postgres-olap --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
REDIS_IP=$(podman inspect las-flores-redis --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

# 4. Build and start server with LLM config
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

# 5. Verify health
sleep 25 && podman exec las-flores-server wget -qO- http://localhost:3000/health
```

---

## Related docs

- `docs/STORY_BUILDER_DESIGN.md` — shipped implementation, remaining open work (§4.4)
- `docs/ADMIN_ARCHITECTURE.md` — admin panel structure and conventions
- `docs/DATA_INTAKE.md` — content intake paths
