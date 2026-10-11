# Group F — Integration, fixtures & close-out (6 tasks)

Merged from the former Groups F (server integration & fixtures) and G (verification &
close-out): F was descoped, so the remaining work is one small group. First the minimal
`server/` integration and fixtures, then the gates that make "Done" mean the same thing it
means in the code. Nothing is flipped to Done in `backlog.md` until its evidence from these
tasks exists.

Shared home for server code: `server/src/planning/` (created by BF-303). `api/planning` is
DB-free by an ESLint-enforced boundary, so persistence is **injected**. Hard constraint
(AGENTS.md): `oltpPool` / `withOLTPTransaction`, schema-qualified `planning.*`, **no new
pools**. The `planning`/`runtime` roles are exercised by permission tests, not app code.

---

> **Close-out notes (sprint-03, as built).** Where the code departed from this plan:
> - **SC-314** also adds `PgSceneOverlayRepository`, because `planning.scene_overlays` had no
>   repository and the overlay contract now exists. Both adapters import `api/` at runtime, not
>   only `oltpPool`: the content hash and normalisation must match the in-memory adapters byte for byte.
> - **SC-316** fixtures stay under `scene-composition/`. The rain-and-cast fixture keeps
>   `district_weather: overcast` (the seeded `city` district), not a `clear` district: `downtown`
>   is not in content, and changing the value would rewrite the golden expectations. The rain
>   override still changes the weather relative to the district value.
> - **SC-317** m-82: 098 was already covered by `districts-weather.test.ts`; 097 is new. m-83
>   (FK + never-delete) lives in `sceneOverlayRepository.pg.test.ts`, next to the overlay adapter.
> - **SC-318** m-86 (clean-checkout dry run) is **not run**. Its `git clean -xfd` also removes
>   ignored files such as `.env`, so it needs an explicit go-ahead.
> - **SC-315** stays deferred, which is why m-73 is unused: the m-numbers have a gap.
> - **SC-M2 exit criteria** are broader than this sprint. Artifact compile (SC-402), the revision
>   pointer (SC-404) and the shared personality pool (SC-306) are not built.
>
> **Scope trimmed (2026-10-07).** `server/` is slated for deprecation and deletion (see
> [docs/issues/DB-PACKAGE-and-api-migration.md](../../../issues/DB-PACKAGE-and-api-migration.md)),
> so Group F adds the **minimum** `server/` code needed to prove the `api/planning` contracts
> against real Postgres. No route wiring, no importer, no boot hooks. Anything deeper moves to
> the `db` package work after this sprint.

## SC-314 · `PgSceneDefRepository` (minimal) · S · P1 · needs SC-311, BF-303

- Implements `SceneDefRepository` for scenes **and** overlays via `oltpPool`; `upsertIfChanged` is a single `INSERT … ON CONFLICT (slug) DO UPDATE … WHERE planning.scene_defs.content_hash IS DISTINCT FROM EXCLUDED.content_hash` — an unchanged payload is a skip, not a rewrite.
- Passes the shared `sceneRepositoryContract` suite from SC-311. **That is the acceptance bar.**
- Self-contained in `server/src/planning/` (only `oltpPool` / `withOLTPTransaction` imports) so it relocates cleanly into the `db` package later. Add a header comment saying so.
- **Out of scope:** `upsertMany` batching / round-trip-count assertion (SC-406 owns that), a factory, any route registration.

- m-72 Adapter + `INSERT … ON CONFLICT` upsert.
- m-74 Run the shared contract suite against Pg (dedicated UUID/slug prefix, `afterAll` cleanup).

---

## SC-315 · Importer: `content/` → `planning.*` · **Deferred** (was M · P1)

Not built this sprint. The importer is the deepest `server/` integration in the group
(file→DB for 95 locations + 7 seed scene defs per SC-S12, CLI, idempotency report, integration
test) and would be thrown away or rewritten when `server/` is removed.

- Fixtures (SC-316) are hand-authored and feed `composeScene` directly, so nothing in this
  sprint needs imported data.
- Re-home it under the `db` package / `api` migration work (see the issue above), with the
  SC-S12 contract (locations → `planning.locations`, `<folder>__ambient` seed defs) as its input.
- Backlog row stays open, status **Deferred**; SC-317 and SC-319 must not depend on it.

---

## SC-316 · Authored fixtures + end-to-end sample · M · P1 · needs SC-303b, SC-312

Three hand-authored fixtures (data, no code) used by tests, the demo (G3) and docs:

1. **Rain overlay** gated by a flag, over a base scene in a clear district (weather override, `set_weather`). Valid tags: clear, overcast, rain, storm, fog, smog, dust; seeded districts: city=overcast, old-town=fog, industrial=smog, rest `clear` — pick a `clear` one (e.g. `downtown`) for this fixture.
2. **Cast overlay** adding a role slot + `cast_slot` (a different character in the same scene).
3. **Conflict fixture** — two equal-priority overlays setting weather (must fail with `SCENE_EXCLUSIVE_CONFLICT`), plus a *near-miss* where their conditions are mutually exclusive (must pass).

Plus a one-page authoring guide in `docs/` showing the YAML for each op (so SC-601's later
scene-shaped intake has something to target).

- m-78 Fixtures under `api/planning/test-fixtures/scene-composition/` (the directory the SC-313 golden tests read).
- m-79 Table test running all three through `composeScene`.
- m-80 Authoring guide page + link from the README.

---

## SC-317 · Integration tests + permission extension · M · P1 · needs SC-311, SC-314, BF-303

- Extend `server/tests/integration/runtime-planning-permissions.test.ts` (the SC-106 pattern): the `runtime` role can read/write **none** of `planning.scene_defs`, `planning.scene_overlays`, `planning.flag_definitions`; the `planning` role can.
- Migration tests: 097/098/101 apply cleanly on a fresh DB and are skipped on re-run (idempotent), per the AGENTS migration rules; schema DDL wrapped in `withSchemaLock`.
- FK test: inserting an overlay for a missing `base_scene_slug` fails; retiring a scene never deletes the row.
- Follow the AGENTS isolation rules: dedicated UUID/slug prefix, `afterAll` cleanup, collision-avoidance comment.
- Do **not** conclude a harness bug from a subset run — confirm against `cd server && npx --no-install jest tests/unit tests/smoke --no-cache --forceExit` first (AGENTS stale-cache gotcha).

- m-81 Add the three table assertions to the permissions test.
- m-82 Migration idempotency test for 097, 098 and 101 (101 already has one: `planning-scene-defs.test.ts`).
- m-83 FK + never-delete test.

---

## SC-318 · Boundary, CI and parity gates · M · P1 · needs BF-302

- Add `api/planning/src/scene/**` and the new contracts folders to `server/tests/unit/api-boundary-enforcement.test.ts` fixtures (contracts is still a leaf; planning/runtime still cannot import each other).
- **Parity tests** (a recurring drift source in this repo): SQL slug trigger in 096 vs. `validateFlagSlug`; weather CHECK in 098 vs. `WeatherTag` (**already covered** by `districts-weather.test.ts` from SC-309b — extend its failure message to name both sides, don't duplicate); position enum vs. `shared` (D2). Each fails with a message naming both sides.
- CI chain 1: build order is `shared → infra → api/contracts → (typecheck/lint/test all api workspaces) → server`. Confirm `api/planning` resolves `@las-flores/api-contracts` from `dist` in a clean checkout (the CI only builds contracts today).

- m-84 Extend the boundary fixtures.
- m-85 Three parity tests.
- m-86 Clean-checkout CI dry run (`git clean -xfd api/*/dist` then the CI steps locally).

---

## SC-319 · Sprint-exit demo · S · P0 · needs SC-312, SC-304, SC-316

A single runnable script/test (`server/tests/integration/scene-composition.e2e.test.ts` or an
`api/planning` test if it needs no DB) that is the *evidence* for the sprint DoD:

1. Base scene + flag-gated rain overlay: flag **off** → district weather; flag **on** → `rain` with provenance `overlay:<slug>`.
2. Two equal-priority overlays → compile report contains `SCENE_EXCLUSIVE_CONFLICT`.
3. Unchanged scene re-upserted via `PgSceneDefRepository.upsertIfChanged` → `unchanged` (the contract's status name), row `updated_at` untouched (no importer this sprint — SC-315 is deferred).
4. `retire` on a flag/scene keeps the row.

Output is a short markdown transcript saved into `sprint-03/EVIDENCE.md`.

- m-87 Write the demo test.
- m-88 Save the transcript into `EVIDENCE.md`.

---

## SC-320 · Docs/backlog sync + retro prep · S · P0 · last

- Flip backlog states to what the evidence supports: SC-202 → Done (after BF-303), SC-301/302/303/304/305 → Done (SC-309 already Done, merged), SC-S8/9/10/11/12/13 answered.
- Fold spike answers into the docs they change (`proposal.md` §2.2 if SC-S13 changed "resolved at compile"; `architecture.md` artifact/revision section; `features.md` prerequisites).
- Add a `retro-notes.md` skeleton: what was cut, what each spike changed, estimate-vs-actual per group, and a **holding list** for Sprint 4 candidates. Per the roadmap's retro contract, Sprint 4 is chosen at that retro — nothing is pre-committed here.
- Re-point `CLOSEOUT_TASKS.md` and `sprint-03.md` to this folder.

- m-89 Backlog + README state flips (evidence-linked).
- m-90 Fold spike answers into proposal/architecture/features.
- m-91 `retro-notes.md` skeleton; update `sprint-03.md` status.
