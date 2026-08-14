# M25 — Entity Identity Resolution + Bounded Conflict Detection

> **Status:** Implemented · **Branch:** `milestone/25-entity-identity` · **PR size target:** ~25 files
> **Phase:** 5 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §15.3, §15.6

## Goal

Split entity identity from entity existence (stable `entity_id` vs aliases), route
resolution through a dedicated pass that surfaces alternatives instead of silent LLM
best-guess, and scope conflict detection to the patch neighborhood.

## Scope

| Item | Detail |
|---|---|
| **`entity_id` vs aliases** | shared schemas; stable ID separate from names/aliases |
| **`IdentityResolver`** | returns `matched: {id}` | `new_candidate`; surfaces alternatives (`["a193 Marcus", "new: Marcus II"]`) — never silently decides identity |
| **Bounded conflict detection** | targeted per-entity-type, neighborhood-scoped checks (timeline, location, lineage) with a recorded **"checked scope"** per job |
| **Admin UI** | resolution alternatives picker + conflict/scope display |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| Shared schemas | entity identity + alias + scope types |
| New service | `server/src/services/IdentityResolver.ts`, `ConflictDetector.ts` |
| Authoring | `ContentPlanService.ts`, `StoryBuilderOrchestrator.ts`, `PlanVerificationService.ts` |
| Admin UI | resolution/conflict pickers (+ tests) |
| Tests | unit for resolver match/new/ambig; integration for bounded checks |

## Risks & verification

- **Risk:** Medium. Ambiguous resolution handled to a human picker; checked-scope must be
  recorded honestly so "how much did we check?" is answerable.
- **Verify:** import a dynasty; confirm each name resolves or is surfaced as a candidate;
  confirm conflict checks run in the neighborhood scope and record the scope.
- **Accept:** no silent identity merge; conflicts reported are bounded and traceable.

## Definition of Done

- [x] `entity_id`/alias model; `IdentityResolver` surfaces alternatives
- [x] Bounded, neighborhood-scoped conflict detection with recorded checked-scope
- [x] Admin surfaces resolution + scope info
- [x] Tests cover match/new/ambiguous resolution and bounded checks