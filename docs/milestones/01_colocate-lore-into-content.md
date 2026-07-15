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
Keep everything else (`timeline.md`, `geography.md`, `communities/`, etc.).

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

## Rollback plan

Each step is a separate commit. `git revert <commit>` restores the prior
layout. The MinIO bucket is untouched. The DB rows are not modified by this
milestone (the YAML path strings change, but the migration just rewrites
strings into the same columns).
