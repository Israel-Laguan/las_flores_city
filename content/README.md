# Las Flores 2077 — Content Directory

This directory is the **dev-mode file database** for all game entities. It contains data only (YAML + markdown + image assets) — no TypeScript, no scripts, no compiled code.

The server is the **sole mediator** between `content/` and the database. Admin reads content through server endpoints only.

## Directory Structure

Every entity has its own folder under `content/<type>/<slug>/`:

```
content/
├── characters/<slug>/     # Character YAML + lore + prompt + assets/
├── scenes/<slug>/         # Scene YAML + lore + assets/
├── locations/<slug>/      # Location YAML + lore + assets/
├── overlays/<slug>/       # Overlay YAML + lore + assets/
├── mysteries/<slug>/      # Mystery YAML + lore + assets/
├── dialogues/             # Dialogue trees (flat YAML files)
├── vault/                 # Collectible items and clues
├── gigs/                  # Side jobs and commissions
├── shop/                  # Cosmetic and functional items
├── maps/                  # District tile map definitions
└── story_beats.yaml       # Narrative beat registry (single file)
```

## Per-Entity Folder Layout

Each entity folder contains:

```
content/characters/<slug>/
├── char_<slug>.yaml       # Engine schema (id, name, metadata, paths)
├── <slug>.md              # Human narrative / lore
├── <slug>.prompt.md       # Image generation prompt
└── assets/                # Flat directory, no sub-folders
    ├── <slug>__default.png    # Pre-existing default asset
    ├── <slug>__<timestamp>.png  # Generated drafts
    └── ...                     # User-dropped files (any name)
```

### Asset Selection

The YAML's `asset_paths.<field>` field selects which file in `assets/` is the canonical local file:

```yaml
asset_paths:
  portrait: <slug>__default.png    # local selected asset
```

The chosen file is published to MinIO (object key = the local filename, no `.dev`/`.staging` suffix) and the resulting URL is stored in the `portrait_urls` JSONB array (on `characters`, and analogous arrays on `scenes` / `locations`) as an entry tagged `label: 'dev'`. Promotion to staging/production appends `label: 'staging'` / `label: 'production'` entries to the same array. The game client resolves the right URL per environment from these `label` entries. Only the selected file is uploaded to MinIO.

## Content Types

### Characters
Define NPCs with personality, appearance, and dialogue options.

```yaml
id: "char_unique_id"
name: "Character Name"
title: "Character Title (optional)"
description: "Character description"
metadata:
  type: "human"
  role: "npc"
  faction: "TODO: Add faction"
  personality: "TODO: Add personality"
lore_path: <slug>.md
narrative_path: <slug>.md
asset_paths:
  portrait: <slug>__default.png
```

### Scenes
Location definitions with available dialogues and ambiance settings.

```yaml
id: "scene_unique_id"
name: "Scene Name"
description: "Scene description"
district: "District Name"
available_dialogues: []
lore_path: <slug>.md
asset_paths:
  background: <slug>__default.png
```

### Locations
Location metadata upserted into the `scenes` table.

### Dialogues
Interactive conversation trees with choices, conditions, and effects.

### Overlays
Modifications to existing dialogues (e.g., NSFW content).

### Mysteries
Quest lines with status tracking and time limits.

## Prompt Variants (Image-to-Image)

Each `.prompt.md` file is a **two-stage pipeline document**: a base image (text-to-image) plus variants (image-to-image edits against the base). This maps to `akool-cli`'s two modes.

### Stage 1 — Base (text-to-image)
The canonical image. Generates `<slug>__default.png`. This locks the character's face and identity.

### Stage 2 — Variants (image-to-image)
Edit prompts that run against the base image URL. Each variant in the `.prompt.md` file has:
- **slug** — maps to a filename in `assets/`
- **edit_prompt** — instruction for `flux-kontext-dev`
- **scale** — aspect ratio override (default: 3:4 for portraits, 16:9 for locations)

### Asset Naming

```
assets/
  <slug>__default.png        # base image
  <slug>__<variant_slug>.png  # variant (e.g. young, meeting, formal)
```

### YAML `asset_paths`

```yaml
asset_paths:
  portrait: <slug>__default.png           # local file
  portrait_base_url: https://...          # persistent URL (MinIO/CDN)
  portrait_young: <slug>__young.png       # variant asset
  portrait_meeting: <slug>__meeting.png   # variant asset
```

### Generation Workflow

```bash
# 1. Generate base image
akool-cli image generate --prompt "<base_prompt>" --scale 3:4 --wait

# 2. Generate variant from base
akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale 3:4 --wait

# 3. Or use the helper script
./scripts/generate-variants.sh content/characters/<slug>
./scripts/generate-variants.sh content/characters/<slug> --variant young
./scripts/generate-variants.sh content/characters/<slug> --dry-run
```

**Cost:** 8 credits per image. A character with 4 variants = 40 credits total.

## Validation

Before committing content changes, validate your YAML files:

```bash
npm run validate:content
```

Or visit `http://localhost:3001/validation` in the admin UI.

## Migration

To push content to the database:

```bash
npm run migrate
```

Or visit `http://localhost:3001/migration` in the admin UI.

## Best Practices

1. **Per-folder layout**: Every entity gets its own folder with YAML + lore + assets together
2. **Relative paths**: `lore_path`, `narrative_path`, and `asset_paths` are relative to the YAML's directory
3. **Flat assets**: No sub-folders in `assets/` — all files are at the same level
4. **Asset naming**: Generated drafts use `<slug>__<ISO-timestamp>.png` for uniqueness
5. **Selection in YAML**: Mark which asset is selected in `asset_paths.<field>`, not in the filename
