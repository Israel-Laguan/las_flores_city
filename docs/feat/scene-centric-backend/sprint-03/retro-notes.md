# Sprint-03 retro notes

Skeleton for the sprint-03 retro (SC-320). Per the roadmap's retro contract, **Sprint 4 is
chosen at the retro.** The holding list below is a set of candidates, not a commitment.

## 1. What was cut

- **SC-315** one-way importer (`content/` → `planning.*`). Deferred. The importer is the
  deepest `server/` integration in the group and `server/` is slated for deletion; re-home it
  under the `db` package work ([DB-PACKAGE-and-api-migration](../../../issues/DB-PACKAGE-and-api-migration.md)).
- **SC-318 m-86** clean-checkout CI dry run. Not run. Its `git clean -xfd` also removes ignored
  files such as `.env`, so it needs an explicit go-ahead.
- **SC-314 `upsertMany`** batching and round-trip assertion. Out of scope (SC-406 owns it).

## 2. What each spike changed

| Spike | Answer | Effect on the plan |
|---|---|---|
| SC-S5 weather source | District default plus scene override | A6 resolved; SC-305 resolves `scene.weather` over `district.weather` |
| SC-S6 serving baseline | Baseline measured | BF-305 made the harness runnable; live run not re-verified this sprint |
| SC-S8 knowledge ledger | Explicit secrets; cheap-model inference not viable (69% precision / 61% recall) | Knowledge checks stay explicit; SC-1002 keeps per-node facts out |
| SC-S9 inventory ledger | Per-character, `acquired` / `retired` live; `consumed` / `lost` reserved | SC-1004 is smaller than estimated; no location edges |
| SC-S10 time vs. prose | Scene `time` is a tag only; cost stays on the transition. LLM half is hint-only (75% / 50%) | SC-1007 is hint-only; SC-1006 (deterministic) ships first |
| SC-S12 scene vs. location | `SceneDef` name; `location` is a UUID ref to the legacy row | Naming in code: `SceneDef`, not `Scene` |
| SC-S13 flag-gated overlays | Hybrid: fold constants, flag-gated overlays as layers | SC-303b / SC-312 implement it; equal-priority conflict fails compile (A3) |

## 3. Estimate vs. actual per group

Not recorded. No timing data was captured during sprint-03, so this section stays empty
until the next sprint captures it. (The backlog defers estimates until sprint-1 calibration.)

## 4. SC-M2 exit criteria: what is still open

Sprint-03 met its own definition of done. The milestone is wider:

- **Two scenes at one location compile to artifacts and resolve differently as a flag flips.**
  Resolution was proven in SC-319. **Update (Sprint 4, T1):** artifact compile is now built and
  proven on Postgres (`scene-compile.e2e.test.ts`). Met.
- **Equal-priority conflict fails the compile.** Met (SC-304, SC-319).
- **The revision pointer flips atomically and rolls back.** Not built in Sprint 3. **Update (Sprint 4, T2):** built and proven on Postgres, including a concurrent compare-and-swap race and a fault injected mid-publish (`scene-publish.e2e.test.ts`, `revisionRepository.pg.test.ts`). Met.
- **A personality pool shared by two characters resolves correctly.** Not built in Sprint 3. **Update (Sprint 4, T3):** met at planning level; runtime serving is SC-M3's first task (pools are not compiled into artifacts yet). Proven on Postgres in `personality-pools.e2e.test.ts`.

## 5. Holding list (Sprint 4 candidates, not committed)

- Pool artifacts and runtime serving of personality pools: the first SC-M3 task, since the pool
  criterion is met at planning level only (SC-402 / SC-404 / SC-306 themselves are done; see §4).
- SC-315: importer, once re-homed under the `db` package.
- SC-318 m-86: clean-checkout dry run, after an explicit go-ahead for `git clean`.
- Overlay FK parity: the in-memory overlay double does not model the base-scene foreign key.
  The Postgres suite covers it; a future change to FK behaviour needs both sides updated.
- A1 (file- vs. DB-canonical content) and A7 (`asset_fallback` consumer), both still open.
- SC-S7 / SC-S11: commit the remaining spike harnesses, or inline their repro commands.

## 6. Retro questions

- Did the "construction ahead of bookkeeping" gap recur? Which docs drifted, and why?
- Should story rows get acceptance criteria before they move to Blocked → Ready?
- Was the sprint-03 plan's fixture-directory convention reconciled early enough?
