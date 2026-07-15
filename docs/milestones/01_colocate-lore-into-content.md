# Milestone 01 — Colocate lore into `content/`

## Goal

Move every per-entity lore file from `docs/lore/figures/<slug>/` and
`docs/lore/districts/<district>/landmarks/<slug>/` into a per-entity folder
under `content/`.

**Important:** the `assets/` folder is **not new**. It already exists per
entity in `docs/lore/figures/<slug>/assets/` (and
`docs/lore/districts/<district>/landmarks/<slug>/assets/`), populated with
pre-existing `<slug>__default.png` files. Milestone 01 **moves it as-is**
to the new location, flat, **without creating any sub-folder**. The new
layout is:

```
content/characters/<slug>/
  ├── char_<slug>.yaml
  ├── <slug>.md            (from docs/lore/figures/<slug>/<slug>.md)
  ├── <slug>.prompt.md     (from docs/lore/figures/<slug>/<slug>.prompt.md)
  └── assets/              # MOVED as-is. Flat, no sub-folders.
      └── <slug>__default.png   (moved as-is, the historical default)
```

Same shape for `content/locations/<slug>/`, `content/scenes/<slug>/`,
`content/overlays/<slug>/`, and `content/mysteries/<slug>/`. New generated
drafts (created by Milestone 03) are added with the timestamp
convention `<slug>__<ISO-timestamp>.png` **flat** alongside
`<slug>__default.png` (and any files the user drops in by hand) — no
sub-folder, and no `.dev.png` / `.staging.png` / `.png` markers on
disk. The local filename is preserved as-is. The selection is recorded
in the YAML's `asset_paths.<field>` field, not in the filename.

After the move, `docs/lore/` contains only **world-level research** (timeline,
geography, communities, governance, organizations, media, events, world-level
district `.md` files, guides, assets/) and **architecture docs** (the `.md`
files at the top of `docs/`).

## Pre-requisites

None. This is the data foundation; everything else depends on it.

## Files to change

### New scripts
- `scripts/move-lore-to-content.sh` — bash script that does the `git mv`s
  and YAML regenerations. One-shot, idempotent.
- `scripts/rewrite-yaml-paths.ts` — TypeScript script that walks every YAML
  under `content/` and rewrites `lore_path` / `narrative_path` /
  `asset_paths.*` to be relative to the YAML's directory.

### Code references to update

| File | Change |
|---|---|
| `server/src/content/lorePathValidation.ts` | Resolve `lore_path` / `narrative_path` / `asset_paths.*` relative to the YAML's directory. Keep a one-release fallback to the old `docs/lore/...` paths (just in case any YAML is missed in the move). |
| `server/src/routes/assets.helpers.ts` | `getPromptRoots()` now scans `content/characters/*/<slug>.prompt.md` and `content/locations/*/<slug>.prompt.md`. |
| `server/src/services/ContentPlanService.ts` | When creating a new character, write the YAML + `<slug>.md` + `<slug>.prompt.md` to the same folder in one pass. |
| `server/src/services/ContentSkeletonGenerator.ts` | Update `resolveFilePath()` to return per-folder paths (e.g. `characters/aisha_al_sayed/char_aisha_al_sayed.yaml` instead of `characters/char_aisha_al_sayed.yaml`). |
| `server/src/services/StoryBuilderFileWriter.ts` | When staging, write into per-entity folders. |
| `server/src/services/StoryBuilderOrchestrator.ts` | Pass per-folder paths to `ContentSkeletonGenerator` and `LoreGenerator`. |
| `scripts/migrate-content-paths.mjs` | Either delete (conventions are now obvious from the folder layout) or update to compute paths from the YAML's directory. |
| `start-stack.sh` | Remove or update `PROMPT_ROOT` env var — the asset pipeline reads prompts from `content/` now. |
| `server/src/services/LoreGenerator.ts` | Change `loreRoot` (line 22, currently `path.resolve(process.cwd(), 'docs', 'lore')`) so generated lore is written into the per-entity folder `content/<type>/<slug>/<slug>.md` instead of `docs/lore/`. Update the path-safety check to validate against `contentDir`, not `loreRoot`. |
| `server/src/services/PromptFileGenerator.ts` | Change `promptsRoot` (line 29, currently `path.resolve(contentDir, '..', 'docs', 'lore', 'assets', 'prompts')`) so `.prompt.md` files are written into the per-entity folder `content/<type>/<slug>/<slug>.prompt.md` (matching the per-folder layout), not `docs/lore/assets/prompts/`. |
| `scripts/import-drafts.mjs` | **Retire (delete).** It creates its own `pg.Pool` and MinIO client, violating the layering contract (see `00_README.md`). The server route `GET /assets/import-drafts` (`server/src/routes/assets-import.ts`, backed by `assets-import.drafts.ts`) does the same filesystem → MinIO → Postgres work using the canonical `queryOLTP` / `StorageService` patterns. |

### Scripts and registries to reorganize

The asset-generation pipeline scripts and their registries currently live
under `docs/lore/assets/`. Per the layering contract, dev-time tools move to
`scripts/` and `docs/lore/` shrinks to world-level research. Move everything
with `git mv` (one commit per sub-step) and update any hardcoded paths.

- **9 live scripts → `scripts/asset-pipeline/scripts/`** (the audit report
  Bucket 1.2 set, including the deprecated `generate-nim-drafts.mjs` shim):
  `generate-prompt.mjs`, `verify-assets.mjs`, `generate-drafts-unified.mjs`,
  `generate-pollinations-drafts.mjs`, `generate-drafts.sh`,
  `generate-nim-drafts.mjs`, `check-prompt-lengths.mjs`, `RUN_GENERATION_PROMPT.md`,
  `generate-drafts-state.tsv`.
- **12 registries → `scripts/asset-pipeline/registries/`**: `tiles.yaml`,
  `landmarks.yaml`, `backgrounds.yaml`, `app_icons.yaml`, `phone_wallpapers.yaml`,
  `body_shapes.yaml`, `ethnicities.yaml`, `movesets.yaml`, `poses.yaml`,
  `personality_poses.yaml`, `expressions.yaml`, `style_prefix.yaml`.
  - `style_prefix.yaml` is currently dead (not loaded by any script, see audit
    report §1.1) — either wire it into `refactor-prompts.mjs` or delete it.
- **15 one-off scripts → `scripts/asset-pipeline/archive/`** (audit report
  Bucket 3.1): `backfill-draft-prompts.mjs`, `cleanup-duplicate-text.mjs`,
  `clean-prompts-for-gen.mjs`, `enrich-prompt-descriptions.mjs`,
  `extract-biometrics.mjs`, `fix-prompt-placeholders.mjs`, `fix-prompt-sources.mjs`,
  `fix-vst-prompts.mjs`, `migrate-lore-layout.mjs`, `migrate-lore-layout-v2.mjs`,
  `refactor-place-prompts.mjs`, `refactor-prompts.mjs`,
  `update-physical-descriptions.mjs`, `generate_ui_assets.py`, `generate-style-test.sh`.
- **Delete** stale output reports and handoff prompts under
  `docs/lore/assets/`: `biometrics-report.json`, `missing-characteristics-report.md`,
  `needs-character-details.md`, and the `references/CONTINUE_*.md` / `NEXT_STEPS_PROMPT.md`
  handoff prompts (track pending work in GitHub issues instead).
- **Update `generate-prompt.mjs`** (DONE as part of the M01 file move): the
  hardcoded registry path (line 708: `path.resolve('docs/lore/assets/registries')`)
  was repointed to `scripts/asset-pipeline/registries`, and the `Usage` header
  examples (lines 16-17) now reference `scripts/asset-pipeline/registries/` and
  `content/...` output dirs. All `**Target:**` output-hint references inside the
  generated `.prompt.md` content were redirected to the per-entity layout,
  consistent with the `**Source:**` field above each and the M01/M03 "flat
  `assets/` bag, no sub-folders" rule:
    - `biometric/`, `expressions/`, `outfits/` (lines 367 / 454 / 476) →
      `content/characters/${slug}/assets/`
    - `figures/` character-sheet (line 504) → `content/characters/${slug}/assets/`
    - `landmarks/` location-map (line 555) → `content/locations/${slug}/${slug}.map.md`
      (a `.map.md` data doc, so it lands as an entity-folder sibling next to the
      YAML/lore, not in the image `assets/` bag)
  These are documentation hints only (the script emits `.prompt.md` text; the
  `**Target:**` strings themselves are not read by any code), so redirecting them
  is behavior-neutral. NOTE: the script's *actual* output-routing code — lines
  ~959/963 resolve `path.resolve('docs/lore/figures', slug)` /
  `path.resolve('docs/lore/landmarks', slug)`, and line ~996 computes
  `meta.sourcePath` relative to `docs/lore` — still writes to (and reads from)
  the legacy `docs/lore/figures` / `docs/lore/landmarks` directories. Repointing
  that generation *output* to the `content/` per-folder layout is a genuine
  behavior change (not just a doc string) and is intentionally out of scope here;
  it is tracked as a follow-up in Milestone 03 (local image drafts).

### YAML files to update (~130 characters + ~60 locations + ~150 scenes)
- Rewrite `lore_path: docs/lore/figures/<slug>/<slug>.md` → `lore_path: <slug>.md`.
- Rewrite `narrative_path: content/characters/<slug>.md` (where it exists) → `narrative_path: <slug>.md`.
- Rewrite `asset_paths.portrait: characters/<slug>/portrait.png` → `asset_paths.portrait: <slug>__default.png` (the pre-existing draft that now lives in the per-entity `assets/` folder).

### Tests to update
- `server/tests/unit/adminCoverage.property.test.ts` — walk `content/characters/*/<slug>.md` instead of `figures/...`.
- `server/tests/unit/lorePathValidation.test.ts` — use per-folder relative fixtures.
- `server/tests/unit/migrationScripts.test.ts` — fix the hardcoded `docs/lore/figures/...` paths.
- `server/tests/unit/assetPromptType.property.test.ts` and `assetMultiRootCatalog.property.test.ts` — update the constant paths.
- `server/tests/integration/assets.test.ts` and `globalSetup.cjs` — update `PROMPT_ROOT`.

### Docs to update
- `content/README.md` — rewrite to describe the new colocated structure.
- `docs/lore/README.md` — rewrite to describe it as world-level research, not engine content.
- `docs/game_design.md` and `docs/STORY_BUILDER_DESIGN.md` — update references.
- `AGENTS.md` — update the "current codebase facts" section.
- `docs/development/asset-pipeline/audit-report.md` — update the proposed
  archive location from `docs/development/asset-pipeline/archive/scripts/` to
  `scripts/asset-pipeline/archive/` (this milestone moves those one-off scripts
  there).

## Implementation outline

### Step 1: Move the 130 figure bundles

**Important:** the `assets/` folder already exists per entity in
`docs/lore/figures/<slug>/assets/`. It is **moved as-is** to the new
location, flat, with the pre-existing `<slug>__default.png` files inside.
No sub-folder is created. New generated drafts added by Milestone 03
land in the same `assets/` folder with names like
`<slug>__<ISO-timestamp>.png`. Files dropped in by hand can have any
name — the selector shows all of them.

```bash
# scripts/move-lore-to-content.sh
#!/usr/bin/env bash
set -euo pipefail

for fig_dir in docs/lore/figures/*/; do
  slug=$(basename "$fig_dir")
  target="content/characters/$slug"
  mkdir -p "$target"

  # Move the lore .md
  if [ -f "$fig_dir/$slug.md" ]; then
    git mv "$fig_dir/$slug.md" "$target/$slug.md"
  fi

  # Move the prompt .md
  if [ -f "$fig_dir/$slug.prompt.md" ]; then
    git mv "$fig_dir/$slug.prompt.md" "$target/$slug.prompt.md"
  fi

  # Move the assets folder as-is (flat, no sub-folders). It already
  # contains the pre-existing <slug>__default.png and any other drafts.
  if [ -d "$fig_dir/assets" ]; then
    git mv "$fig_dir/assets" "$target/assets"
  fi
done

# Remove the now-empty figure folders
find docs/lore/figures -maxdepth 1 -type d -empty -delete
```

### Step 2: Move the ~60 landmark bundles

Same pattern, but from `docs/lore/districts/*/landmarks/<slug>/` to
`content/locations/<slug>/`. Landmarks are treated as locations in the engine
(their YAML is `location_<slug>.yaml`).

### Step 3: Colocate the flat YAMLs

```bash
# Move flat character YAMLs into per-folder layout (creates the folder if missing)
for yaml in content/characters/char_*.yaml; do
  [ -e "$yaml" ] || continue
  slug=$(echo "$yaml" | sed 's|content/characters/char_||; s|\.yaml$||')
  target="content/characters/$slug"
  mkdir -p "$target"
  git mv "$yaml" "$target/char_$slug.yaml"
done
```

Same for `content/scenes/scene_*.yaml` → `content/scenes/<slug>/scene_<slug>.yaml`,
`content/locations/location_*.yaml` → `content/locations/<slug>/location_<slug>.yaml`,
`content/overlays/overlay_*.yaml` → `content/overlays/<slug>/overlay_<slug>.yaml`,
`content/mystories/mystery_*.yaml` → `content/mysteries/<slug>/mission_<slug>.yaml`.

### Step 4: Rewrite the YAML paths

```ts
// scripts/rewrite-yaml-paths.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { glob } from 'glob';

const CONTENT_DIR = 'content';

async function rewriteYaml(yamlPath: string) {
  const raw = await fs.readFile(yamlPath, 'utf-8');
  const data = yaml.load(raw) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return;

  const dir = path.dirname(yamlPath);
  const filename = path.basename(yamlPath, '.yaml');
  // filename is e.g. 'char_aisha_al_sayed' — extract the slug
  const slug = filename.replace(/^(char_|scene_|location_|overlay_|mission_|dialogue_)/, '');

  let changed = false;
  // lore_path: docs/lore/figures/<slug>/<slug>.md → <slug>.md
  if (typeof data.lore_path === 'string' && data.lore_path.includes('docs/lore')) {
    data.lore_path = `${slug}.md`;
    changed = true;
  }
  // narrative_path: content/.../<slug>.md → <slug>.md
  if (typeof data.narrative_path === 'string' && data.narrative_path.includes('content/')) {
    data.narrative_path = `${slug}.md`;
    changed = true;
  }
  // asset_paths.portrait: characters/<slug>/portrait.png → assets/<slug>__default.png
  if (data.asset_paths && typeof data.asset_paths === 'object') {
    const ap = data.asset_paths as Record<string, string>;
    for (const key of Object.keys(ap)) {
      if (ap[key]?.endsWith('.png') || ap[key]?.endsWith('.jpg')) {
        // Point at the pre-existing default in the per-entity assets/ folder
        ap[key] = `${slug}__default.png`;
        changed = true;
      }
    }
  }

  if (changed) {
    await fs.writeFile(yamlPath, yaml.dump(data, { lineWidth: -1, noRefs: true }));
    console.log(`rewrote ${yamlPath}`);
  }
}

const files = await glob(`${CONTENT_DIR}/**/*.yaml`, { absolute: true });
for (const f of files) await rewriteYaml(f);
```

### Step 5: Slim down `docs/lore/`

Remove `docs/lore/figures/` (now empty after the move).
Remove `docs/lore/districts/*/landmarks/` (now empty after the move).
Keep `docs/lore/districts/*/<district>.md` (world-level district reference).
Remove `docs/lore/assets/` **entirely** — its scripts are moved to
`scripts/asset-pipeline/scripts/`, its registries to `scripts/asset-pipeline/registries/`,
its one-off scripts to `scripts/asset-pipeline/archive/`, and its stale output
reports / handoff prompts are deleted. Keep only world-level research under
`docs/lore/` (`timeline.md`, `geography.md`, `communities/`, `governance/`,
`organizations/`, `media/`, `events/`, and world-level `districts/` docs).

### Step 5b: Move dev-time scripts and registries

```bash
# From the repo root
mkdir -p scripts/asset-pipeline/scripts scripts/asset-pipeline/registries scripts/asset-pipeline/archive

# 9 live scripts
git mv docs/lore/assets/scripts/generate-prompt.mjs        scripts/asset-pipeline/scripts/
git mv docs/lore/assets/scripts/verify-assets.mjs          scripts/asset-pipeline/scripts/
git mv docs/lore/assets/scripts/generate-drafts-unified.mjs scripts/asset-pipeline/scripts/
git mv docs/lore/assets/scripts/generate-pollinations-drafts.mjs scripts/asset-pipeline/scripts/
git mv docs/lore/assets/scripts/generate-drafts.sh        scripts/asset-pipeline/scripts/
git mv docs/lore/assets/scripts/generate-nim-drafts.mjs    scripts/asset-pipeline/scripts/
git mv docs/lore/assets/scripts/check-prompt-lengths.mjs   scripts/asset-pipeline/scripts/
git mv docs/lore/assets/scripts/RUN_GENERATION_PROMPT.md   scripts/asset-pipeline/scripts/
git mv docs/lore/assets/scripts/generate-drafts-state.tsv  scripts/asset-pipeline/scripts/

# 12 registries
git mv docs/lore/assets/registries/*.yaml                  scripts/asset-pipeline/registries/

# 15 one-off scripts → archive
git mv docs/lore/assets/scripts/backfill-draft-prompts.mjs    scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/cleanup-duplicate-text.mjs   scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/clean-prompts-for-gen.mjs    scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/enrich-prompt-descriptions.mjs scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/extract-biometrics.mjs        scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/fix-prompt-placeholders.mjs   scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/fix-prompt-sources.mjs        scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/fix-vst-prompts.mjs           scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/migrate-lore-layout.mjs       scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/migrate-lore-layout-v2.mjs    scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/refactor-place-prompts.mjs    scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/refactor-prompts.mjs          scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/update-physical-descriptions.mjs scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/generate_ui_assets.py         scripts/asset-pipeline/archive/
git mv docs/lore/assets/scripts/generate-style-test.sh        scripts/asset-pipeline/archive/

# Stale output + handoff prompts
git rm docs/lore/assets/biometrics-report.json \
       docs/lore/assets/missing-characteristics-report.md \
       docs/lore/assets/needs-character-details.md
git rm docs/lore/assets/references/CONTINUE_ADMIN_ENHANCEMENTS.md \
       docs/lore/assets/references/CONTINUE_ASSET_GENERATION_PROMPT.md \
       docs/lore/assets/references/NEXT_STEPS_PROMPT.md
```

### Step 5c: Retire `scripts/import-drafts.mjs`

```bash
git rm scripts/import-drafts.mjs
```

This script created its own `pg.Pool` + MinIO client and bypassed the server.
The canonical replacement is the server route `GET /assets/import-drafts`, which
reads draft folders from the prompt roots and upserts into Postgres using
`queryOLTP` / `StorageService`. If an offline import is ever needed, add it as a
route rather than a standalone script with its own DB connection.

### Step 5d: Resolve the ghost `content/package.json`

`content/package.json` declares `name: las-flores-content` but is not in the
npm `workspaces` array, exports no code, and only wraps server commands
(`cd ../server && npm run validate`). `content/` is a data directory, not a
package. Remove it so the boundary is honest; `npm run validate:content` from
the repo root already works through the server workspace.

```bash
git rm content/package.json
```

### Step 6: Update the code paths

The five code files listed above. Critical detail: the old
`getContentTypeFromPath()` in `server/src/content/migrate.ts` uses directory
matching (`if path includes '/characters/'`). After the move, every character
YAML is at `content/characters/<slug>/char_<slug>.yaml`, so the existing
matching still works. **No change needed in `migrate.ts`.**

## Tests to add or update

- `server/tests/unit/lorePathValidation.test.ts` — add cases for the new
  per-folder resolution. Drop cases for the old `docs/lore/figures/...` paths
  (or keep one as a fallback test).
- `server/tests/integration/migration.test.ts` — add a test that runs
  `migrateContent()` against a per-folder layout and confirms all characters
  load with their `lore_path` resolved to a sibling file.
- `server/tests/unit/contentSkeletonGenerator.test.ts` — update expectations
  to match the new per-folder `resolveFilePath()` output.

## Validation gate

1. `npm run validate:content` passes.
2. `npm run migrate` succeeds end-to-end.
3. All 130 characters and ~60 locations appear in the `characters` and
   `scenes` tables with `lore_path` resolving to a real file.
4. `npm run lint --workspace=server` → 0 errors.
5. `npm run test --workspace=server` → all green.
6. `npm run build --workspace=server` → passes.
7. `npm run build --workspace=client` → passes.
8. `docker compose build server && docker compose up -d server` succeeds.
9. `docker exec las-flores-server wget -qO- http://localhost:3000/health`
   returns `{"success":true}`.
10. A spot-check: open the admin `/characters` page, click on Aisha, the
    lore viewer shows the moved `content/characters/aisha_al_sayed/aisha_al_sayed.md`.
11. `scripts/asset-pipeline/scripts/` holds the 9 live scripts,
    `scripts/asset-pipeline/registries/` holds the 12 YAML registries, and
    `scripts/asset-pipeline/archive/` holds the 15 one-off scripts.
12. `scripts/import-drafts.mjs` no longer exists; `GET /assets/import-drafts`
    still works and is the only import path.
13. `docs/lore/assets/` no longer exists; `docs/lore/` contains only
    world-level research (no scripts, no registries, no per-entity files).
14. `content/package.json` no longer exists; `npm run validate:content` from the
    repo root still passes.

## Rollback plan

Each step is a separate commit. `git revert <commit>` restores the prior
layout. The MinIO bucket is untouched. The DB rows are not modified by this
milestone (the YAML path strings change, but the migration just rewrites
strings into the same columns).
