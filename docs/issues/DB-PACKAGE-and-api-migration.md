# New `db` package + migrate `server/` APIs to the `api/` package

> **Status:** Proposed (not started) — scheduled **after** the currently planned
> scene-centric work (sprint-03 and whatever is already committed to).
> **Owner:** platform
> **Origin:** discussion while reviewing `sprint-03/group-f-server-integration.md`
> (2026-10-07): Group F adds new Postgres code to `server/` even though `server/`
> is intended to be deprecated and later deleted.

## Problem

`server/` is the planned deprecation target, but today it owns everything
persistence-shaped:

- the pools (`oltpPool`, `queryOLAP`, `contentPool`) and `withOLTPTransaction`
- the migration runner (`server/src/database/migrate.ts`, `migrations/`,
  `migration-targets.json`) and content migration
- the repositories

`api/planning` is DB-free by an ESLint-enforced boundary, so any new persistence for it
(e.g. SC-314 `PgSceneDefRepository`, SC-315 importer) has to be written into `server/`.
That means new, long-lived code lands in the module we intend to delete, and the
deprecation gets harder with every sprint.

## Proposal

Create a dedicated **`db` package** (working name `@las-flores/db`) that is the single
owner of database concerns:

1. **Migrations** — runner, SQL files, `migration-targets.json` registry, idempotency
   log. Moves out of `server/src/database/`.
2. **OLTP / OLAP provisioning** — creates and evolves both databases (and the
   `planning` / `runtime` schemas and roles) from one place.
3. **Pool + transaction primitives** — the sanctioned `oltpPool` /
   `withOLTPTransaction` / `queryOLAP` / content-pool surface, exported for
   `api/*` and (until removal) `server/` to consume.
4. **Persistence adapters** for `api/*` interfaces (e.g. `PgSceneDefRepository`) so the
   `api/planning` DB-free boundary is kept while adapters stop living in `server/`.

## Work items

### A. Audit the current DB architecture first
Use the move as the excuse to double-check the design before freezing it into a package:

- Is one-file-one-database (`oltp` / `olap` / `nontransactional` arrays) still the right
  registry shape?
- OLTP schemas vs `planning` / `runtime` schemas: ownership, grants, role model
  (production still runs as the privileged `las_flores` role — the "debt, no
  `runtimePool`" decision in `architecture.md` §3 should be revisited here).
- OLAP `player_events` and leaderboard queries: which belong in `db` vs the consumer.
- Content tables / `contentPool` (read-only) and the M32 CDN `content_url` model.

### B. Create the package and move migrations
- New workspace with its own tsconfig project; migration runner + SQL moved with
  history preserved.
- Intake-worker remains the migration owner at runtime (calls into `db`), per the
  existing "only intake-worker migrates" rule — or that rule is explicitly changed.
- Keep idempotency guarantees (`schema_migrations` keyed on `(version, database_name)`,
  advisory-lock behaviour, test `withSchemaLock`).

### C. Decide the `AGENTS.md` "no new pools" rule
`db` will own pool creation. Amend the rule so the sanctioned pools are defined in
`@las-flores/db` (previously `@las-flores/infra`) rather than adding a second
mechanism. Must be a deliberate edit, not drift.

### D. Inventory which `server/` APIs to move to `api/`
- List every `server/` route/service and classify: **migrate to `api/*`**,
  **keep until `server/` removal**, **drop**.
- For each "migrate" item, name the target (`planning` / `runtime` / `contracts`) and
  the persistence it needs from `db`.
- Output: an ordered migration plan, then the `server/` deprecation and deletion plan.

## Interaction with current sprint-03 work (Group F)

Group F is **not** blocked by this issue and should keep going, but its `server/` code
should be written to be cheap to move:

- Keep `PgSceneDefRepository` and the importer self-contained under
  `server/src/planning/` and `server/src/content/` with no coupling to other `server/`
  internals beyond `oltpPool` / `withOLTPTransaction`.
- Do not add new migrations that depend on `server/`-only helpers.
- Note in SC-314 / SC-315 that these files are expected to relocate into `db`.

## Open questions

- Package name and location (`db/` at repo root vs `api/db`)?
- Does `infra` get absorbed into `db`, or stay for non-DB concerns (MinIO, Redis)?
- Cutover: do `server/` and `db` run the same migrations during the transition, or does
  `db` take ownership in a single step?

## Done when

- [ ] DB architecture audit written up with decisions (A).
- [ ] `db` package owns migrations and provisions OLTP + OLAP (B).
- [ ] `AGENTS.md` pool rule updated (C).
- [ ] `server/` API inventory with migrate / keep / drop classification (D).
