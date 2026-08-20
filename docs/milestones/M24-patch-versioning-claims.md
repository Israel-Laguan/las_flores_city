# M24 — Patch-Level Versioning + Claims/Evidence Store

> **Status:** Implemented · **Branch:** `milestone/24-patch-versioning-claims` · **PR size target:** ~25 files
> **Phase:** 5 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §15.2, §15.4
>
> **Proof:** lint/build clean; `tests/unit/claimsService.unit.test.ts` + `tests/unit/revisionService.unit.test.ts` pass; `tests/integration/claims-lifecycle.test.ts` + `tests/integration/revision-rollback.test.ts` pass (5 tests). Admin audit UI at `admin/src/app/(admin)/audit/page.tsx` references `claim`/`revision`.

## Goal

Make **rollback a lookup, not an inverse-reasoning task** (patch-level versioning), and
persist the deliberation (claims/evidence store) so uncertain AI output is tracked without
corrupting canon.

## Scope

| Item | Detail |
|---|---|
| **`canon_revisions` + `patches`** | patch as the unit of versioning; rejected proposal = `patch → rejected → no-op`; store `canon_revision` + `applied_patch_id` on every change |
| **`claims` / `evidence` store** | append-only; each claim carries `source_span`, `confidence`, `status (proposed/accepted/rejected/merged)`, `conflict_reason` |
| **Extend audit trail** | tie into `feedback_log` + `admin_events` |
| **Admin audit UI** | view revision/patch history and claim provenance |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| Migrations | `canon_revisions`, `patches`, `claims`, `evidence` |
| New service | `server/src/services/ClaimsService.ts`, `RevisionService.ts` |
| Authoring | `server/src/services/ContentPlanService.ts`, `StoryBuilderOrchestrator.ts` |
| Shared schemas | claim/evidence/revision schemas |
| Admin UI | audit/history views (+ tests) |
| Tests | unit for patch-apply/reject/rollback; integration for claim lifecycle |

## Risks & verification

- **Risk:** Medium. Backfilling `canon_revision` on existing content; concurrency of
  concurrent patches.
- **Verify:** apply a patch, reject it, confirm rollback restores prior canon via lookup
  (no inverse reasoning); create a proposal → accept → verify claim status transitions.
- **Accept:** any rejected AI proposal is a no-op rollback; every canon change traces to a
  patch + claim.

## Definition of Done

- [x] Patch-level versioning with rollback-by-lookup
- [x] Claims/evidence store with full provenance fields
- [x] Audit UI surfaces revision + claim history
- [x] Tests cover patch lifecycle and rollback

## Implementation evidence

- **Migrations:** `server/src/database/migrations/064_patch_versioning.sql`, `066_claims.sql`
  (plus `070_critique_annotations.sql` for the adjoining annotation store).
- **Services:** `server/src/services/ClaimsService.ts`, `RevisionService.ts`.
- **Tests:** `tests/unit/claimsService.unit.test.ts`, `tests/unit/revisionService.unit.test.ts`,
  `tests/integration/claims-lifecycle.test.ts`, `tests/integration/revision-rollback.test.ts`.
- **Admin audit UI:** `admin/src/app/(admin)/audit/page.tsx` (surfaces `claim`/`revision` history).