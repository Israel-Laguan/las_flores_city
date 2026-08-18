# M30 & M31 — Deferred / Optional Milestones

> **Status:** Deferred (not yet scheduled) · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §6, §15.9
>
> **Update (2026-08-18):** the M30 gate benchmark is complete
> (`docs/milestones/M30-benchmark-results.md`) and M30 was tentatively moved OUT of
> deferral (verdict MET) — but the "cheap fix first" recommendation (bump
> `contentPool` max) was tested and **did not reduce the S4 distinct-key herd
> tail** (p99 ≈ 0.55–0.63 s at 500 players, unchanged at pool size 10 vs 30;
> DB connections not saturated). M30 is accordingly **moving into Phase A
> (tree-level snapshots) implementation** — plan:
> `.kilo/plans/m30-presolved-overlay-snapshots.md`. M31 stays deferred per §15.9.

---

## M30 — Pre-Resolved Per-State Overlay Snapshots (endgame)

**When:** only if the Redis merge step in M23 Phase 1 becomes a bottleneck at scale.

| Item | Detail |
|---|---|
| Pre-resolve `(tree_id, sorted-active-mystery-set)` → MinIO JSON at migration time | Removes even the Redis merge step |
| Trade | More build complexity; content-addressed keys per state combination |
| Gate | Benchmark shows Redis merge latency or thundering-herd on invalidation is a real cost |

Not part of the near-term sequence; revisit only when load demands it.

### Decision record (gate benchmark, 2026-08-18)

- **Status:** gate benchmark done (`docs/milestones/M30-benchmark-results.md`); Phase A planned - `.kilo/plans/m30-presolved-overlay-snapshots.md`.
- **Metric:** the reproducible S4 distinct-key herd p99 ≈ 0.55–0.63 s at 500 players
  after a Breakthrough invalidation. The initial gate reading ("contentPool 8–9/10
  saturation") was **not reproduced** on a controlled A/B pool 10 vs 30 (max active
  PG connections = 5 in all runs; p99 unchanged). The tail is therefore not
  connection-pool bound and is best explained by Node-side JSON + Redis writes at
  high concurrency — a hypothesis that favors M30's pre-resolved snapshots.
- **Pool change:** `infra/src/connection.ts` now reads `CONTENT_POOL_MAX` (default 10);
  `docker-compose.yml` sets `CONTENT_POOL_MAX: 30` on the game-server only. Kept as
  harmless read-only headroom, not credited as the fix.
- **M30 stands** as the strategic elimination (pre-resolve `(tree_id, active-mystery
  set)` → MinIO JSON at migration time; post-invalidation miss = one MinIO GET +
  one JSON.parse, no per-state re-merge/rewrite).
- **REVISED DECISION (2026-08-18): PROCEED with M30 Phase A - tree-level snapshots.**
  Plan: `.kilo/plans/m30-presolved-overlay-snapshots.md`. The pool-size lever is dropped from remediation (tested, no effect). Phase B (chunk snapshots) is a separate follow-up PR per the <=25-files rule.

---

## M31 — Task-Graph Agent Swarm (markdown)

**When:** only if M21–M22 (worker + durable jobs) and M29 (review queue) prove insufficient
for the "messy, unbounded" conflict workflows described in the enrichment discussion.

- **Context:** the plan-to-date already covers ~80% of the multi-agent benefit through a
  pipeline of specialized passes + durable jobs + human review (§15.9).
- **If needed:** a task-graph/job-Kanban table (`task { id, parent_id, job_id, type,
  status, retries, owner, payload }`) decomposes ingest across "investigators" without
  builder-in autonomy.
- **Do NOT start here.** The staged compiler (§15) delivers the same benefit with far less
  coordination overhead.

---

## Notes for any deferral

- Keep both deferred docs updated if the sequencing in `README.md` changes.
- If a scheduled milestone grows beyond ~25 files, split into two PRs rather than one large
  one (see the "How to run a milestone" note in `README.md`).