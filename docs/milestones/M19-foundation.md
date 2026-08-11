# M19 — Foundation: Module Boundaries + Content-Read Pool + Graph Analysis

> **Status:** Planned · **Branch:** `milestone/19-foundation` · **PR size target:** ~25 files
> **Phase:** 0 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §3–4 (Option 1), §5 (A1), §11 (AGE vs Neo4j)

## Goal

Make the code reflect the data decoupling that already exists, isolate content reads off
the gameplay pool, and formally **complete the AGE-vs-Neo4j decision** so the graph
milestones (M27–M28) are de-risked. No behavior change to players.

## Scope (bulk is mechanical)

| Item | Detail |
|---|---|
| **A1 — Content-read pool** | Add a dedicated `contentPool` (or `readPool`) in `connection.ts`; route `DialogueResolver` chunk/overlay reads and `location.ts` browse JOINs through it, leaving player `oltpPool` writes untouched |
| **Domains reorg** | Reorganize `server/src/` into `domains/{game,intake,ai}/` + `infra/`; add ESLint `no-restricted-imports` so `game/` cannot import `ai/` or `intake/` and `ai/` cannot import `game/` |
| **`@las-flores/infra` extraction** | Pull `connection.ts`/`redis.ts` wiring into a shared workspace package (prep for the M21 process split); update importers |
| **Analysis: AGE vs Neo4j** | Produce a short decision record (see below) and lock the graph store for M27 |

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

- **A1 (content-read pool) — implemented as an intentional milestone override.** The
  current `AGENTS.md` hard constraint says "Do not introduce new pools" and mandates using
  only `oltpPool`/`withOLTPTransaction`/`queryOLAP`. `ARCHITECTURE_SEPARATION_ANALYSIS.md`
  §5/§10 also warn against A1 unless the pool contract is updated first. M19 explicitly
  plans a dedicated `contentPool`, and on review the decision was made to implement A1
  **without** editing `AGENTS.md` (the milestone overrides the constraint). To keep this
  visible: the override is documented here and in a comment on `getContentPool()`. The pool
  is **read-only by construction** — `DialogueResolver`/`location.ts`/`location.npcs.ts`
  content reads route through `queryContent()`/`contentPool`; every player read AND write
  still goes through `oltpPool`/`withOLTPTransaction`. A follow-up should reconcile
  `AGENTS.md` wording to codify "one write pool + one read-only content pool" once the
  process-split milestone (M21) lands.
- **AGE vs Neo4j — resolved → Neo4j** (recorded in `ARCHITECTURE_SEPARATION_ANALYSIS.md` §11).
- **Phasing:** the pool + infra extraction + decision record ship as the foundation PR; the
  `domains/{game,intake,ai}/` move is a separate, purely mechanical follow-up so test
  imports are not rewritten twice.

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| DB | `server/src/database/connection.ts` (add `contentPool`) |
| Game read path | `server/src/services/DialogueResolver.ts`, `server/src/routes/location.ts` |
| Reorg | ~40 service/route files moved into `domains/{game,intake,ai}/` + `infra/` (mechanical) |
| Infra pkg | new `infra/` workspace: `connection.ts`, `redis.ts` + `package.json` |
| Lint | `.eslintrc.json` (`no-restricted-imports`) |
| Decision | `docs/milestones/M19-foundation.md` analysis section; `ARCHITECTURE_SEPARATION_ANALYSIS.md` §11 mark AGE vs Neo4j resolved |
| Tests | unit/smoke for pool helper; integration test asserting content reads use `contentPool` |

## Risks & verification

- **Risk:** Low (refactor + additive pool). Main trap is accidentally wiring a player
  write through the content pool.
- **Verify:** `npm run lint --workspace=server`, `npm run build --workspace=server`,
  `npm run test --workspace=server`, then rebuild + in-container health
  (`docker exec las-flores-server wget -qO- http://localhost:3000/health`).
- **Accept:** content reads hit the new pool; game pool peak stays flat; players see no
  change.

## Definition of Done

- [ ] `domains/{game,intake,ai}/` + `infra/` structure exists and lint enforces boundaries
- [ ] `contentPool` added; `DialogueResolver`/`location.ts` reads use it; player writes untouched
- [ ] `@las-flores/infra` extracted and consumed by the server
- [ ] AGE-vs-Neo4j decision locked (Neo4j) and recorded in §11
- [ ] Full server test suite + health check pass