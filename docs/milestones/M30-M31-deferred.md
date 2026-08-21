# M31 — Deferred / Optional Milestone

> **Status:** Deferred (not yet scheduled) · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §6, §15.9

M30 is no longer deferred. Its Phase A implementation is tracked in
`M30-snapshots.md`, with benchmark evidence in `M30-benchmark-results.md`.

## M31 — Task-Graph Agent Swarm

**When:** only if M21–M22 (worker + durable jobs) and M29 (review queue) prove insufficient
for the “messy, unbounded” conflict workflows described in the enrichment discussion.

- **Context:** the plan-to-date already covers approximately 80% of the multi-agent benefit through specialized passes, durable jobs, and human review (§15.9).
- **If needed:** a task-graph/job-Kanban table (`task { id, parent_id, job_id, type, status, retries, owner, payload }`) could decompose ingest across investigators without builder-in autonomy.
- **Do not start here:** the staged compiler (§15) delivers the same benefit with less coordination overhead.

## Deferral Notes

- Keep M31 deferred until load or workflow evidence justifies the coordination overhead.
- If scheduled, split work beyond the repository’s approximately 25-file milestone target.
