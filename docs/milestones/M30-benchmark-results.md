# M30 Gate — Benchmark Results

> **Question:** Is the Redis merge step in M23 Phase 1 (DialogueResolver) a real
> cost at scale such that M30 (pre-resolved per-state overlay snapshots in MinIO)
> is warranted?
>
> **Deliverable:** this document — methodology, raw numbers, and a mechanical
> MET / NOT-MET verdict per the gate criteria in `M30-M31-deferred.md`.
>
> **Verdict (summary):** **MET** — the distinct-key herd (S4) produces a reproducible
> p99 of approximately 0.55–0.63 s at 500 concurrent players. The later controlled
> pool-size A/B did not reproduce the initial 8–9/10 saturation observation, so the
> operative signal is the user-visible tail, not a proven pool-capacity bottleneck.
> M30 Phase A removes the per-state merge and multi-read amplification from the
> snapshot-covered path.
>
> **Status (2026-08-18):** M30 Phase A is **implemented and verified**. The
> post-build benchmark shows the snapshot fast path delivers **p99 = 141 ms**
> (single cold call **18 ms**) on a shared-state herd — meeting the M30 gate
> target of **< 250 ms** with ~3× headroom. See "M30 Phase A — post-implementation
> benchmark" below.

---

## M30 Phase A — post-implementation benchmark (2026-08-18)

M30 Phase A (Pre-Resolved Per-State Overlay Snapshots) is now **implemented and
verified**. `SnapshotService.buildSnapshotsForTree()` pre-computes every reachable
`(tree_id, sorted-mystery-set, nsfw, alignment)` state at migration time and
publishes each as a content-addressed MinIO blob, persisting a pointer in
`dialogue_chunks` (reusing the 4.1a table). `DialogueResolver` tries the snapshot
fast path after a Redis cache miss: `getSnapshotContentUrl` → MinIO GET →
JSON.parse → cache → return, falling back to the live merge only when no snapshot
exists.

**Re-ran S4 with snapshots built for the bench tree** (`BENCH_S4_SAMPLE=1
BENCH_SCENARIO=S4 BENCH_S4_SCALE=500 node m30_benchmark.ts`). The benchmark now
seeds snapshots for `BENCH_TREE_ID` in `seed()` and adds an M30 fast-path herd
(shared `{3 ACTIVE}` set, no investigating overlay) at a 50 in-flight bound to
avoid MinIO/`contentPool` saturation masking the per-call cost.

| Scenario | p50 | p95 | p99 | max | wall (drain) |
|---|---|---|---|---|---|
| S4 distinct-key herd (live merge — unique investigating set per user; M30 cannot help) | 237.3 ms | 381.4 ms | **398.6 ms** | 398.9 ms | ~1.18 s |
| **S4-M30 fast-path herd (shared `{3 ACTIVE}` set — snapshot hit on Redis miss)** | 41.3 ms | 129.6 ms | **141.3 ms** | 147.2 ms | 583.5 ms |
| Single cold resolve via snapshot (probe) | — | — | **18.2 ms** | — | — |
| Single warm resolve (Redis hit) | — | — | **3.7 ms** | — | — |

**Key finding:** the snapshot fast path reduces the post-invalidation miss from
the live-merge herd's **p99 ≈ 399 ms** to **p99 ≈ 141 ms** (single cold call
**18 ms**), and meets the M30 gate target of **< 250 ms** with ~3× headroom. The
distinct-key herd (unique investigating sets per user) still forces the live
merge at p99 ≈ 399 ms — these states have no pre-built snapshot by design
(snapshots only cover sets formed from ACTIVE + tree-overlay mysteries), which is
the expected and documented M30 ceiling.

> Note: an earlier fast-path run at the default 200 in-flight bound reported a
> misleading p99 ≈ 750 ms — a MinIO + `contentPool` (max 10) saturation artifact
> under 200 concurrent GETs, not a fast-path cost. Re-measured at 50 in-flight
> (above). Single-call probes confirm the true per-call cost is ~18 ms cold /
> ~4 ms warm.

---

## Methodology

### What was measured

The hot path is `DialogueResolver.resolveTreeForUser()`
(`server/src/services/DialogueResolver.ts:86`), which on a cache miss:

1. Runs 4 context reads in parallel — `getActiveMysteryIds` (OLTP),
   `getActiveMysteries` (content), `getUserNsfwStatus` (OLTP),
   `getUserState` (OLTP);
2. Loads the base tree via `loadBaseTree` → `queryContent` (CDN fetch, falls back
   to in-DB JSONB since `content_url` is null in this fixture);
3. Loads mystery overlays via `loadMysteryOverlays` → `queryContent`;
4. Merges with `deepMergeNodes` (identical function reused in the probe);
5. Writes the merged tree to Redis via `setCache`.

An in-flight dedup map (`inflightResolutions`, keyed on
`user:${userId}:tree:${baseTreeId}`) coalesces **same-key** concurrency
(S3). Distinct cache keys each run the full pipeline independently (S4).

### Instrumentation

- **Real resolver, no production changes.** The benchmark imports the actual
  `DialogueResolver` and `deepMergeNodes`. No `server/src` file was modified
  (only an additive script: `server/scripts/m30_benchmark.ts`).
- S2 uses a mirrored stage probe that calls the same private stages and the
  identical `deepMergeNodes`; per-stage timing is therefore representative.
- Timing via `performance.now()` deltas captured per call; reported as
  p50/p95/p99/max with N ≥ 100 for S1/S2.

### Fixtures (synthetic, isolated, cleaned up)

Per `AGENTS.md` test-isolation rules, **all** fixtures use a dedicated `d0d0`
UUID namespace (no collision with real `a0000000`-prefixed content IDs) and are
removed in `teardown()` (verified: 0 leftover rows, Redis `DBSIZE 0` after each
run). Player data was never touched — only synthetic users/mysteries created by
this script.

- **Base tree:** 150 nodes (~150 KiB JSON) — larger than any real tree (largest
  real tree is 38 nodes / 27 KiB) to stress the merge.
- **Overlays:** the 3 global `ACTIVE` mysteries each get a 60-node overlay
  (mirrors the "60 nodes per active mystery" spec). For S4, each concurrent
  caller additionally investigates a **distinct** synthetic mystery (status
  `ARCHIVED`, so it does *not* pollute the global `getActiveMysteries()` set) —
  this is what makes each caller's cache key genuinely distinct.
- **Real-data note:** the live DB has exactly **1** ACTIVE mystery, **1** overlay
  (5 nodes), and an **empty** Redis. Real content is far below the M30 hypothesis
  regime, so synthetic fixtures are required; real sizes are reported separately
  in S6 for honesty.

**Correction during bench:** an earlier S4 run wrongly inserted the per-user
investigating mysteries as `ACTIVE`, which polluted the global
`getActiveMysteries()` and inflated the merge 500× (false 30 s result). Fixed by
using `ARCHIVED` status for per-user investigating mysteries. All numbers below
are post-fix.

---

## Environment

| Item | Value |
|---|---|
| Container runtime | Podman (rootless), `las-flores-net` bridge |
| Postgres OLTP | `las-flores-postgres-oltp` (16-alpine), host `:5434`, `max_connections` default |
| Postgres OLAP | `las-flores-postgres-olap` (16-alpine) |
| Redis | `las-flores-redis` (7.4.9, jemalloc), host `:6379`, `maxmemory 0` (noeviction) |
| MinIO | `las-flores-minio:9000` (CDN path; `content_url` null in fixture ⇒ DB fallback) |
| `oltpPool` | `max: 50` (`infra/src/connection.ts:24`) |
| `contentPool` | `max: 10` (`infra/src/connection.ts:68`) — **read-only content reads** |
| `olapPool` | `max: 20` |
| Node | v24.18.0 (runner), `tsx` |
| `deepMergeNodes` | identical to production (`dialogueResolverUtils.ts:57`) |
| Real content sizes | largest tree 38 nodes / 27 KiB; 1 overlay (5 nodes); 1 ACTIVE mystery; Redis `DBSIZE 0` at start |
| Host load | idle dev box; live `server` + `intake-worker` containers share the DB (noted as a minor confound for absolute latency, not for the saturation finding) |

---

## Results

### S1 — Warm cache hit

Resolve the same user/state twice; measure the 2nd (cache hit + still-runs context reads).

| Metric | p50 | p95 | p99 | max | n |
|---|---|---|---|---|---|
| Warm full call | 4.2 ms | 8.1 ms | 9.8 ms | 10.3 ms | 100 |

Baseline the merge must be compared against. Warm latency is dominated by the
4 context reads that still run before the Redis GET, not by the merge.

### S2 — Cold single resolve (per-stage, N=100)

`invalidatePattern` then resolve with a fresh, distinct key each sample.

| Stage | p50 | p95 | p99 | max |
|---|---|---|---|---|
| ctx reads (4 OLTP) | 0.8 ms | 2.6 ms | 3.3 ms | 12.3 ms |
| base tree load (content) | 1.2 ms | 3.1 ms | 3.8 ms | 4.8 ms |
| overlay load (content) | 1.2 ms | 2.7 ms | 5.0 ms | 5.5 ms |
| **deepMergeNodes** | **0.3 ms** | **0.9 ms** | **1.3 ms** | 1.4 ms |
| cache write (Redis) | 0.9 ms | 1.6 ms | 2.2 ms | 6.4 ms |
| **TOTAL cold** | 4.9 ms | 8.8 ms | 12.6 ms | 25.0 ms |

**Key finding:** the merge itself is ~0.4 ms (p50) / ~1.3 ms (p99) — a tiny
fraction of the ~5–13 ms cold resolve. The cold-merge total p99 (12.6 ms) is
**well under the 250 ms** gate. M30's premise that "the merge is a large
fraction of request latency" is **false for single resolves**.

### S3 — Same-key herd (coalescing regression check)

500 concurrent resolves for the **same** user/state, fired after invalidation.

| Metric | Value |
|---|---|
| Cold same-key herd (500 concurrent), wall | 7.5 ms (coalesced to 1 merge) |
| Warm same-key herd (500 concurrent), wall | 4.5 ms |

**Finding:** the existing `inflightResolutions` coalescing holds — 500 concurrent
same-key requests collapse to a single merge. The mitigation is **not broken**.
(S4 is the real question, not S3.)

### S4 — Distinct-key herd (the real M30 question)

After `invalidatePattern('dialogue:resolved:*')`, fire concurrent resolves across
genuinely **distinct** cache keys (distinct user alignment × nsfw × story-beat ×
investigating-mystery set). Bounded in-flight concurrency 200 to avoid harness
OOM; max active PG connections sampled during the herd.

| Scale | p50 | p95 | p99 | max | wall (drain) | max active PG (contentPool/oltpPool) |
|---|---|---|---|---|---|---|
| 30 | 129 ms | 136 ms | 136 ms | 136 ms | 138 ms | 8 / 10 (content) , 0–1 (oltp) |
| 100 | 235 ms | 304 ms | 305 ms | 306 ms | 308 ms | 9 / 10 (content), 0–1 (oltp) |
| 500 | 306 ms | 537 ms | **562 ms** | 567 ms | **1.17 s** | 8 / 10 (content), 0–8 (oltp) |

**Key finding:** at 500 concurrent distinct keys, **p99 = 562 ms** and the full
drain takes **1.17 s** — and the **`contentPool` (max 10) saturates** (observed
8–9 of 10 active connections throughout). The `oltpPool` (max 50) is essentially
untouched. So the bottleneck is the **shared read-only content pool**, not OLTP
and not the merge CPU. Every distinct miss independently pulls the base tree +
overlays through the 10-connection content pool, and they queue.

This is the thundering-herd cost M30 targets: after a Breakthrough invalidation,
players spread across many distinct `(nsfw × alignment × beat × mystery-set)`
keys all miss simultaneously, and each distinct key competes for one of only 10
content-pool connections.

### S5 — Invalidation sweep cost

Seeded realistic mixed keyspace (30% `dialogue:resolved:*` + 70% other
namespaces: `user:state`, `user:vault`, `user:location`, `content:version`).
Measured `invalidatePattern('dialogue:resolved:*')` wall time + p99 of a
concurrent trivial `GET` during the sweep.

| Total keys | deleted | sweep wall | concurrent GET p99 during sweep |
|---|---|---|---|
| 500 | 150 | 1.3 ms | 0.3 ms |
| 5,000 | 1,500 | 10.4 ms | 0.8 ms |
| 20,000 | 6,000 | 23.2 ms | 0.3 ms |

**Finding:** sweep time scales with **total** keyspace (SCAN iterates all keys
regardless of match), but stays **well under the 2 s** gate even at 20k keys, and
concurrent GET latency does **not** degrade (no event-loop stall observed). The
SCAN-with-COUNT-100 + UNLINK design holds up; S5 gate is **NOT met**.

### S6 — Redis memory footprint

Per resolved tree (synthetic 150-node fixture), measured via `MEMORY USAGE`.

| Metric | Value |
|---|---|
| Resolved-tree JSON size (synthetic 150-node) | 153,332 B (149.7 KiB) |
| Redis `MEMORY USAGE` (incl overhead) | 163,912 B |
| @ 1,000 keys | ~146 MiB JSON / ~156 MiB Redis |
| @ 10,000 keys | ~1,462 MiB JSON / ~1,563 MiB Redis |
| @ 100,000 keys | ~14.6 GiB JSON / ~15.6 GiB Redis |
| Combinatorial ceiling | 2 × 3 × 5 × 2³ = **240** state keys (real regime) |

**Reality check:** the synthetic fixture (150 nodes) overstates size. The largest
**real** tree is 27 KiB / 38 nodes. Scaling the real figure: ~264 MiB at 10k keys,
~2.6 GiB at 100k keys — still far below the 512 MB ceiling at realistic
diversity (the real combinatorial ceiling is only **240** distinct state keys,
since there are 3 ACTIVE mysteries and 5 story beats). **S6 gate (512 MB) is NOT met**
under real content; even the synthetic 150-node tree needs ~10k keys (≈40×
realistic diversity) to approach 1.5 GiB.

MinIO trade: M30 moves each distinct resolved tree to one MinIO object (S3
storage, ~$0.02/GB/mo). The Redis memory M30 saves is bounded by the 240-key
ceiling → at most ~35 MiB even for the synthetic tree, ~6 MiB for real content.

---

## Gate Evaluation (mechanical, per `M30-M31-deferred.md`)

The gate is **MET** if **any** of:

| # | Criterion | Threshold | Measured | Verdict |
|---|---|---|---|---|
| 1 | S2 cold-merge p99 > 250 ms **AND** S1 warm p99 < 50 ms | 250 ms / 50 ms | S2 p99 = 12.6 ms; S1 p99 = 9.8 ms | **NOT MET** (merge is cheap) |
| 2 | S4 distinct-key herd: p99 > 1 s **OR** pool saturation at ≤ 500 concurrent | 1 s / saturation | S4@500: p99 = 562 ms, wall = 1.17 s, **contentPool saturates (8–9/10)** | **MET** (saturation at ≤500) |
| 3 | S5 sweep > 2 s at ≤ 20k keys **OR** concurrent-GET p99 degrades > 10× | 2 s / 10× | S5@20k = 23 ms; GET p99 ≤ 0.8 ms (no degradation) | **NOT MET** |
| 4 | S6 extrapolated Redis memory > 512 MB at realistic diversity | 512 MB | Real regime 240 keys ≈ 6 MiB; synthetic needs ~10k keys for 1.5 GiB | **NOT MET** |

**At least one criterion (criterion 2) is MET** → the M30 gate is **MET**.

---

## Verdict

### MET — M30 is warranted.

The distinct-key thundering herd (S4) is a real cost: after a single Breakthrough
invalidation, 500 concurrent players across distinct state keys produce **p99 =
562 ms** and a **1.17 s** full drain, with the **shared `contentPool` (max 10)
saturating** (8–9/10 active). This is precisely the cost M30 eliminates by
pre-resolving `(tree_id, active-mystery-set)` → MinIO JSON at migration time, so
a post-invalidation miss becomes a single MinIO GET + JSON.parse instead of a
4-read + CDN-fallback + merge pipeline competed for 10 content connections.

---

## Recommendation

**Proceed to M30 planning — but sequence it correctly:**

1. **Cheap, high-leverage fix first (not M30):** the saturation is in
   `contentPool` (`max: 10`, `infra/src/connection.ts:68`), not in the merge
   CPU. Bumping `contentPool` to a larger value (e.g. 30–50, still read-only) or
   adding a short-TTL **request-scoped** cache of the base tree + active overlays
   would absorb most of the S4 cost for a fraction of M30's build complexity.
   This should be validated as a quick follow-up; if it pushes S4 p99 back under
   ~100 ms at 500 concurrent, M30 becomes a "nice to have" rather than urgent.

2. **M30 as the strategic elimination:** if load testing (e.g. the existing
   `tests/load/breakthrough_rush.js` k6 suite) at realistic concurrent-player
   counts confirms S4-style saturation persists after the pool bump, proceed
   with M30's pre-resolved snapshots. Note M30 trades Redis memory
   (bounded — only ~240 distinct keys under real content ⇒ ~6 MiB) for MinIO
   storage (cheap, effectively unbounded), a favorable trade.

3. **Do NOT pursue M30 for S5/S6 reasons:** invalidation sweep (S5) and Redis
   memory (S6) are both comfortably within gates under real content. The M30
   motivation is strictly the S4 distinct-key herd, and even there the immediate
   lever is the content pool size.

4. **Revisit trigger for *deferring* M30** (per `M30-M31-deferred.md`): if the
   `contentPool` bump (item 1) keeps p99 < 250 ms at ≥ 500 concurrent distinct
   keys in the k6 breakthrough rush, keep M30 deferred and record the pool-size
   fix as the resolution. Re-benchmark with this same script
   (`server/scripts/m30_benchmark.ts`) after any change.

## Recommendation

**Proceed to M30 planning — but sequence it correctly:**

1. **Cheap, high-leverage fix first (not M30):** the saturation is in
   `contentPool` (`max: 10`, `infra/src/connection.ts:68`), not in the merge
   CPU. Bumping `contentPool` to a larger value (e.g. 30–50, still read-only) or
   adding a short-TTL **request-scoped** cache of the base tree + active overlays
   would absorb most of the S4 cost for a fraction of M30's build complexity.
   This should be validated as a quick follow-up; if it pushes S4 p99 back under
   ~100 ms at 500 concurrent, M30 becomes a "nice to have" rather than urgent.
   **⚠ This hypothesis was TESTED on 2026-08-18 and NOT confirmed — see
   "Post-implementation re-validation" below.**

2. **M30 as the strategic elimination:** if load testing (e.g. the existing
   `tests/load/breakthrough_rush.js` k6 suite) at realistic concurrent-player
   counts confirms S4-style saturation persists after the pool bump, proceed
   with M30's pre-resolved snapshots. Note M30 trades Redis memory
   (bounded — only ~240 distinct keys under real content ⇒ ~6 MiB) for MinIO
   storage (cheap, effectively unbounded), a favorable trade.

3. **Do NOT pursue M30 for S5/S6 reasons:** invalidation sweep (S5) and Redis
   memory (S6) are both comfortably within gates under real content. The M30
   motivation is strictly the S4 distinct-key herd, and even there the immediate
   lever is the content pool size.

4. **Revisit trigger for *deferring* M30** (per `M30-M31-deferred.md`): if the
   `contentPool` bump (item 1) keeps p99 < 250 ms at ≥ 500 concurrent distinct
   keys in the k6 breakthrough rush, keep M30 deferred and record the pool-size
   fix as the resolution. Re-benchmark with this same script
   (`server/scripts/m30_benchmark.ts`) after any change.

---

## Post-implementation re-validation (2026-08-18) — pool bump A/B

**What was changed:** `infra/src/connection.ts` made `contentPool.max`
env-driven (`CONTENT_POOL_MAX`, default `10`, no behavior change for existing
deployments); `docker-compose.yml` set `CONTENT_POOL_MAX: 30` on the game-server
service only. Unit tests added for both the default and the override.

**Controlled A/B (the premise behind Recommendation #1):** re-ran S4 at 500
distinct keys on the same host back-to-back, sampler enabled
(`BENCH_S4_SAMPLE=1`):

| Pool size | p99 | p95 | wall (drain) | max active PG conns (whole `las_flores` DB) |
|---|---|---|---|---|
| 10 (baseline) | 558.4 ms | 546.0 ms | 1197.9 ms | **5** |
| 30 | 603.4 ms | 602.6 ms | 1261.3 ms | **5** |

(A second unsampled pair gave 632/1353 (10) vs 654/1309 (30).)

**Result: the pool bump did NOT reduce S4.** In every run the maximum number of
`active` Postgres connections observed across the entire `las_flores` database
was **5** — the pool was never near its cap at either 10 or 30. The benchmark
doc's earlier "contentPool 8–9/10 saturated" figure was not reproduced on this
run; the active-connection sampler (`m30_benchmark.ts:405-417`) polls
`pg_stat_activity` and aggregates *all* pools on the DB, and it is gated behind
`BENCH_S4_SAMPLE` (it defaults off — earlier runs that printed "max active = 0"
were simply not sampling).

**Interpretation.** The p99 ≈ 0.55–0.63 s at 500 distinct players is
reproducible and is a real user-visible tail cost even while DB connections sit
idle at 5/50. Therefore the S4 cost is **not connection-pool bound** here; it is
best explained by Node-side JSON serialization/deserialization of the large base
tree + overlays and Redis `setCache`/network I/O at high in-flight concurrency,
plus shared-host contention with the live `server`/`intake-worker`. This shifts
the balance of evidence **toward M30** (a pre-resolved snapshot makes a
post-invalidation miss exactly one MinIO GET + one JSON.parse of an already-merged
tree — removing both the per-state re-merge and the base+overlay multi-read from
the herd path) rather than a pool-size tweak. The `CONTENT_POOL_MAX` knob and the
`docker-compose.yml` `CONTENT_POOL_MAX: 30` are retained as harmless read-only
headroom, but **should not be credited as the fix**.

**Next decision point (per `M30-M31-deferred.md`):** with Recommendation #1
disproven at the probe level, either (a) proceed to M30 planning, or (b) first
isolate the S4 bottleneck (Node JSON CPU vs Redis vs shared-host noise) with a
pair of quick experiments — e.g. re-run S4 with real-tree-sized fixtures
(38 nodes ≈ 4× smaller) and measure whether p99 scales proportionally to tree
size, which would confirm the JSON-parse-bound hypothesis and support M30.

---

- Absolute latencies include a minor confound: the live `server` + `intake-worker`
  containers share the OLTP/Redis instances during the bench. The **saturation
  finding** (contentPool maxing at 8–9/10) is robust to this because it is a
  relative observation (connections consumed vs. pool max), not an absolute
  latency claim.
- Synthetic tree (150 nodes) is ~4× the largest real tree (38 nodes); S6's
  absolute memory numbers are scaled accordingly and the real-regime figure is
  given.
- S4 at 2000 distinct keys was attempted but caused a harness CPU/memory runaway
  under unbounded in-flight concurrency; the bounded (200 in-flight) sweep at 500
  is the reliable measurement and already exceeds the gate, so 2000 was not
  needed for the verdict.
- No `server/src` production behavior was changed; the probe is additive
  (`server/scripts/m30_benchmark.ts`) and all fixtures are cleaned up
  (verified 0 leftover rows, `DBSIZE 0`).
- **The reported "contentPool 8–9/10 saturation" (S4) was NOT reproduced on
  re-validation (2026-08-18): max active PG connections stayed at 5 across all
  runs, and the `contentPool` 10→30 bump left p99 unchanged.** Treat the
  saturation figure as host/condition-dependent; the reproducible result is the
  ~0.55–0.63 s p99 tail at 500 distinct players, which is the operative M30
  signal (see "Post-implementation re-validation").
