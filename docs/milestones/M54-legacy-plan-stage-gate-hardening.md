# M54 — Legacy Plan Pipeline: Stage Gate & Provenance Hardening

> **Status:** Proposed
> **Owner:** narrative systems / platform
> **Predecessor:** none (independent of M50/M50c/M51-53 — different pipeline)

## Goal

A 2026-09-03 investigation, triggered by a developer recalling "we got a scene
but not the plan, and the scene was written before approve", traced an
untracked orphan file — `content/scenes/gang_warehouse_front/scene_gang_warehouse_front.yaml`
(confirmed never committed to git, referenced nowhere else in the repo) — to a
real, currently-live gate gap in the **legacy `ContentPlanService` pipeline**
(`POST /admin/story-builder/plan*`, `content_plans` status machine). This is
**not** the `GraphIntakeService`/`plan:intake` pipeline M50/M50c/M51-53 target
— that pipeline never writes files and is unaffected.

This milestone closes the specific gap found and hardens the surrounding
provenance so a future occurrence is at minimum traceable and cleanable,
rather than permanent untraceable debris.

## Background (what the investigation found)

- **`POST /plans/:id/stage` — the endpoint that writes real YAML into
  `content/` — accepts a plan in status `proposed` *or* `approved`**
  (`server/src/routes/admin-story-builder-actions.ts:59`,
  `allowedStatuses = ['proposed', 'approved']`, enforced by
  `loadPlanForStaging` in `admin-story-builder-staging.ts:27-37`).
  `proposed` is the status stamped automatically the instant any plan is
  created — no review of any kind. **Files get written to disk before
  anyone approves anything.**
- **There is no dedicated "approve" endpoint.** The admin UI's Approve
  button is `PUT /plans/:id { plan, status: 'approved' }`
  (`useStoryBuilderApi.ts:240-248`) — the exact same unguarded endpoint a
  script can hit with `status: 'verified'` or any other enum value.
  `admin-story-builder-plans.ts:168-233` performs zero transition
  validation: any admin-authenticated caller can set `status` to *any*
  value in the enum at *any* time, with no check on the plan's current
  status.
- **Written content carries zero provenance until `migrate`, the step
  *after* stage.** `StoryBuilderFileWriter.ts:20-67`'s `atomicWriteYaml`
  writes the file at stage time with no `plan_id`/`generated_at` stamped
  in it. The only durable plan→content link (`patches`, `canon_revisions`)
  is populated by `migrateStagedPlan` (`StoryBuilderMigration.ts:81-115`),
  one step later. A plan staged but never migrated — because it errored,
  or because its row was deleted first — leaves a file with **no trace of
  which plan produced it.**
- **`DELETE /plans/:id` never touches the filesystem**
  (`admin-story-builder-plans.ts:236-268`): it removes the `content_plans`
  row and best-effort Neo4j deltas only. A plan that reached `staged` and
  is then deleted leaves its written files behind permanently.
- **`server/scripts/latency_probe.ts`** is itself now dead code — it calls
  `POST /admin/story-builder/plan` (singular) and `/generation-status`,
  both retired on 2026-08-18 (commit `0b89f340`, "retire legacy story
  builder intake and async fill pipelines"). Running it today 404s at
  step 2. The orphan file is old residue from before that retirement, not
  something the script can reproduce as currently written — but the
  underlying gate hole (`/stage` accepting `proposed`) is still live and
  reachable today from the admin UI itself or any direct caller of
  `/stage`.

## Non-goals

- **No rewrite of the status field into a real state-machine framework.**
  Scope this to explicit, narrow transition guards on the handful of
  routes that matter (`/stage`, `/migrate`, `PUT /plans/:id`), not a
  general workflow-engine introduction.
- **No changes to `GraphIntakeService`/`plan:intake`.** That pipeline
  already never writes files before `proposed`; it is out of scope because
  it isn't broken.
- **No retroactive recovery of past orphans** beyond the one already found
  and removed. This milestone prevents new ones and makes future ones
  traceable/cleanable — it does not attempt a forensic sweep of `content/`
  for other undiscovered debris.

## Scope

Targets the legacy plan routes (`admin-story-builder-plans.ts`,
`admin-story-builder-actions.ts`, `admin-story-builder-staging.ts`),
`StoryBuilderFileWriter.ts`, and `latency_probe.ts`.

### In scope

1. **Narrow the staging gate.** Change `allowedStatuses` in
   `admin-story-builder-actions.ts` from `['proposed', 'approved']` to
   `['approved']`. A plan must be explicitly approved before any file is
   written, full stop.
2. **Add transition validation to `PUT /plans/:id`.** At minimum: reject a
   status write that isn't a valid forward transition from the plan's
   *current* DB status (e.g. `proposed → approved` is valid;
   `proposed → verified` or `approved → proposed` is not). Use an explicit
   allow-list table, not a general state machine.
3. **Stamp provenance at stage time, not just migrate time.** Add
   `plan_id` (and `generated_at`) to the YAML `atomicWriteYaml` writes in
   `StoryBuilderFileWriter.ts`, so any file on disk — staged or migrated —
   can be traced back to the plan that produced it.
4. **Sweep staged-but-unmigrated files on plan deletion.** When
   `DELETE /plans/:id` runs against a plan whose status is `staged` (files
   written, never migrated), use the provenance stamp from #3 to find and
   remove those files (or at minimum log them for manual review) instead
   of silently abandoning them.
5. **Retire or fix `latency_probe.ts`.** It currently targets deleted
   routes and would fail at step 2 if run. Either delete it, or update it
   to exercise the current API surface (`plan:intake`/`GraphIntakeService`
   or the current legacy create+stage+migrate routes) so it isn't
   misleading dead code implying a pipeline shape that no longer exists.

### Out of scope

- `dist/` build-artifact hygiene (stale mixed old/new compiled routes
  found alongside this investigation) — worth a `rm -rf server/dist &&
  npm run build` pass, but unrelated to the gate fix; do separately.
- Any UI change beyond what's needed to keep the existing Approve button
  working under the new transition validation.
- Neo4j-authored (`GraphIntakeService`) plans — already excluded from this
  route's write path (`admin-story-builder-plans.ts:180-193`).

## Acceptance criteria

1. `POST /plans/:id/stage` rejects a `proposed` plan (only `approved`
   plans can be staged); existing tests/fixtures updated accordingly.
2. `PUT /plans/:id` rejects a status transition that isn't a valid
   forward step from the plan's current status.
3. Every file written by `atomicWriteYaml` carries a `plan_id` (and
   `generated_at`) field.
4. Deleting a `staged` plan removes (or at minimum reports) the files it
   wrote, using that provenance stamp.
5. `latency_probe.ts` either no longer exists or runs successfully against
   the current API surface end to end.
6. No regression to the legitimate approve → stage → migrate → verify
   flow driven from the admin UI.

## Verification checklist

- [ ] Unit/integration tests for the narrowed staging gate (reject
      `proposed`, accept `approved`)
- [ ] Unit/integration tests for `PUT /plans/:id` transition validation
      (valid and invalid transitions)
- [ ] Unit test asserting `plan_id`/`generated_at` are present in written
      YAML
- [ ] Integration test: delete a `staged` plan, assert its files are
      removed (or reported)
- [ ] `npm run typecheck --workspace=server`
- [ ] `npm run lint --workspace=server`
- [ ] Manual admin-UI smoke: create → approve → stage → migrate → verify
      still works end to end
- [ ] Ops docs updated (`docs/STORY_BUILDER_OPERATIONS.md`) with the
      corrected status-transition table

## Estimated file changes

10–15 files: the three route/service files touched, `StoryBuilderFileWriter.ts`,
`latency_probe.ts` (deleted or rewritten), new/updated tests, and the ops
doc update.
