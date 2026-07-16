# Audit Report: docs/lore/assets/ Workspace Cleanup

## Context

- **Project:** Las Flores 2077
- **Task:** Audit `docs/lore/assets/` and categorize everything into three buckets:
  1. SAVED AS-IS — actively used by the asset pipeline or referenced by game content
  2. TRANSFORM/EXTRACT — content that should be promoted into `content/`
  3. ARCHIVE/DELETE — one-off explorations, outdated experiments, regeneratable output
- **Date:** 2026-07-15
- **Prior action:** 143 legacy PNG drafts copied from `ui-concepts/archive` into per-folder `content/<entity>/<slug>/assets/` directories

---

## How the layout differs from expectations

The user mentioned directories like `assets/ui-concepts/`, `assets/scripts/`, `assets/biometric/`, `assets/expressions/`, `assets/outfits/`, `assets/tiles/`, `assets/overlays/`, `assets/shared/` — these **do not exist** in the actual layout. The real structure:

```
docs/lore/assets/
├── biometrics-report.json          (80 KB, loose)
├── missing-characteristics-report.md (3 KB, loose)
├── needs-character-details.md      (10 KB, loose)
├── registries/                     (12 YAMLs, ~50 KB)
├── scripts/                        (25 scripts + 1 .tsv + 1 .md)
└── references/                     (13 .md files + 4 subdirs)
    ├── akool-test/                 (1 MANIFEST.md)
    ├── prompts/prompts/            (3 legacy .txt — characters, locations, scenes)
    ├── style-exploration/          (2 notes.md files)
    └── ui-concepts/                (49 .prompt.md + 143 PNG drafts + 3 HTML mockups, 41 MB)
        ├── isometric-map/          (17 tile + 15 landmark prompts + drafts)
        ├── phone-terminal/         (1 wallpaper + 8 app icon prompts + drafts)
        └── vn-interface/           (8 background + 2 portrait prompts + drafts)
```

Also: `docs/lore/shared/` is **empty** (0 files). The live shared prompts are in `content/lore/shared/` (142 files).

---

## Bucket 1: SAVED AS-IS (live pipeline, do not touch)

### 1.1 Registries (`docs/lore/assets/registries/*.yaml`)

All 12 YAML files are the source-of-truth for the dev-time prompt generator (`generate-prompt.mjs`).

| File | Read by | Purpose |
|---|---|---|
| `tiles.yaml` | `generate-prompt.mjs` (`readRegistryEntries` for `--type tile`) | 17 terrain tile definitions |
| `landmarks.yaml` | `generate-prompt.mjs` (`readRegistryEntries` for `--type overlay`) | 15 landmark overlay definitions |
| `backgrounds.yaml` | `generate-prompt.mjs` `--type background` | 8 scene background definitions |
| `app_icons.yaml` | `generate-prompt.mjs` `--type app-icon` | 8 phone app icon definitions |
| `phone_wallpapers.yaml` | `generate-prompt.mjs` `--type phone-wallpaper` | 1 phone wallpaper |
| `body_shapes.yaml` | `generate-prompt.mjs` `character-sheet` template; also ref by `content/characters/diego_huaman/` | 9 body types |
| `ethnicities.yaml` | `generate-prompt.mjs` `character-sheet` template | 8 ethnic face bases |
| `movesets.yaml` | `generate-prompt.mjs` `resolveMoveset()` at line 706-712 | Occupation-based movement vocabulary |
| `poses.yaml` | `generate-prompt.mjs` `resolveMoveset()` at line 710 | 35+ pose definitions |
| `personality_poses.yaml` | `generate-prompt.mjs` `character-sheet` template | 25+ personality → pose maps |
| `expressions.yaml` | `generate-prompt.mjs` `character-sheet` template | 17 expressions |
| `style_prefix.yaml` | **NOT loaded by any script** — the `STYLE_PREFIX` is hard-coded in `refactor-prompts.mjs` | Dead YAML — candidate for deletion or wiring |

### 1.2 Scripts used by the live pipeline

| Script | References | Notes |
|---|---|---|
| `generate-prompt.mjs` | 50+ refs, most recently modified 2026-07-15 | **Canonical entry point** — reads registries, writes `.prompt.md` files |
| `verify-assets.mjs` | 33 refs | Checks MinIO for each asset URL |
| `generate-drafts-unified.mjs` | 25+ refs | Current unified draft generator (NIM + Pollinations) |
| `generate-pollinations-drafts.mjs` | 14 refs | Pollinations fallback invoked by unified script |
| `generate-drafts.sh` | 36 refs | Bash wrapper with state tracking (`init`, `run`, `status`, `retry`, `clean`) |
| `generate-drafts-state.tsv` | Runtime state file for `generate-drafts.sh` | Should probably be gitignored |
| `generate-nim-drafts.mjs` | 7 refs, self-declares DEPRECATED | 833-byte shim that spawns unified script |
| `check-prompt-lengths.mjs` | 10 refs, called by `docs/lore/PROMPT_GUIDELINES.md` | Official length validator |
| `RUN_GENERATION_PROMPT.md` | Own docstring | Operational README for unified generator |

### 1.3 Pipeline docs (keep as references)

| File | Why keep |
|---|---|
| `references/asset_pipeline.md` | Primary pipeline documentation, referenced 6× |
| `references/media-pipeline-tiers.md` | Tier rollout plan, referenced 4× |
| `references/BIOMETRIC_NEXT_STEPS.md` | Phase F biometric plan |
| `references/asset-generation-checklist.md` | Referenced 2× |
| `references/ADMIN_ASSET_GENERATION.md` | Recent (2026-07-14) admin generation guide |
| `references/QA_TESTING_PROMPT.md` | Recent (2026-07-14) QA test cases |
| `references/POLLINATIONS_DRAFT_PROMPT.md` | Operational pollinations guide |
| `references/DRAFT_GENERATION_FINDINGS.md` | Recent findings |
| `references/README.md` | Index for the directory |

---

## Bucket 2: TRANSFORM/EXTRACT

### 2.1 What was already done (completed action)

**143 PNG drafts** were copied from `docs/lore/assets/references/ui-concepts/` into the per-folder layout:

| Group | Source path in ui-concepts | Count | Target |
|---|---|---|---|
| Landmark overlays | `isometric-map/assets/lm_*.prompt/drafts/*.png` | 45 (15×3) | `content/locations/<slug>/assets/lm_*.png` |
| Terrain tiles | `isometric-map/assets/tile_*.prompt/drafts/*.png` | 51 (17×3) | `content/lore/shared/tiles/<slug>/assets/tile_*.png` |
| Phone app icons | `phone-terminal/assets/app_*.prompt/drafts/*.png` | 14 (7×2) | `content/lore/shared/phone/<slug>/assets/app_*.png` |
| Phone wallpaper | `phone-terminal/assets/wallpaper_*.prompt/drafts/*.png` | 3 (1×3) | `content/lore/shared/phone/las_flores_skyline/assets/wallpaper_*.png` |
| VN backgrounds | `vn-interface/assets/bg_*.prompt/drafts/*.png` | 24 (8×3) | `content/locations/<slug>/assets/bg_*.png` |
| VN portraits | `vn-interface/assets/portrait_*.prompt/drafts/*.png` | 6 (2×3) | `content/characters/<slug>/assets/portrait_*.png` |

**Result:** 143 copied, 0 renamed (no name clashes), 0 skipped. `app_misiones` skipped (no drafts exist in source).

### 2.2 Slug renames applied during copy

These are the differences between ui-concepts naming (old) and per-folder naming (new):

| Old ui-concepts slug | New content/ slug | Type |
|---|---|---|
| `tile_forest` | `forest_floor` | tile |
| `tile_grass_park` | `park_grass` | tile |
| `tile_water_ocean` | `ocean_water` | tile |
| `tile_water_river` | `river_water` | tile |
| `tile_building_civic` | `civic_building` | tile |
| `tile_building_residential` | `residential_building` | tile |
| `wallpaper_las_flores` | `las_flores_skyline` | phone |
| `bg_callejon_centro` | `old_las_flores` | location |
| `bg_laboratorio` | `luz_del_rio_energy_plant` | location (lab inside plant) |
| `bg_puerto_noche` | `puerto_de_las_flores` | location (alley variant) |

### 2.3 Semi-orphan files (need human review)

Two groups of PNGs that don't match a 1:1 entity:

| Source | Destination | Problem |
|---|---|---|
| `lm_playa_entrada__*.png` (3 files) | `content/locations/playa_de_los_vientos/assets/` | "Playa Entrance" is not a real entity. Closest is `playa_de_los_vientos` (a different beach). Was force-routed here. **Abandoned concept?** |
| `bg_laboratorio__*.png` (3 files) | `content/locations/luz_del_rio_energy_plant/assets/` | "Laboratorio" is a sub-scene (a lab inside the plant). No standalone entity. Roughly correct context but not exact. |

### 2.4 Mapped entity coverage

Of 49 ui-concepts `.prompt.md` files checked against `content/`:
- **28** exact slug match (e.g., `iglesia_vieja`, `mercado_central`, `puerto_de_las_flores`, all `app_*`)
- **19** name match in YAML / md (e.g., `electra_battery_factory`, `the_governor_offices`, `mateo_vargas`)
- **2** semi-orphan (listed above)

---

## Bucket 3: ARCHIVE/DELETE

### 3.1 One-off dev scripts (no external references, migrations complete)

These are self-referential dev tools that ran their one-off migration and are now historical:

| Script | What it did | Action |
|---|---|---|
| `backfill-draft-prompts.mjs` | Backfilled `## Prompt (Draft)` sections | Move to archive |
| `cleanup-duplicate-text.mjs` | Post-fix for `fix-vst-prompts.mjs` | Move to archive |
| `clean-prompts-for-gen.mjs` | Wrote `missing-characteristics-report.md` | Move to archive |
| `enrich-prompt-descriptions.mjs` | One-off enrichment | Move to archive |
| `extract-biometrics.mjs` | Wrote `biometrics-report.json` | Move to archive |
| `fix-prompt-placeholders.mjs` | Replaced generic placeholder lines | Move to archive |
| `fix-prompt-sources.mjs` | Rewrote `**Source:**` fields | Move to archive |
| `fix-vst-prompts.mjs` | VST fix pass | Move to archive |
| `migrate-lore-layout.mjs` | Migrated `docs/lore/figures/`, `docs/lore/landmarks/` → per-folder | **Migration complete** |
| `migrate-lore-layout-v2.mjs` | Extended migration to all categories | **Complete** |
| `refactor-place-prompts.mjs` | Place-type prompt refactor | Move to archive |
| `refactor-prompts.mjs` | Introduced `STYLE_PREFIX` | One-off, done |
| `update-physical-descriptions.mjs` | Wrote `needs-character-details.md` | Move to archive |
| `generate_ui_assets.py` | Python one-off batch (not part of JS pipeline) | Move to archive |
| `generate-style-test.sh` | Wrote `style-exploration/modern-comic/` | Move to archive |

**Proposed archive location:** `scripts/asset-pipeline/archive/` (superseded by Milestone 01, which moves the one-off scripts here).

### 3.2 Stale output reports

| File | Size | Produced by | Action |
|---|---|---|---|
| `biometrics-report.json` | 80 KB | `extract-biometrics.mjs` | Stale — content has moved to `content/characters/` |
| `missing-characteristics-report.md` | 3 KB | `clean-prompts-for-gen.mjs` | Stale — underlying content moved |
| `needs-character-details.md` | 10 KB | `update-physical-descriptions.mjs` | Stale — underlying content moved |

**Proposed archive location:** the stale reports are **deleted** by Milestone 01 (not archived), since their underlying content now lives in `content/`.

### 3.3 Handoff/continuation prompts (0 code references)

| File | Why delete |
|---|---|
| `references/CONTINUE_ADMIN_ENHANCEMENTS.md` | Multi-chat handoff. 0 code references. Track pending work in GitHub issues. |
| `references/CONTINUE_ASSET_GENERATION_PROMPT.md` | Same pattern. |
| `references/NEXT_STEPS_PROMPT.md` | Same pattern. |

### 3.4 Legacy archives (no runtime value)

| Item | Size | Action |
|---|---|---|
| `references/style-exploration/` (2 .md files) | ~10 KB | **Delete** — `media-pipeline-tiers.md` itself recommends removal. Decision settled. |
| `references/akool-test/MANIFEST.md` | 2 KB | **Delete** — test log, info duplicated in `docs/tutorials/akool-image-cli.md` and `.agents/skills/akool-image-cli/SKILL.md` |
| `references/prompts/prompts/{characters,locations,scenes}.txt` | 3×26 KB | **Delete** — README says "Superseded by registry system". Old guides reference them but old guides are also historical. |
| `references/ui-concepts/ui-concepts/` (49 .prompt.md + 143 PNG drafts + 3 HTML mockups) | 41 MB | **Decision needed:** Since 143 PNGs are now in `content/`, the archive is redundant. The `.prompt.md` files are old-style (MidJourney). HTML mockups are stale. Delete? Keep `.prompt.md` only? |

### 3.5 External `docs/lore/` cleanup (future phase)

> NOTE: Most `docs/lore/` content is duplicated in `content/lore/`. This is a larger, cross-link-sensitive cleanup.

| Subdirectory | Status | Action |
|---|---|---|
| `docs/lore/shared/` | **Empty** (0 files) | Delete |
| `docs/lore/figures/*/` | 131+ folders, deprecated | Delete (lore now in `content/characters/*/`) |
| `docs/lore/landmarks/*/` | Deprecated | Delete (lore now in `content/locations/*/`) |
| `docs/lore/*.md` (city_overview, climate, etc.) | Duplicates of `content/lore/*.md` | Diff then delete duplicates |
| `docs/lore/districts/`, `docs/lore/communities/`, `docs/lore/events/`, `docs/lore/organizations/`, `docs/lore/media/`, `docs/lore/stories/` | Duplicates in `content/lore/` | Diff then delete duplicates. Rewrite cross-link references. |
| `docs/lore/guides/` | Old guides, reference deleted files | Delete (new docs at `docs/lore/PROMPT_GUIDELINES.md`, `docs/lore/assets/references/`) |

---

## Pending Follow-up Items

| Priority | Item | Details |
|---|---|---|
| 🔴 High | `style_prefix.yaml` is registered but never loaded | Either delete or wire `refactor-prompts.mjs` to read it |
| 🟡 Med | Delete `ui-concepts/` archive? | 41 MB. 143 PNGs now duplicated in `content/`. `.prompt.md` are old-style. 3 HTML mockups are stale. |
| 🟡 Med | Rename/archive semi-orphans | 6 PNGs (playa_entrada, laboratorio) in wrong parent folders |
| 🟢 Low | Phase 2 bulk diff of `docs/lore/` vs `content/lore/` | Needs careful diffs and cross-link rewrites |
| 🟢 Low | Clean up old `docs/lore/guides/` references to deleted `.txt` files | Update guide docs or delete them |

---

## Recommendations summary

1. **Move 14 one-off scripts** to `scripts/asset-pipeline/archive/` (per Milestone 01)
2. **Delete 3 stale output reports** (biometrics-report.json, missing-characteristics-report.md, needs-character-details.md)
3. **Delete 3 handoff prompts** (CONTINUE_ADMIN_ENHANCEMENTS.md, CONTINUE_ASSET_GENERATION_PROMPT.md, NEXT_STEPS_PROMPT.md)
4. **Delete style-exploration/ and akool-test/**
5. **Delete or decide on ui-concepts/** (49 .prompt.md + 143 redundant PNGs + 3 HTML mockups, 41 MB)
6. **Delete legacy .txt prompt templates** (references/prompts/prompts/*.txt)
7. **Address the 2 semi-orphan image groups** (6 PNGs that don't match 1:1 entities)
8. **Future: Phase 2 bulk cleanup of docs/lore/** outside assets/ with careful diffs
9. **Future: Verify style_prefix.yaml** — load or delete

---
## Appendix: Tool execution script

The copy was done via:
```python
# /tmp/ui-concepts-migration/copy_assets.py
# See the file for full mapping. Key logic:
# - For each ui-concepts .prompt, copy all PNGs from its drafts/ dir
# - Target: content/<entity>/<slug>/assets/ (or content/lore/shared/<type>/<slug>/assets/)
# - Rename on clash: prefix "legacy_uiconcepts_"
# - Map through slug renames (tile_forest → forest_floor, etc.)
```
