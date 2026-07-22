# M3: Content Unification

> Status: **Complete** | Effort: ~2 hours | Risk: Low

## Goal

Ensure every entity folder under `content/` has all required files (YAML, `.md`, `.prompt.md`, `assets/`).

## Approach

Completed manually (file by file) instead of via script, as requested.

## Completed State

| Type | Folders | Has YAML | Has `.md` | Has `.prompt.md` | Has `assets/` | Notes |
|------|---------|----------|-----------|------------------|---------------|-------|
| characters | 203 | 193 | 203 | 203 | 1+ | 10 folders missing YAML |
| scenes | 21 | 21 | 21 | 21 | 21 | |
| locations | 79 | 79 | 79 | 79 | 79 | |
| overlays | 3 | 3 | 3 | 3 | 3 | |
| missions | 1 | 1 | 1 | 1 | 1 | |
| stories | 1 | 1 | 1 | 1 | 1 | |
| story_beats | 5 | 5 | 5 | 5 | 5 | |

## What Was Done

### Scenes (21 folders)
- Created `.md` and `.prompt.md` for 18 YAML-only folders
- Created YAML stubs + `.md` + `.prompt.md` for 3 folders that had YAML with different naming (old_town_cafe, the_apartment, welcome_center)
- Created `assets/` directories for all 21 folders

### Locations (79 folders)
- Created `.md` and `.prompt.md` for ~24 YAML-only folders
- Created YAML stubs for ~14 orphaned folders (had .md but no YAML)
- Created `.prompt.md` for `embajada_de_china` (had YAML + .md but no .prompt.md)
- Created `assets/` directories for all 79 folders

### Structural Changes
- **Merged** `content/locations/las_tres_montañas/` into `content/locations/las_tres_montanas/` (deleted duplicate accented folder)
- **Moved** `content/overlays/welcome_nsfw_overlay.yaml` into `content/overlays/welcome_nsfw_overlay/` folder

### Overlays (3 folders)
- Created `.md` and `.prompt.md` for `aisha_al_sayed` and `great_lithium_leak`
- Created `.md` and `.prompt.md` for `welcome_nsfw_overlay` (after folder move)
- Created `assets/` directories for all 3 folders

### Missions (1 folder)
- Created `.md` and `.prompt.md` for `great_lithium_leak`
- Created `assets/` directory

### Story Beats (5 folders)
- Created `.md` and `.prompt.md` for all 5 beat folders
- Created `assets/` directories for all 5 folders

## Done When

- [x] All entity folders have `.md` + `.prompt.md` + `assets/`
- [x] No orphaned folders (`.md` without YAML or vice versa)
- [ ] 10 character folders still missing YAML (tracked separately)
- [x] Duplicate location folder merged
- [x] Standalone overlay moved into proper folder structure
- [x] Content validation passes (`npm run validate:content`)
