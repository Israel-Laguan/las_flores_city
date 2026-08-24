# M45 — Snapshot Closeout and M31 Decision

> **Status:** Planned · **Owner:** story-engine effort
> **Source:** `ARCHITECTURE_RUNTIME.md`, `AUTHORING_RETIREMENT.md`, and `M31-deferred.md`

## Goal

Close the pre-resolved dialogue-state implementation evidence loop and make an explicit,
evidence-based decision about whether
the deferred M31 task-graph agent swarm should remain deferred.

## Scope

- Reconcile snapshot implementation status, benchmark interpretation, and production-readiness evidence.
- Verify snapshot generation, publication, pointer persistence, resolver reads, cache behavior,
  and fallback behavior after content migration.
- Re-run the relevant benchmark with documented environment and representative content when
  current evidence is insufficient; do not create another milestone evidence ledger.
- Record whether M31 has a demonstrated need beyond the existing durable jobs, specialized passes,
  and human review queue.

## Acceptance Criteria

- [ ] Snapshot behavior has one authoritative architecture description and benchmark interpretation.
- [ ] Snapshot generation and resolver integration have automated test evidence.
- [ ] A representative benchmark result is recorded with reproducible setup details.
- [ ] M31 is explicitly retained as deferred or scheduled based on workflow/load evidence.
- [ ] No obsolete recommendation or duplicate status remains in active milestone documents.

## Verification

```bash
npm run test --workspace=server
npm run build --workspace=server
```

Run the canonical benchmark when a fresh measurement is needed. Use its output as
operational evidence for this closeout, not as a new historical milestone document:

```bash
# Required services: postgres-oltp, redis, minio, intake-worker (content tables),
# game-server — all up and healthy (in-container wget health checks).
# Environment: CONTENT_POOL_MAX unset-or-default, representative content migrated.
node server/scripts/m30_benchmark.ts   # S4 shared-set herd at 500 concurrent; distinct-key sweep per the script's scenarios
```

Do not schedule M31 based on architecture speculation alone.

## Relationship to Existing Documentation

The runtime and authoring architecture documents describe the durable current contract.
`M31-deferred.md` remains the only milestone record for the optional task-graph work.
