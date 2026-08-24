# M47 - Intake Flow Stress Test and Evidence Gate

> **Status:** Planned · **Owner:** story-engine effort
> **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` sections 6, 15.7-15.9,
> `ARCHITECTURE_RUNTIME.md`, `DATA_INTAKE.md`, and the former M31/M45/M46 decision records

## Goal

Measure the current content-intake flow under realistic workflow and load conditions,
record the numbers in a reproducible run record, and make an evidence-based judgement
about whether the current durable jobs, specialized passes, and human review queue are
sufficient.

This milestone is an evidence gate. It does not assume that the task-graph agent swarm is
needed, and it does not assume that the current design is sufficient.

## Roadmap Context

This file is the active milestone record for the story-engine effort. It carries forward
the context that was previously split between the milestone index and completed milestone
files so the future measurement and its judgement have one durable location.

### Existing baseline

- M42 hardened `verify-assets.mjs` to report malformed and empty asset references as errors.
  Its validator regression coverage and Podman verification established the content-quality
  baseline used by M46.
- M46 cleared the bounded invalid-reference findings from that baseline. The details and
  decisions are preserved in the Content-Reference Baseline section below.
- The current dependency path is foundation/runtime architecture -> graph authoring
  architecture -> authoring retirement -> M47 evidence gate. M31 is not an active build
  milestone; this run will determine whether a later M31 investigation is justified.

### Locked architectural decisions

- **Graph store:** Neo4j is the authoring graph store. Bloom/Neodash supports the admin
  graph-canvas authoring experience; `plan_json` is not the long-term graph authoring model.
- **Production artifact:** canon remains in the authoring layer (Postgres, Neo4j, versions,
  and proposals), while runtime consumes compiled JSON/CDN packages. Neo4j stays off the
  game hot path.
- **Commit boundary:** LLMs propose and the core system commits. Fuzzy extraction must not
  mutate canon directly; proposals remain human-reviewable deltas.

### Milestone operating rules

- Keep the measurement focused and split follow-up implementation when complexity or risk
  makes one change hard to review.
- Use architecture documents for current-state boundaries and keep durable decisions in
  `docs/`, not in a transient milestone transcript.
- Use a dedicated branch named `milestone/MM-<short-slug>` if implementation work is added
  after the evidence gate.

## Context

The current intake boundary is the write side of the system. The intake worker owns
migrations and content-table mutation; the game server reads the resulting content. The
existing flow is:

```text
submit intake request
  -> content plan / job status
  -> specialized extraction and validation passes
  -> durable job execution and retry/resume
  -> proposal or needs_review result
  -> human decision
  -> commit / migrate
  -> compile and publish runtime content
```

The current architecture already provides the mechanisms that M31 would otherwise
coordinate: `content_plans`, `job_runs`, worker handoff, specialized passes, and the
human-facing review queue. M31 section 15.9 therefore requires proving the smallest
workflow and load gap before adding task-graph coordination. In particular, latency by
itself is not evidence that a task graph is required.

The previous snapshot benchmark will remain context, not intake evidence. It measured a
dialogue snapshot runtime path with 500 callers and showed a useful snapshot fast path,
but it did not exercise intake submission, job recovery, proposal review, commit, or
compile throughput. The new run must measure those operations directly.

## Content-Reference Baseline

M47 will start from the content-reference state established by the former M46 work. The
purpose of carrying this context forward is to keep content validation noise separate from
intake workflow failures.

### Baseline findings

The M42 verification run identified these invalid or ambiguous references:

- `content/scenes/the_apartment/the_apartment.yaml` contained
  `ambient_sound_url: /assets/scenes/apartment/ambient.mp3`, a relative path rather than a
  published `s3://` or HTTP(S) URL.
- `content/scenes/welcome_center/welcome_center.yaml` contained
  `ambient_sound_url: null`, which should be omitted when no track exists.
- Dialogue folders `garcia_sisters`, `lin_sisters_encounter`, `lin_sisters_parents`,
  `lin_sisters_romance`, and `lin_sisters_test` lacked image-entity `.md`, `.prompt.md`,
  or `assets/` files; `valentina_quan_relationship` had an orphaned prompt file.
- District location files used bare `background_url: <filename.png>` shorthand in
  `centro_empresarial`, `electric_vehicle_zone`, `colegio_chino_latino`, and
  `centro_empresarial_chino_latino`.
- MinIO anonymous HEAD checks returned 403 because the local bucket is not public. This is
  an environment/permission signal, not a content defect, and must remain outside CI
  gating unless a public or signed-HEAD path is introduced.

### Baseline decisions

- The two `ambient_sound_url` values were removed. Re-add the field only when a real track
  is published as `s3://las-flores/...`; the scene upsert already defaults to NULL.
- Published top-level `background_url` values use
  `s3://las-flores/backgrounds/<slug>/<slug>__default.png`. Bare filenames remain staging
  references in `asset_paths.*` and remain invalid as top-level URLs. No schema or
  validator relaxation is planned.
- The dialogue folders are intentionally unpublished image entities containing playable
  dialogue trees. `content-audit.mjs` treats their `.md` and `.prompt.md` files as optional,
  and `verify-assets.mjs` skips them in the orphaned-prompt sweep. The
  `valentina_quan_relationship` prompt remains available for future image generation.
- CI may gate on zero `Invalid asset reference` findings. It must not gate on the MinIO 403
  sweep until the storage access model changes.

### Baseline verification

Before the stress run, re-establish the content baseline with:

```bash
node scripts/asset-pipeline/scripts/verify-assets.mjs
npm run content:audit
npm run validate:content
```

The run record must state whether these checks pass before intake measurements begin. A
content-reference failure must be recorded separately from an intake-flow failure.

## Scope

- Exercise the complete current intake path from submission through compile/publish.
- Use deterministic fixtures for extraction, validation, proposal generation, and conflict
  cases so results are repeatable and do not depend on external LLM availability.
- Measure both normal completion and interruption/recovery of durable jobs.
- Exercise the existing `needs_review` surface with conflicts that require human decisions.
- Capture resource, queue, latency, correctness, and operator-intervention data.
- Compare observed behavior with the declared workload envelope and make one of the
  decisions defined below.

## Workload Plan

The run record must include fixture sizes, concurrency, duration, host/container capacity,
commit, environment, and the exact command used. It must use dedicated synthetic IDs and
remove all generated plans, jobs, proposals, content rows, objects, and cache keys during
teardown.

### Scenario A - Baseline flow

Run one small, one medium, and one conflict-producing intake plan sequentially. Record
each stage separately:

- request acceptance and plan creation;
- queue wait and job start;
- extraction and specialized-pass duration;
- validation duration and conflict detection;
- proposal creation;
- review decision wait;
- commit/migrate duration;
- compile/publish duration;
- end-to-end completion and final status.

### Scenario B - Burst intake

Submit a stepped burst of concurrent plans using the declared representative fixture. At a
minimum, run 1, 10, 25, 50, and 100 concurrent plans, or document why a lower/higher set
better represents the expected authoring peak. Record accepted, rejected, failed, retried,
and completed counts at every step.

### Scenario C - Sustained intake

Run the representative workload for a fixed period long enough to expose queue growth.
Record submission rate, completion rate, queue depth, oldest queued job, worker utilization,
database pool utilization, Redis errors, MinIO errors, memory, CPU, and whether the queue
drains after submissions stop.

### Scenario D - Recovery and idempotency

Interrupt the intake worker during extraction, validation, commit preparation, and compile.
Restart it using the normal boot path and record whether each job resumes from persisted
partial state rather than restarting from zero. Re-submit an equivalent request and verify
that idempotency prevents duplicate proposals, commits, or published objects.

### Scenario E - Review throughput

Generate overlapping timeline/conflict proposals and process them through the existing
review queue. Record queue depth, time to decision, decisions by type, edit/merge failures,
and the amount of manual database or filesystem repair required. The test must verify that
review decisions preserve the invariant that proposed content does not mutate canon before
approval.

## Measurements

Every run must record the following numbers, with units and percentile definitions:

| Area | Required measurements |
|---|---|
| Intake API | request rate, acceptance latency p50/p95/p99, HTTP failures and timeouts |
| Jobs | submitted, started, completed, failed, retried, resumed, abandoned, duplicate attempts |
| Queue | depth over time, queue wait p50/p95/p99, oldest job, drain time |
| Work stages | extraction, validation, proposal, commit, migrate, compile, and publish durations |
| Review | proposals created, decisions by action, decision latency, backlog, manual interventions |
| Dependencies | OLTP pool wait/active use, Redis errors/latency, MinIO errors/latency, worker restarts |
| Host | CPU, memory, swap, container limits, load average, and process uptime |
| Correctness | lost jobs, duplicate commits, inconsistent statuses, invalid canon writes, leaked fixtures |

The result must include raw output or a checked-in summary table. A statement that the run
"passed" is not sufficient without counts and latency/resource values.

## Decision Gate

Make the judgement after Scenarios A-E using the following rules:

### Keep the current architecture

Choose this when the declared workload completes without lost work or duplicate commits,
durable jobs resume correctly, the review queue remains operable, the queue drains after the
load stops, and measured latency/resource use stays within the workload envelope. Record the
numbers and explicitly state why `content_plans`/`job_runs` and the current review surface
are sufficient.

### Improve the current architecture without M31

Choose this when the run exposes a bounded defect such as a pool limit, retry policy,
serialization bottleneck, or review UI problem that can be corrected within the existing
plan/job model. Record the failing scenario, reproduce it, and create a focused follow-up
instead of adding a task table speculatively.

### Schedule M31 investigation

Choose this only when the recorded failure is coordination-specific and cannot be addressed
by tuning or extending the existing mechanisms. Qualifying evidence must show a repeatable
need for decomposed dependent work, ownership, fan-out/fan-in, or partial-result handoff
that `job_runs` and specialized passes cannot represent or resume. Latency or throughput
pressure alone does not qualify.

If this gate selects M31, create a separate active M31 milestone from the measured failure.
Do not implement the task table, swarm, or review changes as part of M47.

## Acceptance Criteria

- [ ] A reproducible intake stress run covers Scenarios A-E.
- [ ] The run records the workload, environment, commands, raw counts, percentiles, and
  resource measurements.
- [ ] Recovery tests prove whether jobs resume from `partial_result` and whether retries are
  bounded and idempotent.
- [ ] Review tests measure the existing `needs_review` queue without adding a second queue.
- [ ] All synthetic fixtures are isolated and removed after the run.
- [ ] A written judgement selects current architecture, focused improvement, or M31
  investigation and cites the measured evidence.
- [ ] No task-graph schema or swarm implementation is started before the decision gate.

## Non-goals

- Do not build the task-graph agent swarm or add a second queue.
- Do not rebuild the staged compiler or replace its current compile/publish contract.
- Do not replace `content_plans` or `job_runs` unless the measurements demonstrate that the
  existing model cannot satisfy the required workflow.
- Do not treat the earlier dialogue snapshot benchmark as a substitute for intake testing.
- Do not use architecture speculation, an unbounded synthetic workload, or a single latency
  outlier as the basis for scheduling M31.

## Verification

Before and after the run, verify both containers are healthy with in-container
`wget` (the alpine image has no `curl`; see `AGENTS.md`):

```bash
podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health
# expected: {"success":true,...}
podman exec las-flores-server wget -qO- http://localhost:3000/health
# expected: {"success":true,"data":{"status":"healthy",...}}
```

Run the applicable automated checks:

```bash
npm run test --workspace=server
npm run build --workspace=server
```

If Jest shows the known corrupted-cache symptoms, bypass the cache entirely.
`--workspace` is an npm option, not a Jest option, so route it through npm and
run unit and smoke separately (`npm run test` also runs integration):

```bash
npm exec --workspace=server -- jest tests/unit tests/smoke --no-cache --forceExit
```

If the stress harness changes server code, also run the server lint/build and rebuild the
server container according to `AGENTS.md`.
