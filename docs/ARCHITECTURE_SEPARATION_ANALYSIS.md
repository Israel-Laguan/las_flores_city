# Architecture Separation Analysis

> **Status:** Brainstorm / analysis document (not an implementation spec).
> **Date:** August 2026
> **Companion docs:** [`FOUNDATION_ARCHITECTURE.md`](./FOUNDATION_ARCHITECTURE.md),
> [`ADMIN_ARCHITECTURE.md`](./ADMIN_ARCHITECTURE.md), [`DATA_INTAKE.md`](./DATA_INTAKE.md),
> [`STORY_BUILDER_DESIGN.md`](./STORY_BUILDER_DESIGN.md).
>
> This document captures a multi-session brainstorm on evolving the Las Flores 2077
> architecture from a single monolithic server toward separated concerns: game runtime,
> content/intake, and AI-plumbed authoring — with content externalized to MinIO/CDN and
> a graph-based authoring canvas using a delta model against a seeded production state.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State — The Three Domains](#2-current-state--the-three-domains)
3. [Coupling Analysis](#3-coupling-analysis)
4. [Separation Options (Code & Process)](#4-separation-options-code--process)
5. [Workload Tensions — Content Reads & Authoring CPU](#5-workload-tensions--content-reads--authoring-cpu)
6. [Content Externalization — MinIO/CDN + Reference DB](#6-content-externalization--miniocdn--reference-db)
7. [Graph DB for Authoring — Feasibility](#7-graph-db-for-authoring--feasibility)
8. [The Delta Model — Plans as Graph Deltas](#8-the-delta-model--plans-as-graph-deltas)
9. [Converged Target Architecture](#9-converged-target-architecture)
10. [Recommended Sequencing](#10-recommended-sequencing)
11. [Open Questions & Risks](#11-open-questions--risks)
12. [The Four-Moment LLM Authoring Lifecycle](#12-the-four-moment-llm-authoring-lifecycle)
13. [AI Semantic Critique & the Conversational Chat Assistant](#13-ai-semantic-critique--the-conversational-chat-assistant)
14. [Evidence Appendix — Key File References](#14-evidence-appendix--key-file-references)
15. [Enrichment — Lessons from the Story-Engine Authoring Discussion](#15-enrichment--lessons-from-the-story-engine-authoring-discussion)

---

## 1. Executive Summary

Las Flores 2077 runs as a **single monolithic Express server** backed by **two Postgres
databases** (OLTP game state + OLAP analytics), one Redis cache, and one MinIO object store.
Inside that monolith, three logical domains are already discernible by their *table
ownership* and *dependency direction*:

| Domain | Responsibility | Touches player tables? |
|---|---|---|
| **Game runtime** | Serves live gameplay to the `client` (dialogue, movement, banking, shop, vault, comms) | ✅ Yes (reads + writes) |
| **Content / Intake** | Reads YAML content folders → validates → upserts into DB content tables → compiles dialogue chunks | ❌ No (content tables only) |
| **AI plumbing** | Calls LLMs and image generators to *produce* content files, then hands them to intake to migrate | ❌ No (content tables + files + external services) |

**The pivotal finding:** the AI/intake layer **never touches player tables**. Verified by
grep — every `StoryBuilder*`/`Content*`/`Plan*` service references only content tables
(`characters`, `dialogue_trees`, `content_plans`, `asset_*`) and the filesystem. The
relationship is **one-way**: intake writes content → game reads content. They never
cross-write. This means the data is *already decoupled* — the code just doesn't reflect it.

This opened the door to a layered evolution:

1. **Logical partitioning** (enforce boundaries with lint, no deploy change)
2. **Process split** — extract intake/AI into a separate worker process
3. **Content externalization** — move heavy content blobs (dialogue nodes, chunks) to
   MinIO/CDN, keep only references (IDs, slugs, FKs) in the DB
4. **Delta-model graph authoring** — a graph DB as the authoring canvas where plans are
   expressed as *deltas* against a seeded production-state base graph, with "approve"
   triggering a graph-merge + the existing materialize pipeline

Each phase builds on the last, and phases 3–4 *reuse* the existing `stagePlan` →
`migrateContent` → `verifyPlan` pipeline — they upgrade the authoring experience and the
read path, not the materialization mechanics.

---

## 2. Current State — The Three Domains

### Domain A — Game Runtime ("the game")

Serves live gameplay to the `client`. Player state, dialogue advancement, movement,
banking, gigs, comms/SMS, vault, shop, map.

| Layer | Files |
|---|---|
| **Routes** | `dialogue*.ts`, `player.ts`, `location*.ts`, `bank.ts`, `gigs.ts`, `comms*.ts`, `vault.ts`, `shop*.ts`, `map.ts`, `feed.ts`, `settings.ts`, `auth.ts`, `assets.ts` |
| **Services** | `DialogueResolver.ts`, `BankService.ts`, `SocialFeedService.ts`, `MarketplaceEvents.ts`, `AssetStageResolver.ts`, `MediaSigner.ts` |
| **Repository** | `PlayerStateRepository.*.ts` (read/write split) |
| **Workers** | `LeaderboardWorker.ts`, `RelationshipDecayWorker.ts` |
| **OLTP tables** | `users`, `player_states`, `player_dialogue_states`, `player_sessions`, `player_mysteries`, `mystery_progress`, `player_vault`, `bank_transactions`, `player_inventory`, `player_sms_threads`, `user_relationships`, `user_reputations`, `public_profiles`, `social_posts`, `mission_reward_claims`, `districts`, `time_blocks` |
| **OLAP tables** | `player_events` (event sourcing), `leaderboards` |

### Domain B — Content / Intake ("authoring & migration")

Reads YAML content folders → validates → upserts into DB content tables → compiles
dialogue chunks. The admin panel's content CRUD also lives here.

| Layer | Files |
|---|---|
| **Routes** | `admin-content*.ts`, `admin-coverage*.ts`, `admin-lore.ts`, `admin-story-beats.ts`, `admin-list-views.ts`, `admin-content-link.ts` |
| **Content engine** | `content/migrate.ts`, `upsert.ts`, `content-upserts.ts`, `compiler.ts`, `validate.ts`, `quality.ts`, `path-utils.ts` |
| **Services** | `ContentFillService.ts`, `ContentAssetService.ts`, `CloneTemplateService.ts` |
| **OLTP tables (content)** | `characters`, `dialogue_trees`, `dialogue_overlays`, `dialogue_chunks`, `scenes`, `scene_characters`, `mysteries`, `stories`, `story_beats`, `gigs`, `vault_items`, `shop_items`, `map_tiles`, `migration_log` |

### Domain C — AI Plumbing ("generation & verification")

Calls LLMs and image generators to *produce* content files, then hands them to Domain B
to migrate. Also generates/publishes image assets to MinIO.

| Layer | Files |
|---|---|
| **Routes** | `admin-story-builder*.ts` (10 files), `admin-ai-config.ts`, `assets.generation.handlers.ts`, `assets-import*.ts` |
| **Services** | `LLMService.ts`, `LiteLLMProvider.ts`, `MockProvider.ts`, `LLMPrompts.ts`, `LLMPromptExtractors.ts`, `LLMCostEstimator.ts`, `StoryBuilderOrchestrator.ts`, `StoryBuilderPlanOps.ts`, `PlanGenerationJob.ts`, `PlanVerificationService.ts`, `IronGateValidator.ts`, `ContentSkeletonGenerator.ts`, `FillPlaceholders.ts`, `OutlineChunking.ts`, `PlanTemplateBuilders.ts`, `LoreGenerator.ts`, `PromptFileGenerator.ts`, `StoryBuilderFileWriter.ts`, `AssetGenerationService.ts`, `AssetPublishService.ts`, `AssetNeedsService.ts`, `LocalDraftService.ts`, `StorageService.ts` |
| **Workers** | `ContentAssetWorker.ts` |
| **OLTP tables** | `content_plans` (+ versioning/verification), `asset_bases`, `asset_variants`, `admin_events`, `system_settings` (AI config) |
| **External services** | LiteLLM proxy, NVIDIA NIM, Pollinations, MinIO |

### The contract layer

`shared/` is a **pure Zod schema + types** package with zero DB/IO dependencies. It's
already the clean boundary — every domain imports from `@las-flores/shared`, nothing in
`shared` imports back. This is the biggest asset for any separation: no new contract layer
needs inventing.

### Infrastructure (shared across all three)

| Component | Location | Notes |
|---|---|---|
| DB connection | `server/src/database/connection.ts` | `oltpPool` (max 50), `olapPool` (max 20), `queryOLTP`, `queryOLAP`, `withOLTPTransaction` |
| Cache | `server/src/database/redis.ts` | `getCache`/`setCache`/`deleteCache`/`invalidatePattern` |
| Object storage | `server/src/services/StorageService.ts` | MinIO via AWS S3 SDK, presigned URLs |
| Entry point | `server/src/index.ts` | Mounts ~40 routers on one Express app; startup runs migrations + workers sequentially before `app.listen()` |

20 services import `connection.js`; 9 import `redis.js`. Both game and intake services
appear in those lists — the shared kernel is the coupling point.

---

## 3. Coupling Analysis

### ✅ Data coupling between Intake/AI and Game is LOW

Grepping every `StoryBuilder*`/`Content*`/`Plan*` service for references to game-runtime
tables (`player_states`, `player_dialogue`, `users`, `player_events`, `player_mysteries`,
`mystery_progress`, `player_vault`, `bank_transactions`, `player_inventory`) — **zero
hits**. The AI/intake layer writes *only* to content tables and the filesystem. The game
layer *reads* those same content tables at runtime (e.g. `DialogueResolver` reads
`dialogue_trees` + `dialogue_overlays` + `dialogue_chunks`). The relationship is
**one-way**: intake writes content → game reads content. They never cross-write.

This is the hardest coupling to fix, and it's already absent. Code can be partitioned
with confidence.

### ⚠️ Shared infrastructure coupling is MODERATE

All three domains share one DB connection module, one Redis module, one process, and one
`content/` filesystem mount. 20 services import `connection.js`; 9 import `redis.js`.

### ⚠️ Route-level coupling is MODERATE

Routes are flat in `server/src/routes/` with a naming convention (`admin-*` vs the rest),
but no enforcement. `index.ts` mounts them all on one Express app sharing CORS, auth
middleware, and error handler.

### ✅ Schema contract is CLEAN

`shared/` already enforces the contract. Splitting services out would not require
inventing a new contract layer — it exists and is dependency-free.

---

## 4. Separation Options (Code & Process)

### Option 1 — Logical Partitioning In-Place (Internal Module Boundaries)

**Effort:** Low (days) · **Risk:** Very low · **Reversibility:** Trivial

Keep one process, one DB, but reorganize `server/src/` into explicit bounded contexts:
```text
server/src/
  domains/
    game/          ← routes, DialogueResolver, BankService, PlayerStateRepo
    intake/        ← content/, admin-content* routes, ContentFillService
    ai/            ← StoryBuilder*, LLM*, Plan*, Asset* generation
  infra/           ← connection.ts, redis.ts, middleware (shared kernel)
```
Add an ESLint `no-restricted-imports` rule so `game/` cannot import from `ai/` or
`intake/`, and `ai/` cannot import from `game/`. The only allowed cross-domain import is
`infra/` and `@las-flores/shared`.

- **Pros:** Enforces the one-way dependency that already exists in the data; prepares
  for physical split later; no deploy changes.
- **Cons:** Still one process — a crash in AI generation can starve game requests; can't
  scale independently.
- **Feasibility:** ★★★★★ — the data is already decoupled, this just makes the code
  reflect it.

### Option 2 — Extract AI/Intake into a Separate Service (Process Split)

**Effort:** Medium (1–2 weeks) · **Risk:** Medium · **Reversibility:** Moderate

Split the monolith into **two processes** sharing the same DBs/Redis/MinIO:

- **`game-server`** (port 3000): game routes + `DialogueResolver` + `PlayerStateRepo` +
  `BankService` + workers (`LeaderboardWorker`, `RelationshipDecayWorker`). Reads content
  tables.
- **`intake-server`** (port 3001): all `admin-*` routes + content engine +
  StoryBuilder/AI + `ContentAssetWorker`. Writes content tables + `content_plans`.

The `admin` Next.js panel points `INTERNAL_SERVER_URL` at `intake-server:3001`; the
`client` points at `game-server:3000`. Both share `@las-flores/shared` and a thin
`@las-flores/infra` package (extracted from `connection.ts`/`redis.ts`).

The handoff stays unchanged: intake writes content rows → game reads them. No new IPC, no
message queue needed for the first cut. The intake server can be taken down for AI batch
jobs without affecting live gameplay.

- **Pros:** Independent scaling & deployment; AI crashes don't affect players; can run
  intake on a GPU-heavy node and game on a latency-optimized node.
- **Cons:** Need to extract `connection.ts`/`redis.ts` into a shared workspace package;
  duplicate health/startup boilerplate; boot sequence splits in two.
- **Feasibility:** ★★★★☆ — the data boundary already supports this; the main work is
  package extraction and route partitioning.

### Option 3 — Full Three-Service Split + Content API

**Effort:** High (3–5 weeks) · **Risk:** Medium-High · **Reversibility:** Hard

Three services + a read API, enabling the "other clients" goal:

- **`game-server`** — pure game runtime (as in Option 2).
- **`content-api`** — a **read-only** service that serves content to *any* client (the
  current game client, a future mobile client, a Discord bot). Backed by content tables +
  Redis cache. This is the "support other kinds of clients" piece: clients talk to
  `content-api`, not directly to the DB.
- **`intake-worker`** — AI generation + content migration (write side). Talks to
  LLM/MinIO. No player-facing traffic.

`game-server` becomes a *client* of `content-api` for content reads. Intake writes
through to the same content DB. A simple invalidation event (Redis pub/sub) tells
`content-api` to drop its cache when intake migrates new content.

- **Pros:** Cleanest path to multi-client; content schema can evolve without touching
  game code; intake can be fully async/batched.
- **Cons:** Introduces a network hop for every content read in the game (mitigated by
  Redis cache); need a cache-invalidation channel; more services to operate.
- **Feasibility:** ★★★☆☆ — architecturally sound, but the latency cost of the
  content-read hop needs benchmarking before committing.

### Option 4 — Schema-Native Database Split (Intake DB separate from Game DB)

**Effort:** Very High (2+ months) · **Risk:** High · **Reversibility:** Very hard

Put content tables in a **third Postgres instance** (`content-db`), separate from
`game-db` (OLTP) and `analytics-db` (OLAP).

- **Pros:** True data isolation; intake migrations never lock game tables; independent
  backup/restore.
- **Cons:** Cross-DB joins become impossible (e.g. `DialogueResolver` currently joins
  dialogue trees with overlays in one query); need foreign-data-wrapper or app-level
  joins; transactional consistency across DBs is lost.
- **Feasibility:** ★★☆☆☆ — the cross-DB join loss is a real cost. Only worth it if
  intake write load actually interferes with game reads (not yet observed).

---

## 5. Workload Tensions — Content Reads & Authoring CPU

Beyond code organization, two real architectural tensions drive the separation:

### Tension 1: Content reads share the game's OLTP pool

The content read path is **already well-optimized in isolation**:

- **`dialogue_chunks` table** — AOT-compiled ≤15-node sub-graphs pre-computed at
  *migration* time (`compiler.ts:22` `MAX_CHUNK_SIZE = 15`). The runtime reads one small
  chunk, not the whole tree.
- **Redis cache** with 1h TTL on resolved trees (`DialogueResolver.ts:61`).
- **In-flight Promise dedup** (`inflightResolutions` map) for thundering-herd protection
  when a Breakthrough Event invalidates the cache.
- **Good indexes**: `idx_dialogue_chunks_tree_id`, `idx_dialogue_chunks_chunk_key`,
  `idx_dialogue_overlays_target_tree_id`, `idx_dialogue_trees_character_id/scene_id/
  mission_id/scope`, GIN indexes on `characters.portrait_urls` /
  `available_dialogues`.

**But** — every one of those reads goes to `oltpPool` (`max: 50`, `connection.ts:23`), the
**same pool** that handles latency-critical player writes. The OLAP pool (`max: 20`,
1000ms timeout) was deliberately split out because "telemetry must never block gameplay"
(`connection.ts:40`). Content reads are in the opposite situation: they *do* run on the
gameplay pool.

As content grows (196 characters today, dialogues/overlays accumulating) **and** concurrent
players grow, the chunk/overlay reads compete with player writes for those 50 connections.

### Tension 2: Authoring is a different workload class, running in-process

Confirmed at `StoryBuilderOrchestrator.ts:210`:
```js
// 3. Fire async solidify OUTSIDE the transaction.
runSolidify(planId, userId).catch((err) => { ... });
return { success: true, status: 'pending' };
```
The route returns `pending` fast (good), but `runSolidify` keeps running **in the same
Node process**. It calls `stagePlan` → the LLM provider (`LiteLLMProvider`/NIM/
Pollinations), which are long HTTP calls (30–60s+), plus `AssetGenerationService` image
generation with token-bucket rate limiting and 6 retries at 60s backoff
(`AssetGenerationService.ts:7-9`). All of this shares the **single event loop**
and competes for libuv threadpool resources that the game server also needs.

Node default `UV_THREADPOOL_SIZE=4` handles local `fs` I/O, `dns.lookup()`
(getaddrinfo), and some CPU-bound crypto/compression work for **both** the LLM pipeline
and the game. Standard `fetch`/HTTP sockets, non-blocking database traffic (the Postgres
protocol runs over a socket), and remote image-generation responses (NIM / Pollinations)
are handled by the event loop's non-blocking I/O (epoll/kqueue/IOCP) and do **not**
consume threadpool slots — parsing those responses or decoding large JSON chunks runs
synchronously on the event loop and is best characterized as event-loop CPU contention,
not threadpool work. The libuv threadpool work that contends with the game's I/O is
therefore: the LLM pipeline's `dns.lookup()` calls (provider endpoints), local file reads
of prompt/lore files, and `AssetGenerationService`'s local file reads; heavy
local `fs` writes during asset generation can occupy the threadpool and reduce headroom
for the game's I/O during bursts.

### Options for content read optimization

> ⚠️ **Contract warning:** A1 (open a second pg `Pool`) was previously blocked by the
> repo's `AGENTS.md` hard constraint, which forbade introducing new pools and mandated
> using only the existing `oltpPool` / `withOLTPTransaction` / `getCache` / `setCache` /
> `queryOLAP` patterns. The constraint has since been reconciled (M19): a single
> **read-only** content pool (`contentPool` / `queryContent`, defined in `@las-flores/infra`)
> is now sanctioned for content reads only, while all player reads AND writes stay on
> `oltpPool` / `withOLTPTransaction`. The content pool is enforced read-only at the Postgres
> session level (`default_transaction_read_only=on`), so it must never route player writes.

| Option | Description | Feasibility |
|---|---|---|
| **A1. Dedicated read pool on same DB** | Open a second pg `Pool` against the same OLTP Postgres (or a read-replica) used only by `DialogueResolver`/content reads. ~20 lines in `connection.ts`. | ★★★★★ |
| **A2. Postgres read-replica for content** | Add a `postgres-oltp-replica` (streaming replication). Content reads hit the replica; writes hit primary. | ★★★★☆ |
| **A3. Content as a separate DB** | Move content tables to a 3rd Postgres. Breaks cross-table joins. | ★★☆☆☆ |
| **A4. Content snapshot to Redis/disk on migrate** | Write a denormalized resolved snapshot per dialogue; runtime reads only the snapshot. | ★★★☆☆ |

**Recommendation:** A1 is now the baseline content-read path (implemented in M19 via `@las-flores/infra`). Prefer A2 (streaming read-replica) or A4 (denormalized Redis/disk snapshot) as future scale-out if contention on the primary grows.

### Options for authoring workload separation

| Option | Description | Feasibility |
|---|---|---|
| **B1. Extract `runSolidify` to a separate worker process** | Move StoryBuilder + all LLM/Plan/Asset services into a second Node process. The API enqueues a job (Redis list or `content_plans` status) and returns; the worker polls/executes. Data already decoupled (verified). Fire-and-forget + status-poll pattern already implemented. | ★★★★☆ |
| **B2. Keep in-process but pin to worker_threads** | Run LLM calls inside `worker_threads`. Helps CPU but not connection-pool/DNS contention. | ★★★☆☆ |
| **B3. Offload to external queue (BullMQ/SQS)** | Intake jobs go to a real queue with retries/backoff. Most robust for scale, but new infra. | ★★★☆☆ |

**Recommendation:** B1 — directly fixes the workload-class mismatch, requires no new infra
(reuse Redis for job handoff), and the fire-and-forget + status-poll pattern is already
implemented.

---

## 6. Content Externalization — MinIO/CDN + Reference DB

### The realization: content is already externalized for images

Character YAML already externalizes content to MinIO:
```yaml
# content/characters/peter_van_der_meer/char_peter_van_der_meer.yaml
portrait_urls:
  - url: s3://las-flores/portraits/peter_van_der_meer/peter_van_der_meer__default.png
    label: dev
```
`AssetPublishService` + `StorageService.signMinioUrl` already serve these via signed/CDN
URLs. **Images are already "content in object storage, DB keeps references."** The
proposal extends that exact pattern to *text content* (dialogue nodes, lore, scene
payloads).

### What moves where

| Today | Proposed |
|---|---|
| `dialogue_trees.nodes` = big JSONB blob | DB row keeps only `id, name, character_id, scene_id, mission_id, scope, start_node_id, content_url` → `s3://las-flores/dialogues/<slug>.json` |
| `dialogue_chunks.nodes/leaves` = pre-compiled ≤15-node sub-graphs | Row keeps `tree_id, chunk_key, content_url` → `s3://las-flores/chunks/<tree>/<chunk_key>.json` (ideal CDN object — immutable, key-addressable) |
| `dialogue_overlays.nodes` | Row keeps `id, target_tree_id, mystery_id, is_nsfw, unlock_condition, content_url` |
| `characters.description/metadata` | DB keeps `id, name, slug, portrait_urls(ref), lore_url` → MinIO |

### The read patterns split cleanly

**Class 1 — Browse/discover (stays in reference DB):**
`location.ts:66-91` does `scene_characters JOIN characters` and
`dialogue_trees LEFT JOIN scenes LEFT JOIN scene_characters LEFT JOIN characters`. These
are pure reference joins — IDs, names, FKs. None fetch the heavy `nodes` text. These stay
in Postgres and get *faster* (rows are tiny, no JSONB bloat).

**Class 2 — Read the actual content (moves to CDN):**
`DialogueResolver` fetches `dialogue_chunks`/`dialogue_trees` node maps by `content_url`
via `contentFetch.ts` (M23 externalization, finalized in M32 — the `nodes`/`leaves` JSONB
columns are dropped). `dialogue_overlays.nodes` is still read by key. The chunk is ≤15
nodes, immutable, perfectly cacheable. **This is the read that benefits most from CDN.**

### The catch: dynamic overlay merging

`DialogueResolver` merges base tree + active overlays at runtime (depends on player's
active mysteries, alignment, NSFW unlock). Can't fully pre-resolve to a single CDN file.
Two approaches:

1. **Fetch base + overlays from CDN, merge in memory, cache resolved result in Redis**
   (already done — `CACHE_TTL_SECONDS = 3600`). CDN gives immutable pieces; Redis gives
   the per-state merge. Net effect: OLTP content reads drop to ~zero on the hot path.
2. **Pre-resolve per mystery-state at migration time** (endgame). Write resolved JSON to
   MinIO for each `(tree_id, sorted-active-mystery-set)` combination. More build
   complexity, but eliminates even the Redis merge step.

### Risks

- **Cache-invalidation timing**: publish to MinIO *first*, update DB pointer, then
  `invalidatePattern`. `migrate.ts` already does upsert + invalidate — just reorders
  MinIO-publish before DB-upsert.
- **Versioning/immutability**: use content-addressed keys
  (`<slug>__<hash>.json`) or versioned keys, not `<slug>.json`, or CDN serves stale. The
  `migration_log` checksum already computed (`migrate.ts:48` `calculateChecksum`) is the
  natural version key.
- **Overlay merge still needs pieces in memory**: Phase 1 = fetch from CDN, merge in
  Redis-cached memory. Huge win already.

### Feasibility verdict

| Piece | Feasibility |
|---|---|
| Content JSON in MinIO + `content_url` pointer | ★★★★★ |
| CDN-cached chunk reads on game hot path | ★★★★★ |
| Reference DB for browse/search JOINs | ★★★★★ |
| Dynamic overlay merge (base + overlays from CDN) | ★★★★☆ |
| Pre-resolved per-state snapshots (endgame) | ★★★☆☆ |

---

## 7. Graph DB for Authoring — Feasibility

### Key discovery: the ContentPlan is already graph-shaped

The authoring model today is *already* a graph stored as JSONB:
```ts
// shared/src/schemas/story-builder.ts
ContentPlanItemSchema: { id, type, action, name, slug, fields, dependsOn, ... }  // NODES
ContentLinkSchema:     { fromItem, toItem, field, action: 'add'|'set' }          // EDGES
ContentPlanSchema:     { items: [...], links: [...], status, ... }               // GRAPH + validation
```
The `ContentPlanSchema` even **validates cross-link integrity** (lines 73–90: rejects
links referencing unknown items). And `content_plans.status` already has the lifecycle:
```text
draft → proposed → approved → staged → migrated → verified → failed
```

**The entire "graph → materialize" pipeline already exists:**
- `stagePlan()` — topological-sorts the graph, writes YAML files (`writePlanItems`),
  applies links (`applyLink`), validates. **This is the graph→files export.**
- `approveAndSolidifyPlan()` — stages → publishes assets → migrates (YAML→DB) → verifies.
  **This is the approve→production step.**
- `applyLink()` — reads a YAML, writes a UUID into a field (e.g.
  `available_dialogues` array). **This is the edge→FK materializer.**

So the question isn't "can we build this flow?" — it's built. The question is: should the
authoring canvas be a real graph DB instead of `plan_json` JSONB?

### Why a graph DB beats `plan_json` for authoring

| Authoring task | With `plan_json` | With graph DB |
|---|---|---|
| "What links to character X?" | Scan all items' fields + `links[]` in JS — O(n) per query | `MATCH (c:Character)<-[:SPOKEN_BY]-(d:Dialogue) RETURN d` — O(hops) |
| "Is this plan internally consistent?" | Custom validation in `ContentPlanSchema.superRefine` | Requires explicit Cypher queries + application validators — orphans, dangling edges, and invalid cycles are not automatically enforced |
| "What changes if I edit mission Y?" | Not supported — scan every plan | 1-hop traversal query |
| Visual editing of relationships | Admin `content-linker` edits YAML fields by path string — clunky | Neo4j Browser/Bloom: drag to connect |
| Detecting cycles in `dependsOn` | `topologicalSort` throws on cycle (runtime) | Requires explicit Cypher cycle-detection query (e.g. `apoc.path`) + application validator |
| Multi-plan composition | Can't — plans are isolated JSONB blobs | Edges cross plan boundaries; one global content graph |

### Three approaches compared

**Approach A — Git-Native Branching (no graph DB):**
- Plans = git branches; approved lore = `main` branch; approve = `git merge`.
- Content is already in git (1175 files tracked).
- ★★★★★ for branching/merging, ★☆☆☆☆ for relationship analysis.

**Approach B — Graph DB as authoring canvas:**
- Plans = subgraphs (`plan_id` property); approved lore = nodes with `plan_id: NULL`
  (deltas promoted from `plan_id=$pid` on approve — equivalent to `status='approved'`;
  `approve` = transaction promoting plan nodes to `plan_id: NULL`). A sparse **MODIFY**
  shadow is an explicit **field-level merge**: before promotion, its changed fields are
  written onto the production node it `modifies` (inherited fields are preserved), and
  retrieval returns base + shadow together, merges changed fields, then selects a single
  canonical node — so promotion never loses inherited fields or creates duplicates.
- ★★★★☆ for relationship analysis, ★★★☆☆ for branching/merging (reinventing git).

**Approach C — Hybrid (recommended): git for branching, graph for analysis:**
- Git for branches/diffs/merges/reverts (native, battle-tested).
- Read-only graph index (derived from YAML working tree) for impact analysis +
  visualization.
- The graph index is **derived and disposable** — rebuild from files anytime. Never the
  source of truth.

### The "merge into main" criteria analysis

Three criteria determine the decision:

1. **Plans as isolated authoring sessions** — `content_plans` rows already isolate
   (each has `plan_json` + status). Plus `parent_plan_id` (migration 048) tracks lineage:
   `refinePlan()` creates a *new* row with `parent_plan_id` → branch history stored as a
   linked list in SQL. `feedback_log` stores planSnapshot → commit message + snapshot.
2. **Access to latest approved lore** — `gatherContext()` (line 320) runs 5 parallel
   queries against the production DB to fetch every existing character, scene, dialogue,
   mission, overlay, location → hands them to the LLM as `ExistingContentContext`. This
   is literally "read main while working on a branch."
3. **Approve = merge into main** — `approveAndSolidifyPlan()` is the pipeline:
   stagePlan → publishChosenDrafts → migrateContent → verifyPlan → invalidatePattern.

### Technology choice

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Neo4j** | Mature, Cypher, Browser/Bloom for visual editing | New infra (separate container); memory-heavy | ★★★★☆ |
| **Apache AGE** (Postgres extension) | No new infra — runs inside existing Postgres; Cypher via SQL | Less polished UI; younger project | ★★★★☆ |
| **Memgraph** | In-memory, fast, Cypher-compatible | Data lost on crash unless persisted | ★★★☆☆ |
| **FalkorDB** (Redis-based) | Near-zero infra if you run Redis | Smaller community | ★★★☆☆ |
| **TerminusDB** | Native git-for-graphs: branch/merge/diff in RDF | RDF/Prolog flavor, small ecosystem, big departure | ★★☆☆☆ (only if native delta semantics essential) |

**Recommendation:** Apache AGE for first iteration (zero new containers), graduate to
Neo4j if visual editing (Bloom) matters for admin UX.

---

## 8. The Delta Model — Plans as Graph Deltas

This is the most architecturally sound formulation. The insight: the `ContentPlan` is
already a delta model — it just isn't queryable as a graph and is stored as full snapshots
instead of true field-level deltas. The graph DB fixes both.

### Plan storage: OLTP metadata + graph deltas (split)

```text
OLTP (content_plans)              Graph DB
──────────────────────            ──────────────────────────────────
id, status, created_by,           nodes/edges tagged with
parent_plan_id, feedback_log,     plan_id = content_plans.id
description, timestamps
(lifecycle + metadata)            (the actual proposed changes)
```

- **`content_plans` stays in OLTP** — relational (user-linked, lifecycle, lineage).
- **The graph holds the deltas** tagged with `plan_id` (a string property, not a hard
  cross-system FK — the graph is a derived authoring view, OLTP is the authority for plan
  existence/status).

### The base: "production state" seeded on first migration

Build the base graph from:
- `content/` YAML files (entities) — 1175 files already exist
- FK relationships (edges) — `scene_characters`, `dialogue.character_id`, etc.
- A one-time import script reading current DB + files, writing graph nodes

Every production node gets `plan_id: NULL`. This is **criterion 2** — approved lore,
queryable as `MATCH (n {plan_id: NULL}) RETURN n`. After each approve+materialize, the
graph base gets refreshed.

### The deltas: a plan = proposed changes tagged with `plan_id`

The `ContentPlanItem` already has `action: 'create' | 'update'` and `ContentLink` has
`action: 'add' | 'set'`. **That IS the delta vocabulary.** The graph makes each delta a
queryable node/edge:

| Delta operation | Graph representation | Mirrors existing... |
|---|---|---|
| **ADD** new entity | Node with `plan_id=$pid`, new slug, full fields | `ContentPlanItem { action: 'create' }` |
| **MODIFY** existing entity | Shadow node: `plan_id=$pid`, `modifies=<prod_node_id>`, stores **only changed fields** | `ContentPlanItem { action: 'update' }` |
| **DELETE** entity | Tombstone: `(t:Tombstone {plan_id, target_slug, target_type})` | *(not yet in schema — future delta)* |
| **ADD edge** | Edge with `plan_id=$pid` connecting plan-nodes or plan-node→prod-node | `ContentLink { action: 'add' }` |
| **SET field** | Same as MODIFY (field-level shadow) | `ContentLink { action: 'set' }` |

The **MODIFY** shadow-node is the key: stores only changed fields; everything else
inherits from the production node it `modifies`. This is a **true field-level delta** —
better than git's line-diff and better than the current full-snapshot
`feedback_log.planSnapshot`.

### "Merged state" = production base + applied deltas (queryable in-place)

The "merged graph for plan X" is a **query**, not a separate store:
```cypher
// What does the world look like if plan X is approved?
// 1. Collect production base + plan deltas (no unbound MATCH — no cross-product)
MATCH (candidate)
WHERE candidate.plan_id IS NULL              // production base
   OR candidate.plan_id = $planId             // plan's additions/modifications
WITH candidate
// 2. Exclude annotation nodes (Conflict, Suggestion) from the merged view
WHERE NOT ('Conflict' IN labels(candidate) OR 'Suggestion' IN labels(candidate))
WITH collect(candidate) AS candidates
UNWIND candidates AS candidate
// 3. Skip entities targeted for deletion (tombstones) — bound to candidate
WITH candidate
WHERE NOT EXISTS((t:Tombstone {
  plan_id: $planId,
  target_slug: candidate.slug,
  target_type: labels(candidate)[0]   // stable type key per candidate
}))
// 4. Resolve each candidate's plan shadow. The production base IS the effective
//    node; the shadow carries only the plan's changed fields, which the app
//    overlays onto the base so unchanged production properties are preserved.
OPTIONAL MATCH (shadow {plan_id:$planId, modifies: id(candidate)})
WITH candidate AS effectiveNode, shadow AS shadowDelta
// 5. Aggregate: one effective node per canonical entity (type, slug).
//    Prefer the production base (plan_id IS NULL) so unchanged fields survive;
//    hand shadowDelta to the app to overlay only the changed fields.
WITH effectiveNode, shadowDelta, effectiveNode.slug AS slug, labels(effectiveNode)[0] AS type
ORDER BY slug, type, effectiveNode.plan_id NULLS FIRST
WITH slug, type, collect(effectiveNode)[0] AS finalNode, collect(shadowDelta)[0] AS delta
RETURN finalNode AS effectiveNode, delta AS shadowDelta
```
**This merged view is a live preview of post-migration production** — the admin can *see*
the merged graph before approving. When `approveAndSolidifyPlan()` runs, the materialized
SQL+MinIO should match this merged graph. `verifyPlan()` checks path, FK, story-beat, and
asset consistency in the materialized content, but **does not read the graph** — a new
verification step that compares the merged graph revision with SQL+MinIO state is a
required future addition.

### All three criteria satisfied

| Criterion | How the delta model satisfies it |
|---|---|
| **1. Plans as isolated sessions** | Each plan = delta nodes tagged `plan_id`. Isolated by property. Multiple plans co-exist. |
| **2. Access to latest approved lore** | Seeded production base (`plan_id IS NULL`) IS the approved lore. Merged view shows plan + base together. |
| **3. Approve = merge into main** | "Apply deltas": promote plan nodes to `plan_id=NULL` (ADD/MODIFY→production), apply tombstones (DELETE), commit edges. Then run the **existing materialize steps** (`stagePlan` → `migrateContent` → `verifyPlan` → `invalidatePattern`) — unchanged. |

### Honest caveat about native delta support

No mainstream graph DB (Neo4j, AGE, Memgraph) has a *first-class* delta/branch/merge
primitive — it's modeled with properties + shadow nodes. **TerminusDB** is the one
exception (native git-for-graphs in RDF), but the ecosystem/operational cost isn't worth
it for one feature when the modeled version covers all three criteria with ~5 Cypher
patterns.

### How the delta model upgrades today's state

| Today (JSONB in `content_plans`) | With graph deltas |
|---|---|
| `plan_json` = full plan snapshot | Shadow nodes = field-level deltas (smaller, true diff) |
| `feedback_log.planSnapshot` = full snapshot per refine | Delta lineage: each refine = new delta layer |
| `action: 'create'\|'update'` but no `'delete'` | Tombstone nodes add delete cleanly |
| "What does merged state look like?" = can't query | Live merged-view query (preview before approve) |
| Impact analysis = scan all plan_json in JS | Traversal: `MATCH (n {plan_id:$pid})-[:MODIFIES]->(p)` |
| Cross-plan composition = impossible (isolated JSONB) | Plans reference each other's deltas + shared base |

---

## 9. Converged Target Architecture

All the pieces compose into a single coherent target:

```text
                         ┌──────────────────────────────────┐
                         │  CDN (CloudFront / MinIO public) │
                         │  - dialogues/<slug>.json         │ ← immutable content blobs
                         │  - chunks/<tree>/<key>.json      │   (heavy text/nodes)
                         │  - overlays/<slug>.json          │
                         │  - lore/<slug>.md                │
                         │  - portraits/... (already here)  │
                         └──────────────┬───────────────────┘
                                        │ cache-hit GET (no DB)
                                        ▲
              ┌─────────────────────────┴──────────────────────────┐
              │  game-server (Express, port 3000)                    │
              │  - dialogue/player/location/bank/shop/vault routes   │
              │  - DialogueResolver (fetch chunk/overlay from CDN)    │
              │    → merge in memory → cache resolved tree in Redis   │
              │  - LeaderboardWorker, RelationshipDecayWorker          │
              │  - serves: client (game), future clients              │
              │  OLTP pool (max 50) ──► player_* writes               │
              │  content reads via OLTP pool — A2/A4 (replica or       │
              │  Redis snapshot); A1 read-pool only if contract allows │
              │  OLAP pool (max 20) ──► player_events, leaderboards   │
              └──────────────┬───────────────────────┬───────────────┘
                             │                        │
              ┌──────────────▼──────────┐  ┌──────────▼──────────────┐
              │  Reference DB (Postgres) │  │  Redis (resolved-tree   │
              │  - entities: id, slug,   │  │   cache, 1h TTL)        │
              │    name, content_url     │  │  - in-flight dedup map  │
              │  - edges: FKs + join tbl │  └─────────────────────────┘
              │    (scene_characters,    │
              │     dialogue→char, etc)  │
              │  - NO big JSONB blobs    │
              └─────────────────────────┘

              ┌──────────────────────────────────────────────────────┐
              │  intake-worker (separate process, port 3001)           │
              │  - admin-story-builder* routes (or queue consumer)    │
              │  - StoryBuilderOrchestrator, LLM*, Plan*, Asset*Gen   │
              │  - ContentAssetWorker, AssetPublishService, Storage    │
              │  - content/migrate.ts (writes content tables + files)  │
              │  - talks to: LiteLLM, NVIDIA NIM, Pollinations, MinIO │
              │  - writes: content_plans, asset_*, characters, etc.   │
              │  - NEVER touches: player_*, users, bank_*, player_events│
              │  → on content change: invalidatePattern('dialogue:resolved:*')│
              └──────────────────────────────────────────────────────┘

              ┌──────────────────────────────────────────────────────┐
              │  Graph DB (Neo4j / Apache AGE — authoring only)       │
              │  - seeded production base (plan_id=NULL)              │
              │  - plan deltas: ADD/MODIFY(shadow)/DELETE(tombstone)   │
              │    tagged with plan_id → references content_plans.id  │
              │  - merged-view query: previews post-approve state     │
              │  - impact analysis traversals (authoring aid)         │
              │  - NEVER on the game hot path                          │
              │  - disposable: rebuild from content/ + DB FKs anytime  │
              └──────────────────────────────────────────────────────┘
```

### Authoring → approve flow with the delta model

```text
SEED (first migration / content sync)
  import content/ YAML + DB FKs → graph base (plan_id=NULL)
        │
        ▼
AUTHOR (plan session, graph DB)
  - LLM/admin proposes deltas: ADD nodes, MODIFY shadow nodes,
    DELETE tombstones, ADD edges — all tagged plan_id=$pid
  - OLTP content_plans row: {id:$pid, status:'draft', created_by}
  - Live merged-view query shows "lore if approved"
  - Impact analysis: traversals against production base
        │ APPROVE
        ▼
GRAPH MERGE (build merged revision from unchanged base)
  - build view: base (plan_id=NULL) + plan_id=$pid deltas + tombstones
  - do NOT mutate production base yet
        │
        ▼
MATERIALIZE (existing pipeline, UNCHANGED)
  - export merged graph → ContentPlan (items+links)
  - stagePlan → writePlanItems + applyLink (YAML files)
  - publishChosenDrafts → MinIO
  - migrateContent → SQL upserts + chunk compile
  - verifyPlan → cross-ref check of materialized content (path/FK/story)
    (it does NOT compare against the graph — graph-to-production comparison is future work)
  - invalidatePattern → game drops cache
  - content_plans.status='verified'
        │ (only on success)
        ▼
COMMIT GRAPH (advance production base — idempotent)
  - promote plan_id=$pid nodes → plan_id=NULL (ADD/MODIFY→production)
  - apply tombstones (DELETE)
  - commit plan edges to production
        │
        ▼
production SQL + MinIO + refreshed graph base

> **New-code requirement — thread the merged snapshot, don't reload stale JSON:**
> the current `publishChosenDrafts(planId)` / `stagePlan` objects reload
> `content_plans.plan_json` (`AssetPublishService.ts:97-204`). In the graph flow the
> exporter must **persist the merged ContentPlan** (write it back to
> `content_plans.plan_json` at the start of materialize, using one revision identity
> — e.g. a `plan_revision` field set from the graph-merge step) and pass that exact
> snapshot through every step (`stagePlan` → `writePlanItems`/`applyLink` →
> `publishChosenDrafts` → `migrateContent`) so all materialization operations target
> one revision and never re-read a stale blob mid-pipeline.

> **Recovery on a failed graph commit:** production SQL + MinIO are the
> authoritative state and are written *before* the graph base commit. The graph
> base is **derived and disposable** (Approach C), so a failed commit never
> corrupts production — it only leaves the graph base stale. Recovery: retry the
> commit after confirming the plan reached `verified`; the promotion is idempotent
> (a `plan_id` node either exists or is promoted), and duplicate-edge handling is a
> no-op on re-run because edges are keyed on their endpoints + type and re-derived
> from the durable merged revision in `content_plans.plan_json`. If the base is
> irreconcilably stale, `SEED` rebuilds it from the YAML working tree + DB FKs, so
> any in-flight delta is re-planned. No durable commit-state/outbox is needed on
> this path because the graph is not the source of truth.
```

**Only new code:** (1) seed/import script, (2) delta-writing API (admin writes
ADD/MODIFY/DELETE deltas instead of plan_json), (3) graph-merge step, (4) merged-graph
→ContentPlan exporter. **`stagePlan`, `applyLink`, `migrateContent`, `verifyPlan` stay
untouched** — they already implement criterion 3.

---

## 10. Recommended Sequencing

Each phase builds on the last. Lowest-risk-first:

1. **Content-read separation** (done in M19 via A1). A single **read-only** content pool
   (`contentPool` / `queryContent` in `@las-flores/infra`) now isolates content reads
   (`DialogueResolver` chunk/overlay reads, `location.ts`/`location.npcs.ts` browse JOINs)
   from the gameplay `oltpPool`. This was reconciled with the `AGENTS.md` hard constraint,
   which now sanctions exactly one read-only content pool plus the OLTP pool. For further
   scale-out if primary contention grows, extend toward A2 (streaming read-replica) or
   A4 (denormalized Redis/disk snapshot, already cached with `CACHE_TTL_SECONDS = 3600`);
   point `contentPool`/`queryContent` at the replica/snapshot.
2. **B1 — Extract intake-worker process** (~1 week). The foundation for all content
   publishing. Reuse the existing fire-and-forget + cache-status pattern; move `runSolidify`
   and LLM services into a process that doesn't serve game traffic. Extract
   `connection.ts`/`redis.ts` into `@las-flores/infra` workspace package.
3. **Content externalization phase 1** — publish chunks + dialogues to MinIO, slim DB
   rows to references, keep overlay merge in Redis. The big CDN win.
4. **Delta-model graph authoring** — replace `plan_json` with a graph DB in the
   intake-worker; add graph→ContentPlan exporter; the existing `stagePlan` +
   `approveAndSolidifyPlan` becomes the materialize-to-production valve with no changes
   to its internals.

Phase 4 reuses phases 2 and 3's infrastructure entirely. The graph DB is a better
*front-end* to an authoring pipeline that already works end-to-end.

---

## 11. Open Questions & Risks

### Architecture decisions still open

- **AGE vs Neo4j for the graph store — ✅ RESOLVED → Neo4j** (decision recorded in
  `docs/GRAPH_AUTHORING_ARCHITECTURE.md`). Neo4j wins on visual relationship authoring
  (Bloom/Neodash drag-to-connect), which is the whole point of the authoring canvas;
  Apache AGE (zero new containers) is retained only as a fallback if a future constraint
  rules out another container. M27/M28 may build on this without re-opening the decision.
- **Git-branch-per-plan vs graph-delta model**: the hybrid (git for branching + graph
  for analysis) was recommended, but the delta model (§8) is cleaner if the graph becomes
  the authoring canvas. The delta model subsumes the branching concern if shadow-node
  MODIFY + tombstone DELETE are modeled carefully.
- **Pre-resolved per-state snapshots (overlay endgame)**: only worth it if the Redis
  merge step becomes a bottleneck at scale.

### Risks

1. **Cache-invalidation timing** — publish to MinIO first, update DB pointer, then
   invalidate. The window between "MinIO has new blob" and "DB has new content_url" must
   be atomic-ish.
2. **Versioning/immutability** — use content-addressed keys (`<slug>__<hash>.json`) or
   CDN serves stale. The `migration_log` checksum is the natural version key.
3. **Graph→ContentPlan exporter fidelity** — the graph can express richer relationships
   than `ContentLink` (`fromItem/toItem/field/action`). Edge types must map back to
   `field` names (`character_id`, `available_dialogues`, etc.).
4. **Re-approval after production edits** — if someone edits a YAML file directly
   (bypassing the graph), the graph becomes stale. Either re-sync SQL→graph afterward, or
   make the graph the only authoring entry point and lock direct file edits.
5. **Graph DB must stay off the game path** — the moment a game request touches the
   graph DB, production is coupled to a staging store. Keep it admin/intake-only. The
   materialize step is the only bridge.
6. **TerminusDB temptation** — native delta semantics are tempting but the
   operational/ecosystem cost isn't worth it for one feature when the modeled version
   covers all three criteria.

---

## 12. The Four-Moment LLM Authoring Lifecycle

The authoring experience decomposes into four distinct LLM moments. Two are built
today, two need new work. This section captures the full lifecycle so all five LLM
concerns (generation, intake analysis, fill, critique, chat) are a coherent surface.

> **M32 retirement — authoring-path cleanup (finalized).** The legacy single-pass
> authoring surface is fully retired:
> - **LLM methods retired:** `parseDescription`, `generateOutline`, `refinePlan`,
>   `refinePlanItems`, `extractEntities` are no longer part of the authoring flow.
>   Intake now goes through the graph-delta path (`GraphIntakeService` →
>   `chatService.propose` → `GraphDeltaService`).
> - **Services retired:** `PlanGenerationJob`, `FillPlaceholders`,
>   `ContentFillService`, `ContentPlanValidation` (folded into
>   `ContentPlanService`), and the `/plans/:id/refine` endpoint.
> - **Dialogue JSONB dropped:** `dialogue_trees.nodes` and
>   `dialogue_chunks.nodes`/`leaves` are dropped. Node/leaf maps are externalized
>   to the CDN via `content_url` (M23) and read through
>   `contentFetch.ts` (`fetchNodesFromContentUrl` / `fetchChunkFromContentUrl`).
>   The drop migration is `076_drop_dialogue_jsonb.sql` and is gated by
>   `npm run probe:content-urls` (0 gaps required).
> - **Sole authoring entry point:** graph deltas. The materialize pipeline
>   (`stagePlan` → `migrateContent` → verify) still consumes the synthesized plan.

### The current LLM call surface (7 provider methods)

The `LLMProvider` interface (`server/src/services/types/LLMTypes.ts:30-37`) is the
single seam. Implementing a new provider (LiteLLM today, a different model
service tomorrow) must satisfy all of these. **No provider method is AI-critique.**

| Method | Line | Purpose | Moment |
|---|---|---|---|
| `parseDescription(description, context)` | :31 | **Retired in M32** — legacy single-pass plan | 1 (legacy, removed) |
| `generateOutline(description, context)` | :32 | **Retired in M32** — replaced by graph-delta intake | 1 (removed) |
| `refinePlan(existingPlan, feedback, context)` | :33 | **Retired in M32** — replaced by chat/propose deltas | 4 (removed) |
| `refinePlanItems(selectedItems, fullPlan, feedback, context)` | :34 | **Retired in M32** — replaced by chat/propose deltas | 4 (removed) |
| `generateLore(item, context)` | :35 | Lore `.md` generation | 2 |
| `generateFill(prompt)` | :36 | **Retired in M32** — `ContentFillService` removed | 2 (removed) |
| `extractEntities(systemPrompt, chunk)` | :37 | **Retired in M32** — entity extraction helper removed | 1 (helper, removed) |

### The four moments

| # | Moment | Built today? | The gap |
|---|---|---|---|
| **1** | **Intake** — user gives an idea; LLM proposes a plan + surface-level conflict preview + a "[Generate Plan]" button | ⚠️ Partial | `generateOutline()` exists, but the only intake check (`checkCreateConflicts()`) is a **filesystem collision test**, not semantic analysis |
| **2** | **Plan generation / fill** — LLM makes authoring decisions (fills fields, writes lore) | ✅ Built | Output should become graph deltas (refactor of format, not LLM logic) |
| **3** | **Analyze** — button triggers AI to find conflicts + suggestions, leaving them as annotations | ⚠️ Partial | `verifyPlan()` is **deterministic** (FK integrity, file paths, cross-plan consistency). **No AI semantic critique exists.** |
| **4** | **Chat** — grab a conflict/proposal, chat freely, chat proposes changes, sign-off applies them and refreshes the view | ⚠️ Partial | `refinePlan()`/`refinePlanItems()` are single-turn strings. No multi-turn chat, conflict paste, structured delta, or "apply → refresh" loop |

### Moment 1 — Intake (add surface-level conflict scan)

`POST /admin/story-builder/generate/plan` → `generateOutline()` → `validateAndRepairOutline`
→ `checkCreateConflicts()` (filesystem only) → `scaffoldPlanItems()` → `INSERT content_plans`.

Add a fast LLM pass between outline generation and commit:

```typescript
// New LLMProvider method
analyzeIntakeConflicts(
  plan: ContentPlan,
  context: ExistingContentContext,
): Promise<{ conflicts: IntakeConflictPreview[]; usage: LLMUsage | null }>;

interface IntakeConflictPreview {
  type: 'duplicate_name' | 'lore_contradiction' | 'timeline_clash' | 'scope_overlap';
  severity: 'error' | 'warning';
  description: string;
  relatedItems: string[];        // plan item IDs
  relatedExisting?: string[];    // existing entity slugs/IDs
}
```

Reuses the `ExistingContentContext` that `gatherContext()` already gathers — no new data
plumbing. UI shows *"Here's your plan. ⚠️ 3 potential conflicts."* with
`[Generate Full Plan]` / `[Refine Instead]`.

### Moment 2 — Plan generation / fill (built)

`PlanGenerationJob.runPlanFill(planId)` → `provider.generateFill(prompt)` per item
→ `mergeFilledFields()` → `provider.generateLore(item, context)` via `LoreGenerator`.
The LLM makes authoring decisions (character personality, scene mood, dialogue structure).

**Graph-model refactor (not LLM change):** in the delta model (§8), filled fields should be
written as shadow-node MODIFY deltas instead of mutating `plan_json` in place. The LLM
calls stay identical; only the output destination changes.

### Moment 3 — Analyze (add AI semantic critique)

Today `verifyPlan()` and `checkContentQuality()` are **structural only**:

| Deterministic check (exists) | AI can additionally find |
|---|---|
| FK integrity — UUIDs resolve to DB rows | "Lore says gay / married to Jan Jr., but dialogue says 'my wife Rafaela'" |
| File paths exist (lore/narrative/asset) | "Mission A says leak contained, Mission B (later beat) says spreading" |
| Story-beat slug existence | "Character is 'courageous_advocate' but their dialogue is passive" |
| Cross-plan dependsOn/link consistency | "Overlay adds TB cost but base-node effects already deduct it" |
| Asset-status sanity | "Character X introduced in beat 3 but never appears after — dangling arc" |

New endpoint `POST /admin/story-builder/actions/plans/:id/analyze` drives an **AI
Critique Service** (see §13) that writes `(:Conflict)` / `(:Suggestion)` annotation nodes
into the graph, neighborhood-scoped per entity. Two LLM modes, kept separate: a fast/cheap
model for per-entity scans (most conflicts are local), a stronger model for cross-entity /
cross-mission scans.
### Moment 4 — Chat (add multi-turn + graph-scoped chat)

`refinePlan()` is the single-turn template. The chat is its multi-turn evolution:

```text
4a. [📋 Copy to Chat] on a :Conflict node
    → serializes ConflictChatContext (conflict + evidence + neighborhood)
4b. chatExplain(messages, graphCtx, conflictCtx?)  → prose reply   (cheap, frequent)
4c. chatPropose(messages, graphCtx, conflictCtx?)  → prose + structured GraphDelta
    (ADD/MODIFY/DELETE)                                          (expensive, deliberate)
4d. [Apply] → validates GraphDelta → writes shadow-node/tombstone delta (plan_id)
    → marks :Conflict 'addressed' → merged-view refreshes → viz shows the fix
```

The propose/explain split matters: the admin asks questions freely without triggering
structured-output generation until they explicitly ask for a fix, and the structured delta
passes `GraphDeltaSchema` validation before it can touch the graph.

### New LLMProvider methods required (the complete interface delta)

```typescript
// Existing 7 — stay as-is (see table above)
// New 3:
analyzeIntakeConflicts(plan, context)          // Moment 1
chatExplain(messages, graphContext, conflictContext?)  // Moment 4b
chatPropose(messages, graphContext, conflictContext?)  // Moment 4c
  → { reply; delta: GraphDelta; usage }
```

Moment 3 (AI Critique) is a **service composition**, not a new provider method — it
orchestrates graph neighborhood queries + existing LLM calls.

### Minimal viable path (validate the loop with least new code)

1. **Moment 1** — reuse `refinePlan` with a meta-prompt *"review this plan for conflicts
   with existing lore"*; parse output as conflicts. No new provider method needed for MVP.
2. **Moment 3** — loop over plan items calling `provider.refinePlanItems` with a *"find
   conflicts"* prompt; parse output as `:Conflict` nodes.
3. **Moment 4** — drive `refinePlan` in a loop (each chat message = one `feedback`), display
   the resulting plan diff as the "proposed change." Single-turn-per-message proves the UX
   before building a real conversation backend with memory + graph context.

---

## 13. AI Semantic Critique & the Conversational Chat Assistant

### The core principle: separate visualization from AI

No single open-source tool combines graph visualization + integrated AI auto-critique;
**Bloom and Neodash are read-only explorers with no AI built in.** The answer is to make
the graph the integration layer: the AI writes annotation nodes, and any viz tool reads
them. This is portable — switching from Bloom to Neodash to a custom React component, or
swapping the LLM model, never loses prior annotations (each carries `ai_model` +
`timestamp` provenance).

```text
                            writes annotations
     AI Critique Service  ─────────────────────►  Graph DB
     (query neighborhood → LLM → parse)            (:Conflict, :Suggestion
                                                -[:FLAGGED_IN]-> content nodes)
                                                          │
                                                          ▼ reads
                                      Bloom / Neodash / Custom Admin
                                      (red/yellow overlays on content nodes)
                                      each :Conflict has [📋 Copy to Chat]
```
### AI Critique Service (Moment 3)

Targeted Cypher neighborhood query per entity (not a full-graph dump — too expensive),
serialize the subgraph into an LLM prompt. The **authoritative text revision** for AI
critique is the canonical MinIO/CDN object referenced by `content_url` / `lore_url`
(checksum-versioned, not graph-stored text) — the graph stores pointers to these objects,
so preview, critique, and materialization all read from the same explicitly identified
source. The prompt includes: `[{type, severity, description, evidence:
{node_ids, content_url, checksum}}]`. Write the parsed output back as `:Conflict` /
`:Suggestion` nodes linked to their content nodes.

> **Checksum lifecycle is future work (not yet implemented).** `AssetPublishService`
> (`server/src/services/AssetPublishService.ts:97-204`) persists asset URLs and returns
> object keys but does **not** compute or store object checksums today. When implemented,
> the lifecycle is: (1) compute a checksum (e.g. SHA-256) at publish time, (2) persist it
> alongside the corresponding graph pointer and `content_url`/`lore_url`, and (3)
> propagate it through preview, critique prompts, and materialization so the `evidence.checksum`
> field references the exact canonical object. Until then, the critique prompt's
> `checksum` field is a contract placeholder, not a live value.

Trigger points: on-save (event-driven), manual "Analyze" (deep, on demand), **pre-approve
gate** ("AI found 3 conflicts — approve anyway?" safety net before `approveAndSolidifyPlan`),
and/or a nightly batch against the production graph to catch cross-plan drift.

### The "Copy to Chat" context bundle (Moment 4a)

The linchpin UX. Serializing a `:Conflict` node gives the chat everything it needs without
re-discovering the conflict:

```typescript
interface ConflictChatContext {
  conflictId: string;
  type: string;                  // 'character_inconsistency', etc.
  severity: 'error' | 'warning';
  description: string;           // AI's plain-language explanation
  evidence: Array<{
    nodeType: string;            // 'Character' | 'Dialogue' | 'Mission'
    nodeId: string;
    slug: string;
    excerpt: string;             // the relevant text snippet
    field?: string;
  }>;
  relatedEntities: Array<{ nodeType; slug; relationship }>;  // 1-hop neighborhood
  aiModel: string;               // provenance
  detectedAt: string;            // timestamp
}
```

### Open-source landscape (what the research will conclude)

| Tool | What it does | Conflict detection? | Writes back to graph? |
|---|---|---|---|
| Microsoft GraphRAG | Builds KG from text, community detection, hierarchical summarization | ❌ construction/retrieval only | builds its own graph |
| Neo4j + LangChain GraphQA | LLM generates/runs Cypher | ⚠️ structural queries only — semantic contradiction detection requires an explicit NLI/LLM layer | ✅ via Cypher |
| LangGraph | Orchestrates multi-step LLM workflows as graphs | ✅ can orchestrate "query → critique → annotate" | ✅ via driver |
| Neo4j Knowledge Graph Builder | LLM builds graph from docs + chat + viz | ❌ construction only | ✅ writes to Neo4j |
| Graphiti (Zep) | Temporal KG for agent memory | ⚠️ temporal, not narrative critique | ✅ |
| NLI models (DeBERTa, etc.) | Pairwise contradiction detection between passages | ✅ pairwise only | ❌ standalone |
| Bloom / Neodash | Visualization / dashboards | ❌ | ❌ read-only |

**Conclusion:** there is no turnkey open-source tool doing "AI semantic conflict detection +
graph visualization" together. The state of the art is **LangGraph orchestrating LLM
critique against a Neo4j/Apache AGE graph, annotations written back as nodes, visualized by
Bloom/Neodash** — which is exactly the separation recommended here.
### Chat backend architecture (Moment 4)

New route in the intake-worker (pattern = `refinePlan` + multi-turn + graph-scoped):

```text
POST /admin/story-builder/chat
  Body: { planId, messages: ChatMessage[], conflictContext?: ConflictChatContext }
  → load plan session → query graph neighborhood (or from conflictContext)
  → build LLM context (neighborhood + history + conflict bundle)
  → chatExplain | chatPropose (mode-dependent)
  → returns { reply, proposedDelta?, usage }
  → UI shows "Proposed: MODIFY peter_intro_3, text -> 'My ex-wife...'" [Apply][Reject][Refine]

POST /admin/story-builder/chat/apply-delta
  Body: { planId, delta: GraphDelta }
  → validate GraphDeltaSchema → write shadow-node/tombstone delta (plan_id)
  → mark :Conflict status='addressed' → merged-view refreshes → viz updates
  → audit trail: conflict found by {model} {date}, addressed by delta {id},
    approved in plan {id}
```

### UI placement: side panel

A collapsible **chat side-panel** docked alongside any admin page (pipeline stepper,
validation page, quality page, graph viz). "Copy to Chat" on a conflict populates it; the
panel stays context-aware as the author navigates. This is the "middle ground" between a
barren viz tool and a full AI-native tool.

### Risks specific to the AI critique + chat layers

1. **LLM hallucination in critique** — false positives waste author time; false negatives
   give false confidence. Mitigate: always show *evidence text excerpts* with each conflict
   so a human can spot-check, mark severity, and only gate approval on `error`-severity.
2. **Cost/latency of nested LLM loops** — per-entity critique is N+1 calls. Mitigate: cheap
   model for per-entity, batch, and cache annotations (`ai_model` + input hash) so
   unchanged subgraphs aren't re-analyzed.
3. **Structured-output validity** — a malformed `GraphDelta` must never corrupt the graph.
   Always validate with `GraphDeltaSchema` before write; reject-and-refine on failure.

---
## 14. Evidence Appendix — Key File References

All claims in this document are grounded in the codebase. Key file references:

| Claim | Evidence |
|---|---|
| AI/intake never touches player tables | Authoring writes go through `StoryBuilderOrchestrator.ts` (`stagePlan`/`publishChosenDrafts`/`migrateStagedPlan`/`verifyPlan`) and the intake-worker diagram above (§9), which explicitly states it "NEVER touches: player_*, users, bank_*, player_events". Validate with `git grep -n -E 'player_states|player_dialogue|player_events|player_vault|update users' server/src/services/StoryBuilder*.ts server/src/routes/admin-story-builder-*.ts` → 0 hits; note this is a qualitative boundary claim enforced by the write-path fixtures, not a formal dependency trace through shared helpers/aliases and dynamic SQL |
| `ContentPlan` is graph-shaped (items=nodes, links=edges) | `shared/src/schemas/story-builder.ts:14-33` (`ContentPlanItemSchema`, `ContentLinkSchema`) |
| Cross-link validation already exists | `shared/src/schemas/story-builder.ts:55-90` (`ContentPlanSchema.superRefine`) |
| Plan lifecycle status | `server/src/database/migrations/047_content_plans.sql:8-9` (`CHECK status IN (...)`) |
| Plan lineage (parent_plan_id) | `server/src/database/migrations/048_content_plans_versioning.sql` |
| `gatherContext()` reads approved lore | `server/src/services/ContentPlanService.ts:320-342` (5 parallel production queries) |
| `feedback_log` stores full snapshots | `shared/src/schemas/story-builder.ts:93-97` (`FeedbackLogEntrySchema.planSnapshot`) |
| `approveAndSolidifyPlan` fire-and-forget | `server/src/services/StoryBuilderOrchestrator.ts:210` (`runSolidify(...).catch(...)`) |
| `stagePlan` = graph→files export | `server/src/services/StoryBuilderPlanOps.ts:230-323` |
| `applyLink` = edge→FK materializer | `server/src/services/StoryBuilderFileWriter.ts:210` |
| `migrateContent` = YAML→DB upsert | `server/src/content/migrate.ts` |
| Dialogue chunks = AOT ≤15-node subgraphs | `server/src/content/compiler.ts:22` (`MAX_CHUNK_SIZE = 15`) |
| Chunk table schema | `server/src/database/migrations/030_dialogue_chunks.sql` |
| Redis cache on resolved trees (1h TTL) | `server/src/services/DialogueResolver.ts:61` (`CACHE_TTL_SECONDS = 3600`) |
| In-flight Promise dedup (thundering herd) | `server/src/services/DialogueResolver.ts:63-69` (`inflightResolutions`) |
| OLTP pool max 50 | `server/src/database/connection.ts:23` |
| OLAP pool max 20, 1000ms timeout | `server/src/database/connection.ts:36-41` |
| Images already externalized to MinIO | `content/characters/*/char_*.yaml` (`portrait_urls: s3://...`) |
| Content is git-tracked (1175 files) | `git ls-files content/ \| wc -l` → 1175 |
| Source commit | `0ce5c7d0cf3cbdc85b7520381a05608a6aaabfdd` (2026-08-10) |
| `ContentPlanItem.action` enum (no delete) | `shared/src/schemas/story-builder.ts:17` (`z.enum(['create', 'update'])`) |
| `ContentLink.action` enum | `shared/src/schemas/story-builder.ts:32` (`z.enum(['add', 'set'])`) |
| `AssetGenerationService` token-bucket + retries | `server/src/services/AssetGenerationService.ts:7-9` (`RPM_LIMIT=35`, `MAX_RETRIES=6`, `INITIAL_BACKOFF_MS=60000`) |
| `location.ts` browse JOINs (reference queries) | `server/src/routes/location.ts:66-91, 221-226` |
| LLMProvider interface (7 methods, no AI-critique) | `server/src/services/types/LLMTypes.ts:30-37` |
| `generateOutline` used in plan generation | `server/src/services/ContentPlanService.ts:56,121` |
| `generateFill` fills TODO fields | `server/src/services/ContentFillService.ts:74` |
| `generateLore` writes lore `.md` | `server/src/services/LoreGenerator.ts:75,145` |
| `refinePlan` / `refinePlanItems` (single-turn chat analog) | `server/src/services/ContentPlanService.ts:154,220` |
| Only intake check is filesystem collision | `server/src/services/ContentPlanService.ts` (`checkCreateConflicts`) |
| `verifyPlan` is deterministic (no AI) | `server/src/services/PlanVerificationService.ts` (7 structural checks) |

---

## 15. Enrichment — Lessons from the Story-Engine Authoring Discussion

> **Source:** a parallel design discussion on a generic story engine (Postgres + Neo4j +
> LLM pipeline). Its conclusions converge strongly with the analysis in §7–§13, and add
> several **guardrails and intermediate-state patterns** that are worth folding in. This
> section is enrichment, not a replacement — nothing above is contradicted.

### 15.1 The core principle: pipelines, not agents

The discussion's central reframe is that fuzzy intake should be **pipeline-based, not
agent-based**. Separate **understanding** from **committing**:

- The Orchard rule — **never let fuzzy extraction directly mutate canon.** The LLM is a
  *proposer*; the core system commits. This is the same boundary as §13's "agents propose,
  core commits," and should be stated as a hard invariant for any new AI surface.
- "Entity creation" and "conflict resolution" are **not single steps** — even
  deterministic-looking steps can expand into many retrieve-and-think passes (the "line of
  kings" example: 4 kings → 6 reign claims → family links → capital relocations →
  cross-references to earlier lore). The answer to "one agent or five?" is "a state machine
  over a story patch," not a coordinator deciding autonomy.

### 15.2 Persist the deliberation, not just the result

The graph should hold **approved structure only**. Keep a separate, append-only
**`claims` / `evidence` store** for the messy middle. Every candidate claim carries:

- `source_span` (the original text excerpt)
- `confidence` score
- `status`: `proposed / accepted / rejected / merged`
- `conflict_reason` (when rejected or merged)

This complements the `:Conflict` / `:Suggestion` annotation nodes in §13: annotation nodes
answer *"what did the AI flag?"*, while a claims/evidence store answers *"what did the LLM
believe, from which source, with how much certainty?"* and makes the review reproducible.
Uncertain items can be tracked without corrupting canon.

### 15.3 Split entity identity from entity existence

The hardest part of a dynasty import is **resolution** (is this "Marcus" the existing
Marcus?). Give every entity a stable `entity_id` separate from its aliases/names, and route
resolution through a dedicated pass that returns either `matched: { id }` or
`new_candidate`. **Never let the LLM silently decide identity by best-guess** — surface it
as a proposal with alternatives (`["a193 Marcus", "new: Marcus II"]`). This is a new
concept not explicitly in §8 and should live in the delta model's identity handling.

### 15.4 Version at the *canon revision / patch*, not the snapshot

Immutable revisions (the `Revision 103/104/105` idea) are the right instinct, but make
**patches** the unit of versioning, not full snapshots. A rejected AI proposal becomes
`patch → rejected → no-op`. Store `canon_revision` + `applied_patch_id` on every change so
rollback is a **lookup, not an inverse-reasoning task** ("AI, undo what you just did" is
never needed). This extends the existing `content_plans` versioning (`048_...`) and
`feedback_log` snapshotting (§14) with a patch-level undo primitive.

### 15.5 A deterministic validation *harness* between LLM and approval

Before any proposal touches canon, run **cheap deterministic checks** the LLM can't be
trusted to do faithfully:

- timeline overlap (do reign dates collide?)
- duplicate-key detection (same slug/name already exists?)
- foreign-key integrity (does the referenced location/scene exist?)
- ordering / succession rules

LLMs *propose*; rules *enforce*. This is a distinct role from `verifyPlan()` (§12, Moment 3,
deterministic structural checks) and from AI critique (semantic). It is the gate that
protects the "delicate balance" with near-zero cost and full reproducibility.

### 15.6 Conflict detection is bounded, not exhaustive

Never aim to find *all* contradictions (that is the unbounded problem). Run **targeted,
per-entity-type checks scoped to the patch's neighborhood** (nearby timeline, same
location, same lineage). Record a **"checked scope"** on each job so you can de-duplicate
and later expand coverage. This matches the neighborhood-scoped critique in §13 and makes
the "how much did we check?" question answerable.

### 15.7 Make every job durable, resumable, and idempotent

Because steps are unbounded and LLM calls fail, every task needs:

- `attempt` / `max_attempts`
- a stored **partial result** (restart from last persisted state, not from scratch)
- an **idempotency key** on the commit

This is the single biggest practical difference between "demo" and "production." It applies
directly to the **B1** job extraction in §5 (the fire-and-forget `runSolidify` pattern) —
the worker must be able to resume a plan-generation/asset job that died mid-way through 20
substeps.

### 15.8 A `needs_review` queue as a first-class product surface

Human review is the conflict-resolution engine, so make the review queue a **product
surface**, not an afterthought. Pending proposals render as **diff-style previews**
(`+Person: Sarah`, `+Alice --VISITED--> Central Station`, `⚠ conflict: Sarah is in NY
08:00–12:00`) with actions **`[Keep existing] [Accept new] [Merge] [Edit]`**. This pairs
with the §13 chat side-panel: the queue is the *triage* surface, the chat is the *deep-
dive* surface. If review is painful, throughput dies regardless of how good the agents are.

### 15.9 Start with the smallest vertical slice

Don't build the full task-graph runtime first. Prove the loop with:
**one job type** (entity extraction) → **one deterministic validator** (timeline overlap) →
**one proposal** → **human approve** → **commit** → **compile**. That validates the
submit/poll/approve/commit contract end-to-end before generalizing to the task table. This
mirrors §12's "Minimal viable path" and should gate sequencing in §10.

### 15.10 Mapping summary

| Conversation improvement | Already in doc? | Where it lands |
|---|---|---|
| Pipelines, not agents ("never let fuzzy extraction mutate canon") | ⚠️ Partial | Elevate to a hard invariant (§13 guardrails) |
| Persist deliberation (claims/evidence store) | ❌ New | New table alongside `:Conflict`/`:Suggestion` nodes |
| Split entity identity from existence | ❌ New | Delta model identity handling (§8) |
| Version at patch, not snapshot (rollback = lookup) | ⚠️ Partial | Extend `content_plans` versioning + `feedback_log` |
| Deterministic validation harness | ⚠️ Partial | Distinct gate ahead of `verifyPlan`/AI critique |
| Bounded conflict detection + checked scope | ⚠️ Partial | Sharpen §13 neighborhood-scoped critique |
| Durable/resumable/idempotent jobs | ⚠️ Partial | B1 worker (§5) must persist partial state |
| `needs_review` queue as product surface | ❌ New | Triage surface alongside §13 chat panel |
| Smallest vertical slice first | ⚠️ Partial | Fold into §10 sequencing |

---

*This document is a living analysis. As phases are implemented, update the sequencing
section and mark decisions as resolved in §11.*















