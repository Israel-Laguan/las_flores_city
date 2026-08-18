# M19 — Foundation: Module Boundaries + Content-Read Pool + Graph Analysis

> **Status:** Implemented · **Branch:** `milestone/19-foundation` · **PR size target:** ~25 files
> **Phase:** 0 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §3–4 (Option 1), §5 (A1), §11 (AGE vs Neo4j)

## Goal

Make the code reflect the data decoupling that already exists, isolate content reads off
the gameplay pool, and formally **complete the AGE-vs-Neo4j decision** so the graph
milestones (M27–M28) are de-risked. No behavior change to players.

## Scope (bulk is mechanical)

| Item | Detail | Status |
|---|---|---|
| **A1 — Content-read pool** | A dedicated read-only `contentPool` lives in `@las-flores/infra` (`infra/src/connection.ts`); `DialogueResolver` chunk/overlay reads and `location.ts` / `location.npcs.ts` browse JOINs route through `queryContent`, leaving player `oltpPool` writes untouched | ✅ Done |
| **Domains reorg** *(deferred to follow-up PR)* | Reorganize `server/src/` into `domains/{game,intake,ai}/` + `infra/`; add ESLint `no-restricted-imports` so `game/` cannot import `ai/` or `intake/` and `ai/` cannot import `game/` | ⏸ Deferred |
| **`@las-flores/infra` extraction** | `connection.ts`/`redis.ts` wiring extracted into the shared `@las-flores/infra` workspace package (prep for the M21 process split); importers updated to `@las-flores/infra` | ✅ Done |
| **Analysis: AGE vs Neo4j** | Decision record produced (see below); graph store locked for M27 | ✅ Done |

## Analysis stage — AGE vs Neo4j (completes the decision)

This milestone explicitly includes a decision step. The two candidates (per §11):

| | Apache AGE | Neo4j |
|---|---|---|
| **Ops cost** | Zero new containers (runs inside existing Postgres) | New container/service + separate graph store |
| **Visual editing** | None by default (Cypher only) | Bloom / Neodash drag-to-connect — key admin UX win |
| **Ecosystem** | Smaller; younger | Mature drivers, tooling, LangChain/GraphQA integration |
| **Fit for authoring IR** | Workable, but no native graph viz | Best-in-class for the authoring canvas |

**Decision: Neo4j.** Rationale: the whole point of a graph canvas is *visual relationship
authoring* (`"What links to character X?"`, drag to connect, impact traversal). Bloom's
graphical editing is the differentiator for the admin experience that `plan_json` can't
provide, outweighing the operational cost of one extra container. Apache AGE is retained
only as a fallback if a future constraint rules out another container. This is recorded so
M27 does not re-litigate it.

## Implementation decision record

- **A1 (content-read pool) — implemented as an intentional, now-contract-approved change.** `AGENTS.md`'s hard constraint originally forbade new pools and mandated using only `oltpPool`/`withOLTPTransaction`/`queryOLAP`; `ARCHITECTURE_SEPARATION_ANALYSIS.md` §5 previously recommended A2/A4 over A1. The constraint has been **reconciled** (see `AGENTS.md` and `ARCHITECTURE_SEPARATION_ANALYSIS.md` §5): a single **read-only** content pool (`contentPool` / `queryContent`, defined in `@las-flores/infra`) is now sanctioned for content reads, enforced read-only at the Postgres session level (`default_transaction_read_only=on`), while all player reads AND writes stay on `oltpPool`/`withOLTPTransaction`. M19 implemented A1 accordingly.
- **AGE vs Neo4j — resolved → Neo4j** (recorded in `ARCHITECTURE_SEPARATION_ANALYSIS.md` §11).
- **Phasing:** the pool + infra extraction + decision record ship as the foundation PR; the
  `domains/{game,intake,ai}/` move is a separate, purely mechanical follow-up so test
  imports are not rewritten twice.

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| DB | `infra/src/connection.ts` (`contentPool` + `queryContent`, read-only session) |
| Game read path | `server/src/services/DialogueResolver.ts`, `server/src/routes/location.ts`, `server/src/routes/location.npcs.ts` |
| Infra pkg | existing `@las-flores/infra` workspace: `connection.ts`, `redis.ts`, `index.ts` + `package.json` |
| Lint | `.eslintrc.json` (`no-restricted-imports`) |
| Decision | `docs/milestones/M19-foundation.md` analysis section; `ARCHITECTURE_SEPARATION_ANALYSIS.md` §11 mark AGE vs Neo4j resolved |
| Tests | `server/tests/unit/contentPool.unit.test.ts` (pool seam + single-pool creation + read-only delegation); `DialogueResolver.property.test.ts` (resolver reads route through `queryContent`) |

## Risks & verification

- **Risk:** Low (refactor + additive pool). Main trap is accidentally wiring a player
  write through the content pool.
- **Verify:** `npm run lint --workspace=server`, `npm run build --workspace=server`,
  `npm run test --workspace=server`, then rebuild + in-container health
  (`docker exec las-flores-server wget -qO- http://localhost:3000/health`).
- **Accept:** content reads hit the new pool; game pool peak stays flat; players see no
  change.

## Definition of Done

- [x] `contentPool` added; `DialogueResolver`/`location.ts`/`location.npcs.ts` reads use it; player writes untouched
- [x] `@las-flores/infra` extracted and consumed by the server
- [x] AGE-vs-Neo4j decision locked (Neo4j) and recorded in §11
- [x] `AGENTS.md` pool constraint reconciled with the read-only content pool
- [x] `contentPool.unit.test.ts` + `DialogueResolver.property.test.ts` pass; server test suite + health check pass

> Deferred to the follow-up PR (not part of M19 DoD): `domains/{game,intake,ai}/` structure and the ESLint `no-restricted-imports` boundary enforcement.