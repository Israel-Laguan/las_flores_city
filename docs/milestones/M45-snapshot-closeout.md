# M45 — Snapshot Closeout and M31 Decision

> **Status:** Planned · **Owner:** story-engine effort
> **Source records:** M30 snapshots, M30 benchmark results, and M30-M31 deferred decision

## Goal

Close the M30 Phase A evidence loop and make an explicit, evidence-based decision about whether
the deferred M31 task-graph agent swarm should remain deferred.

## Scope

- Reconcile M30 implementation status, benchmark verdict, and production-readiness evidence.
- Verify snapshot generation, publication, pointer persistence, resolver reads, cache behavior,
  and fallback behavior after content migration.
- Re-run the relevant benchmark with documented environment and representative content.
- Record whether M31 has a demonstrated need beyond the existing durable jobs, specialized passes,
  and human review queue.

## Acceptance Criteria

- [ ] M30 has one authoritative status and benchmark interpretation.
- [ ] Snapshot generation and resolver integration have automated test evidence.
- [ ] A representative benchmark result is recorded with reproducible setup details.
- [ ] M31 is explicitly retained as deferred or scheduled based on workflow/load evidence.
- [ ] No obsolete recommendation or duplicate status remains in the M30/M31 documents.

## Verification

```bash
npm run test --workspace=server
npm run build --workspace=server
```

Run the canonical M30 benchmark with its required services and record the result in
`docs/milestones/M30-benchmark-results.md`:

```bash
# Required services: postgres-oltp, redis, minio, intake-worker (content tables),
# game-server — all up and healthy (in-container wget health checks).
# Environment: CONTENT_POOL_MAX unset-or-default, representative content migrated.
node server/scripts/m30_benchmark.ts   # S4 shared-set herd at 500 concurrent; distinct-key sweep per the script's scenarios
```

Record the measured p99 in the benchmark document with the environment noted.
Do not schedule M31 based on architecture speculation alone.

## Relationship to Existing Records

M30-snapshots.md, M30-benchmark-results.md, and M30-M31-deferred.md remain the evidence records;
M45 is the closeout and decision boundary, not a rewrite of their historical measurements.
