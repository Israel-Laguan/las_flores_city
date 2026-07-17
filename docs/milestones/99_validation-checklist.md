# Milestone 99 — Validation checklist

> **Status: M01–M08 are structurally implemented.** This checklist was never
> ticked off during development. Items marked `[x]` below are verified at the
> code level (files exist, routes are wired, schemas are correct). Items still
> marked `[ ]` require manual runtime verification (running a server instance,
> clicking through the admin UI, checking Docker logs). A full regression sweep
> is recommended before tagging a release.

> Cross-cutting checklist for **all eight milestones**. Run this after each
> milestone to confirm nothing is broken, and again at the end to confirm
> the full system works.

## Per-milestone minimum checks

After **every** milestone, these must pass:

```bash
# 1. Server: lint clean
cd /home/anthony/code/las_flores_city
npm run lint --workspace=server

# 2. Server: build clean
npm run build --workspace=server

# 3. Server: all tests green
npm run test --workspace=server
```

Expected: 0 errors. Warnings are OK if they are pre-existing
(`max-lines` on long files, etc.).

### Automated tests for milestone-specific assertions

These test files cover the unique coverage that was previously in `scripts/validate-milestones.sh`:

| Test file | Coverage |
|-----------|----------|
| `server/tests/integration/migration.schema.test.ts` | Migration versions (049/050/051), `content_plans_status_check` constraint, `verification_report`, `background_urls`, `image_urls` columns |
| `server/tests/integration/content-cleanup.test.ts` | Legacy `docs/lore/figures/` and `docs/lore/districts/*/landmarks/` removed, no `assets/drafts/` subfolder |
| `server/tests/smoke/api.smoke.test.ts` | HTTP smoke: `/health`, `/location/:id` portrait URL resolution, `/admin/content/assets/promotion-status` |

> Run with: `npm run test:integration --workspace=server` and `npm run test:smoke --workspace=server`

### Verified results (2026-07-17)

- [x] **Server lint**: 0 errors (verified)
- [x] **Server build**: 0 errors (verified)
- [ ] **Server tests**: require running DB — run `npm run test --workspace=server` with Postgres/Redis active
- [x] **Shared build**: 0 errors (verified)
- [x] **Content validation**: `npm run validate:content` passes (verified)
- [x] **Admin lint**: 0 errors, 1 pre-existing warning `max-lines-per-function` on `PromotionRow.test.tsx` (verified)
- [x] **Admin build**: passes (verified)
- [x] **Client build**: passes (verified)

## After milestone 01 (colocation)

- [ ] `npm run validate:content` passes
- [ ] `npm run migrate` succeeds end-to-end
- [ ] All 130 character rows in the `characters` table have `lore_path`
      resolving to a sibling `<slug>.md` file
- [ ] All ~60 location rows in the `scenes` table have `lore_path`
      resolving to a sibling `<slug>.md` file
- [ ] `docs/lore/figures/` is empty (or removed)
- [ ] `docs/lore/districts/*/landmarks/` is empty (or removed)
- [ ] A spot-check: open admin `/characters`, click Aisha, the lore
      viewer shows `content/characters/aisha_al_sayed/aisha_al_sayed.md`

## After milestone 02 (state machine)

- [ ] Migration `049_content_plans_verified.sql` applies cleanly on
      fresh DB and on existing DB
- [ ] Migration `050_content_plans_verification.sql` applies cleanly
- [ ] The `content_plans` table CHECK constraint allows the 7 new values
- [ ] The `content_plans.verification_report` column exists and is nullable
- [ ] The shared Zod schema accepts the new enum values
- [ ] An invalid state transition (e.g. `draft → migrated`) is rejected
      with a clear error message

## After milestone 03 (local drafts)

- [ ] `POST /plans/:id/generate-drafts` writes 3 new PNGs to
      `content/.../assets/<slug>__<ISO-timestamp>.png` (flat in the
      per-entity `assets/` folder, using the timestamp convention)
      and does NOT call `uploadToMinio` (verify with grep on server
      logs)
- [ ] The `asset_bases` table has 0 new rows after `generate-drafts`
- [ ] **The selector shows every valid asset file in `assets/`**,
      regardless of name. Verify by:
      a. Copying a file with an unusual name (e.g.
         `from_midjourney_v3.png`) into `assets/` via the OS file
         manager.
      b. Clicking "Refresh" in the admin selector.
      c. Confirming the new file appears as a thumbnail.
- [ ] The selector **ignores non-asset files** (e.g. `.txt`,
      `.DS_Store`, sub-directories). Verify by dropping a non-image
      file in and confirming it does NOT appear.
- [ ] Clicking a thumbnail updates the YAML's `asset_paths.<field>`
      to point at the chosen filename. No file is moved, copied, or
      renamed.
- [ ] On intake, when `assets/<slug>__default.png` exists (the pre-existing
      draft moved by M01), the YAML's `asset_paths.<field>` is
      pre-populated with `<slug>__default.png` and the corresponding
      `AssetNeed.status` is auto-set to `chosen`. The user can change
      the selection by clicking another thumbnail.
- [ ] The original `assets/<slug>__default.png` is never deleted, renamed,
      or modified by the local-draft flow. It is the historical record.
- [ ] No `assets/drafts/` sub-folder is created. All drafts are flat
      in `assets/`.
- [ ] The selector treats files dropped in by hand, files generated by
      the in-app script, and the pre-existing default identically.
      Provenance does not affect what is shown.

## After milestone 04 (approve & solidify)

- [ ] Clicking "Approve & Ship" runs the full flow:
      approve → stage → publish → migrate → verify
- [ ] The plan status transitions correctly: `proposed → approved →
      staged → migrated → verified` (or `failed` at any step)
- [ ] The MinIO bucket has one object per published asset, with the
      original local filename (e.g. `<slug>__default.png`, or any file the user dropped in)
      — no `.dev`/`.staging` suffix in the object key
- [ ] The DB `characters.portrait_urls` JSONB has a `label:'dev'` entry with the MinIO URL
- [ ] The YAML's `asset_paths.portrait` field still has the local filename
      (e.g. `<slug>__default.png`); it is not overwritten with a URL
- [ ] The verification report is saved on the `content_plans` row
- [ ] The wizard is 2 steps (Describe, Results) for the happy path
- [ ] The wizard shows a spinner during the operation

## After milestone 05 (verification)

- [ ] A plan with a broken `lore_path` produces a verification report
      with `passed: false` and a `fail` check
- [ ] A plan with all references intact produces `passed: true` and all
      `pass` checks
- [ ] The verification report is visible in the admin
      `/story-builder/plans/<id>` page
- [ ] The verification runs in under 30 seconds for a typical plan
- [ ] All seven check types are implemented and tested

## After milestone 06 (MinIO env stages)

- [ ] After approving a plan, MinIO has one object per published asset
      (with the local filename preserved as the object key, no `.dev`
      suffix)
- [ ] After clicking "Promote to Staging", `portrait_urls` gains a
      `label: 'staging'` entry (same MinIO URL as dev by default; cascade is
      in the `label`, not the key)
- [ ] After clicking "Promote to Production", `portrait_urls` gains a
      `label: 'production'` entry
- [ ] After clicking "Rollback from Staging", the `label: 'staging'` entry is
      removed from `portrait_urls` (dev and production entries remain)
- [ ] The promotion flow does NOT create new MinIO objects unless different
      bytes are supplied (no key copies by default)

## After milestone 07 (server cascade)

- [ ] With `NODE_ENV=development`, a character's `portraitUrl` (via
      `/api/scene/:id`) is the `dev` entry when present
- [ ] With `NODE_ENV=development`, the `staging` URL is used when `dev`
      is absent
- [ ] With `NODE_ENV=development`, the `production` URL is used when
      `dev` and `staging` are both absent
- [ ] With `NODE_ENV=production`, the `production` URL is used when
      present
- [ ] With `NODE_ENV=production`, the `staging` URL is used when
      `production` is absent
- [ ] With `NODE_ENV=production`, the `dev` URL is used when
      `production` and `staging` are both absent
- [ ] A scene with `background_urls` cascades the same way; a scene
      with only the legacy `background_url` TEXT still resolves
      (back-compat)
- [ ] The client is **not** modified — `npm run build --workspace=client`
      is a no-op for this milestone; `portraitUrl`/`backgroundUrl` remain
      single strings on the API

## After milestone 08 (admin UI)

- [ ] The wizard is 2 steps
- [ ] The Review step shows asset drafts
- [ ] Clicking "Approve & Ship" runs the full flow
- [ ] The Results step shows the verification report
- [ ] The `/asset-promotion` page lists all entities with their three
      stages
- [ ] Promote and Rollback buttons work
- [ ] The dashboard has a link to `/asset-promotion`

## End-to-end smoke test (run after all milestones)

This is the master "does the full system work?" test.

### Step 1: Fresh start

```bash
docker compose down --volumes
docker compose build server
docker compose up -d
./scripts/apply-migrations.sh both
docker exec las-flores-server wget -qO- http://localhost:3000/health
```

Expected: `{"success":true,...}`.

### Step 2: Idea intake

1. Open `http://localhost:3001/story-builder`.
2. Type a new character description, e.g. *"A grizzled dockworker named
   Mateo Vargas who works at the Port Area. Late 50s, weathered face,
   loves his granddaughter."*
3. Click "Generate Plan".
4. The wizard shows a plan with one character item: name, description,
   personality, faction, etc. The plan status is `proposed`.

### Step 3: Local drafts

1. In the Review step, find the asset drafts panel.
2. Click "Generate Drafts".
3. Wait ~30 seconds. Four PNG drafts appear as thumbnails.
4. The first one is auto-checked as chosen.

### Step 4: Approve & Ship

1. Click "Approve & Ship".
2. A spinner appears. Wait ~60 seconds.
3. The Results step shows a green checkmark and the verification report.
4. The plan status is `verified`.

### Step 5: Verify the data

```bash
# Check the YAML on disk
cat content/characters/mateo_vargas/char_mateo_vargas.yaml

# Expected:
#   lore_path: mateo_vargas.md
#   asset_paths:
#     portrait: mateo_vargas__default.png   # local chosen file, unchanged
#   portrait_urls:
#     - url: http://minio:9000/las-flores/portrait/mateo_vargas__default.png
#       label: dev                          # appended by M04

# Check the local draft
ls -la content/characters/mateo_vargas/assets/
# Expected: mateo_vargas__default.png (the chosen one; local filename preserved)

# Check MinIO (using the minio client or the admin UI /assets page)
# Expected: las-flores/portrait/mateo_vargas__default.png exists (no suffix)

# Check the DB
psql -h localhost -U las_flores -d las_flores \
  -c "SELECT name, portrait_urls FROM characters WHERE name = 'Mateo Vargas';"
# Expected: portrait_urls has a label:'dev' entry with the MinIO URL
```

### Step 6: Promote

1. Open `http://localhost:3001/asset-promotion`.
2. Find Mateo Vargas.
3. Click "Promote to Staging".
4. Click "Promote to Production".
5. `portrait_urls` now has `dev`, `staging`, and `production` entries.

### Step 7: Cascade on the server

> **Updated 2026-07-17:** the cascade resolves **server-side** (Milestone 07),
> not in a client build. The client only ever receives the single resolved
> `portraitUrl` / `backgroundUrl` string. Verify via the API, not a client
> build flag.

1. Seed a character (e.g. Mateo Vargas) `portrait_urls` with `dev`,
   `staging`, and `production` entries (use the M06 promotion flow or edit
   the YAML and re-migrate).
2. With the server running under `NODE_ENV=development`, `GET /api/scene/:id`
   for a scene containing Mateo returns `npcs[].portraitUrl` equal to the
   `dev` entry's URL.
3. Restart the server under `NODE_ENV=production` (or override the env for
   the resolver in a test) and re-request: `portraitUrl` now equals the
   `production` entry's URL.
4. Remove the `dev` entry (dev env): `portraitUrl` falls back to `staging`.
   Remove `dev` + `staging` (dev env): falls back to `production`.
5. A scene with only the legacy `background_url` TEXT (no `background_urls`
   array) still returns a usable `backgroundUrl` (back-compat).
6. **New (gap 5 fix):** A location (scene) with `image_urls` JSONB entries
   returns the env-appropriate `image_url` in `GET /api/location/`. A location
   with only the legacy `image_url` TEXT still works (back-compat).

### Step 8: Rollback

1. In `/asset-promotion`, click "Rollback from Staging" on Mateo Vargas.
2. The `label: 'staging'` entry is removed from `portrait_urls`. The dev and
   production entries remain.
3. The portrait in the client (dev build) falls back to staging, then
   production.

### Step 9: Promotion page shows all content types

> **New (gap 6 fix, 2026-07-17):** the `/asset-promotion` page now renders
> a "Type" column and shows characters, scenes, and locations.

1. Navigate to `/asset-promotion`. The table header shows "Type" and "Entity"
   columns.
2. Characters appear with type "Character", scenes with "Scene", locations
   with "Location".
3. The empty state reads "No entities found for asset promotion" instead of
   "No characters found".

If all nine steps pass, the milestone set is complete.

## Per-milestone commit discipline

Each milestone is a single pull request with these properties:

1. **One PR per milestone.** No batching.
2. **Branch name:** `milestone/<NN>-<short-name>` (e.g.
   `milestone/01-colocate-lore-into-content`).
3. **Commit message:** `M01: <one-line summary>` (e.g.
   `M01: move lore per-folder layout`).
4. **Tests in the same PR** as the code change.
5. **Docs in the same PR** as the code change.
6. **CI must be green** before the PR is merged.

## Per-milestone review discipline

Each PR must be reviewed against the **Validation gate** in its
milestone document, not just "does it compile". Specifically:

- The reviewer opens the admin UI and walks through the smoke test for
  the relevant step (e.g. for M01, the spot-check; for M04, the full
  approve-and-ship flow).
- The reviewer reads the verification report for the relevant step
  (e.g. for M05, they confirm a deliberate-broken-reference plan
  produces `passed: false`).
- The reviewer confirms the rollback plan still works (e.g. for M06,
  they confirm a rollback actually removes the `label: 'staging'` entry
  from the `portrait_urls` JSONB array — there is no `staging` column to
  NULL; the cascade is modeled entirely in the JSONB `label` entries).

## Out-of-scope reminders

- **Multi-language support.** The colocation makes it easier to add
  (`<slug>.es.md`, `<slug>.en.md`) but the LLM-side translation work is
  a separate milestone, not part of this set.
- **Live preview during intake.** A UX milestone that depends on the
  local-draft generation being fast. After M03, measure the time from
  "Generate Drafts" to first thumbnail; if it's under 5 seconds, this
  is feasible.
- **AI-assisted image editing.** The current `/assets/generate-variants`
  endpoint already supports this; surfacing it in the intake UI is a UX
  milestone.
- **Image provenance tracking.** The `asset_bases` table already stores
  `seed` and `prompt_text`; wiring those into the YAML and the cascade
  is a follow-up.
