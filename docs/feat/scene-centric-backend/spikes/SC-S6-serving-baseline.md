# SC-S6 — Dialogue serving baseline: p50/p95, and is `resolveChunkSpeakers` the hot spot?

**Box:** 1 day · **Actual:** ~2 hours · **Date:** 2026-09-08
**Feeds:** SC-508, R13, SC-M3

## Question

`lessons-from-current-code.md` §2.9 identifies `resolveChunkSpeakers` (uncached bulk
`SELECT` plus per-portrait object-storage presigning on every response) as a *suspected*
hot spot in the current dialogue serving path — found by reading code, not by measuring.
R13 forbids treating a suspicion as a baseline, and SC-M3's serving-benchmark deliverable
needs a real number to compare against. This spike measures the actual path instead of
asserting it.

## What was run

`server/scripts/spike_sc_s6_serving_baseline.ts` (`npx tsx server/scripts/spike_sc_s6_serving_baseline.ts`,
run from the `server/` workspace with the repo-root `.env` sourced; **not committed** with
this write-up — see the reproducibility rule in this folder's README), against the
already-running local docker-compose stack (`las-flores-server` on `:3000`,
`las-flores-postgres-oltp` on `:5434`, `las-flores-minio` on `:9000`) — no code changes,
no synthetic infra, just the existing dev stack anyone gets from `docker compose up -d`.

The script seeds one synthetic dialogue tree/chunk (cleaned up in a `finally` block)
whose 3 nodes reference 3 **real** characters from the existing seeded dataset: one with
42 `portrait_urls` entries (all real `s3://` keys) and two with 1 entry each — a
realistic multi-speaker chunk rather than an artificial best/worst case. It then runs,
each with 3 warmup + 30 timed iterations (`process.hrtime.bigint()`, min/p50/p95/max
reported):

1. **Full endpoint, blackbox HTTP** — `GET /dialogue/active` against the live server.
   This is the actual "chunk fetch" a client calls; there is no separate "portrait load"
   request in the current path — presigned portrait URLs are embedded in this same JSON
   response, resolved server-side inside `resolveChunkSpeakers`. So this number answers
   both the "chunk fetch" and "portrait load" asks in one measurement, honestly
   reflecting how the current path actually works.
2. **`resolveChunkSpeakers()` in isolation** — same process, same DB/MinIO connections,
   called directly (bypassing the route/auth/HTTP layers) to isolate its own cost.
3. **The bulk `characters` `SELECT`, alone** — the exact query `resolveChunkSpeakers`
   issues (`SELECT id, name, title, avatar_url, portrait_urls FROM characters WHERE id =
   ANY($1::uuid[])`), run directly via `queryOLTP`, to separate the `SELECT` from the
   presigning step within `resolveChunkSpeakers`.

Presigning-only cost and "rest of `/dialogue/active`" cost are then derived by
subtraction (#2 − #3, and #1 − #2, respectively) — an approximation (it ignores the
~1-2ms of fetch()/HTTP overhead the blackbox measurement carries that the in-process
calls don't), stated as such below, not as an exact split.

Committing the harness (e.g. under `server/scripts/`) is required before anyone re-runs
this — the "repeat by anyone" step currently depends on a file that is not in the repo.

## Raw results

Two consecutive runs (unedited console output):

**Run 1:**
```
sample response: 3 speakers, 44 presigned portrait_urls total
full endpoint (chunk fetch + portrait load): n=30 min=19.07ms p50=26.14ms p95=39.20ms max=48.67ms
resolveChunkSpeakers total (SELECT + presign):  n=30 min=5.21ms  p50=7.57ms  p95=12.00ms max=17.89ms
bulk SELECT only:                               n=30 min=0.20ms  p50=0.61ms  p95=1.69ms  max=1.74ms

presigning only (resolveChunkSpeakers - bulk SELECT):        p50=6.96ms  p95=10.31ms
rest of /dialogue/active (endpoint - resolveChunkSpeakers):  p50=18.57ms p95=27.20ms
resolveChunkSpeakers share of endpoint:                      p50=29.0%  p95=30.6%
```

**Run 2:**
```
sample response: 3 speakers, 44 presigned portrait_urls total
full endpoint (chunk fetch + portrait load): n=30 min=19.51ms p50=24.58ms p95=34.41ms max=38.43ms
resolveChunkSpeakers total (SELECT + presign):  n=30 min=4.95ms  p50=7.41ms  p95=15.36ms max=15.38ms
bulk SELECT only:                               n=30 min=0.18ms  p50=0.33ms  p95=0.90ms  max=1.17ms

presigning only (resolveChunkSpeakers - bulk SELECT):        p50=7.08ms  p95=14.46ms
rest of /dialogue/active (endpoint - resolveChunkSpeakers):  p50=17.18ms p95=19.05ms
resolveChunkSpeakers share of endpoint: p50=30.1% p95=44.6%
```

## Answer

**Numbers** (GET `/dialogue/active`, 3-speaker chunk, 44 presigned portrait URLs, local
docker-compose stack):
- **Chunk fetch + portrait load (full endpoint): p50 ≈ 25ms, p95 ≈ 35-39ms.**
- `resolveChunkSpeakers` alone: p50 ≈ 7.4-7.6ms, p95 ≈ 12-15ms.
- The bulk `characters` `SELECT` alone: p50 ≈ 0.3-0.6ms, p95 ≈ 0.9-1.7ms — negligible.

**Is `resolveChunkSpeakers` the hot spot? No — that was a reading error, not a measured
fact.** It accounts for roughly **29-30% of p50 and 31-45% of p95** endpoint latency, not
the majority. Two things the code-reading suspicion got specifically wrong:

- The "uncached bulk `SELECT`" half of the suspicion is not a real cost: p50 ≈ 0.3-0.6ms
  against a 196-row `characters` table on an indexed UUID `= ANY(...)` lookup. It would
  need to grow roughly 15-20x in raw query cost before it became a plausible bottleneck,
  and Postgres index lookups don't degrade that way with content growth — a lookup by
  UUID stays near-constant as unrelated rows are added.
- Per-portrait presigning (`signMinioUrl` via the AWS SDK's `getSignedUrl`, a local HMAC
  computation, not a network round-trip to MinIO) is the real cost *within*
  `resolveChunkSpeakers` — p50 ≈ 7ms for 44 URLs across 3 characters, i.e. roughly
  0.15-0.2ms per signed URL. It is real and it does scale with portrait count (a chunk
  with more/heavier-portrait speakers costs proportionally more here), but the **rest of
  `/dialogue/active`** (cursor lookup, `dialogue_trees`/`dialogue_chunks` lookups,
  `DialogueResolver.resolveChunkForUser`'s parallel mystery/NSFW/story-beat state loads,
  overlay resolution, `filterChoices`, CDN content fetch for the chunk body) costs more
  — p50 ≈ 17-19ms, roughly 70% of the total — and none of that work is instrumented or
  named in the original suspicion at all.

## What it changes

- **R13's "no performance goal without a baseline" is now satisfied for the dialogue
  serving path**: SC-M3's serving-benchmark deliverable has a real number to compare
  against — p50 ≈ 25ms / p95 ≈ 35-39ms end-to-end for a realistic 3-speaker chunk, not an
  assumption.
- **`lessons-from-current-code.md` §2.9 should be corrected**, not just cited: the
  document currently frames `resolveChunkSpeakers` as *the* hot spot; the measured
  evidence is that it's a real but minority cost (~30-45%), and the specific "uncached
  bulk SELECT" framing is actively misleading — that half of the function is not
  measurably slow at current or 10-20x table volume. Any SC-M3 optimization work aimed at
  `resolveChunkSpeakers` should target the **presigning step specifically** (e.g. caching
  signed URLs for the `PORTRAIT_URL_TTL` window instead of re-signing on every response —
  a change resolveChunkSpeakers's own docstring already flags a generous TTL exists for),
  not the `SELECT`, and should not expect it alone to move the endpoint's p95 by more
  than ~30-45%.
- **The bigger, unnamed opportunity is the other ~70% of the endpoint** — the sequential
  cursor/tree/chunk lookups and `DialogueResolver.resolveChunkForUser`'s several
  DB round-trips ahead of `resolveChunkSpeakers`. If SC-M3 wants a serving-latency win
  bigger than presign-caching alone, that's where to look next — this spike did not
  profile it further; it only isolates it by subtraction as "everything that isn't
  resolveChunkSpeakers."
- This spike is scoped to the existing `server/` path only, per its own dependency
  note — it makes no claim about the new `api/`/`entity_edges` serving path SC-M3 will
  eventually compare against; that comparison is future work, not this spike's job.
