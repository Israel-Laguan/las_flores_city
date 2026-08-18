# M30 & M31 — Deferred / Optional Milestones

> **Status:** Deferred (not yet scheduled) · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §6, §15.9

---

## M30 — Pre-Resolved Per-State Overlay Snapshots (endgame)

**When:** only if the Redis merge step in M23 Phase 1 becomes a bottleneck at scale.

| Item | Detail |
|---|---|
| Pre-resolve `(tree_id, sorted-active-mystery-set)` → MinIO JSON at migration time | Removes even the Redis merge step |
| Trade | More build complexity; content-addressed keys per state combination |
| Gate | Benchmark shows Redis merge latency or thundering-herd on invalidation is a real cost |

Not part of the near-term sequence; revisit only when load demands it.

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