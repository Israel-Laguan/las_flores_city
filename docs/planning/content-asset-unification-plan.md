# Content & Asset Unification Plan

> Status: **Planned** (saved for later execution)
> Scope: Confirm asset loss, unify content, generate assets, prevent future deletion.
> Last updated: 2026-07-22

## 1. Issue Confirmation

### 1.1 Assets are gitignored by design — not "deleted" in git
- `.gitignore` excludes all image types (`*.png`, `*.jpg`, `*.jpeg`, `*.webp`, `*.gif`)
  **and** the entire `content/**/assets/` tree.
- Therefore `git log --diff-filter=D -- '*.png'` returns nothing — images are never
  tracked. Asset loss is a **local-disk / MinIO-volume** problem, not a git problem.
- The only 217 PNGs that currently exist are all under `content/lore/shared/`
  (tiles, phone apps, wallpapers). **Entity-level assets are almost entirely absent.**

### 1.2 Content completeness scan

> **Update:** This scan has been completed and the content has been manually unified. See `docs/planning/milestones/M3-content-unification.md` for the current completed state.

### 1.3 Root causes
1. Assets live only on disk/MinIO (gitignored) → lost on volume wipe, no safety net.
2. `scripts/generate-missing-content.mjs` is **characters-only** → scenes/locations/
   overlays/missions lack `.md` / `.prompt.md` / `assets/`.
3. Draft generators (`generate-drafts-unified.mjs`, `generate-pollinations-drafts.mjs`)
   scan **stale `docs/lore/...`** paths, not the current `content/<type>/<slug>/` layout.
   Only `generate-drafts.sh` scans the right `content/` roots (and even it omits
   overlays/missions).
4. No single "unify → generate → verify → back up" command ties the pieces together.

### 1.4 MinIO proposal — already committed (commit `1ccc2b5`)
`scripts/setup-persistent-minio.sh`, `scripts/upload-existing-images-to-minio.sh`,
`docs/development/MINIO_SETUP.md` already exist. Gaps vs. goals:
- Storage-only, not generation/unification.
- Scripts use **Podman** + hardcoded `/home/anthony/code/...` paths, but the project
  runs on **`docker-compose.yml`** with MinIO on a **named volume `minio-data`**.
  `docker compose down --volumes` still wipes images.
- Upload script has a **double-bucket-prefix bug** in the generic loop
    (`minio_path="las-flores/..."` then `mc cp ... lasflores/$minio_path/`).

---

## 2. Proposed Plan

### Phase A — Safety net (stop losing images)
1. **Reconcile MinIO scripts with Docker Compose.**
   - Make `setup-persistent-minio.sh` runtime-aware (detect `docker compose` vs
     `podman`), and switch the compose `minio` volume from a named volume to a
     **host-bind mount** (e.g. `./.minio-data:/data`) so data survives
     `down --volumes`.
   - Add a local `content/**/assets/` tar backup script as a second safety layer.
2. **Fix `upload-existing-images-to-minio.sh`.**
   - Fix the double-bucket-prefix bug.
   - Make paths relative (no hardcoded `/home/anthony`).
3. **Document the "never `down --volumes` without backing up MinIO" rule** in AGENTS.md.

### Phase B — Content unification
*Completed in `docs/planning/milestones/M3-content-unification.md`. All missing files and folders were manually generated.*

### Phase C — Asset generation wired to the current layout
6. **Update `generate-drafts.sh`** (and/or the unified generator) so
   `PROMPT_ROOTS = content/{characters,scenes,locations,overlays,missions,lore/shared}/*/*.prompt.md`,
   output → each folder's flat `assets/<slug>__default.png`. Drop stale `docs/lore/`
   roots.
7. **Run generation in batches by type** (needs `NVIDIA_API_KEY`), then verify with a
   "every prompt has ≥1 asset" check + existing `verify-assets.mjs`.

### Phase D — Verification & guardrails
8. **Add `npm run content:audit`** — re-runs the completeness scan (the table above)
   and fails CLI on missing YAML/`.md`/`.prompt.md` (errors) and missing `assets/`
   (warnings), reusing `lorePathValidation.ts` logic.
9. **Update AGENTS.md** with the unified workflow and the volume-wipe rule.

---

## 3. Content contract reference (per AGENTS.md)
- Every entity folder: `content/<type>/<slug>/`
- Contains: `<prefix><slug>.yaml`, `<slug>.md` (lore), `<slug>.prompt.md` (image prompt),
  `assets/` (flat, with `<slug>__default.png`).
- YAML paths are relative to the YAML's directory: `lore_path: <slug>.md`,
  `asset_paths.portrait: <slug>__default.png`.
- `lorePathValidation.ts` checks `asset_paths.*` exist in the local `assets/` folder
  (filesystem check) — emits warnings if missing.
- `AssetPublishService.ts` reads local `assets/<slug>__default.png` → uploads to MinIO →
  writes `portrait_urls`/`background_urls` into YAML → updates DB. Local `assets/` is the
  staging area; MinIO is canonical; `asset_paths` is the relative filename, `portrait_urls`
  is the published MinIO URL.

### 3.1 Local-draft staging workflow (must be preserved)
The intended authoring loop is:
1. Generate candidate images from an **external** generator (e.g. NIM, Pollinations, or a
   manual tool) and **copy-paste** the PNGs into `content/<type>/<slug>/assets/`.
2. Compare the variants in the flat `assets/` folder and keep the best one, naming the
   chosen file `<slug>__default.png` (this is what `asset_paths.portrait` points at).
3. Run the **publish** step (`AssetPublishService` / admin asset publish) which reads the
   local `<slug>__default.png`, uploads it to MinIO, and writes the signed
   `portrait_urls`/`background_urls` back into the YAML + DB.

This means:
- The local `content/**/assets/` folder is the **staging area**, not canonical. It must
  **not** be deleted by cleanup scripts, and the gitignore for `content/**/assets/` is
  correct (keep images out of git).
- The "avoid images being deleted" goal = protect the staging folder locally (Phase A.1
  backup) **and** ensure the publish step to MinIO (Phase C.7) runs so the chosen image is
  durably stored.
- `LocalDraftService.ts` already sorts `<slug>__default.png` first when listing assets, so
  the chosen default is pre-selected on intake — the plan must not break this convention.

## 4. Execution order
A → C → D. Phase C (image generation) requires the NVIDIA API key.

## 5. Open decisions
- Container runtime: Docker Compose is the project default (AGENTS.md + docker-compose.yml).
  The MinIO scripts must align with it (host-bind mount) rather than Podman-only.
- Scope per pass: see the scoping question (full / A+B+D / A-only / confirm-only).
