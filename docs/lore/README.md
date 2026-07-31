# Las Flores 2077 — Dev Authoring References

This directory holds **dev/authoring references** for producing Las Flores 2077 content: prompt-writing guidelines, the prompt library, asset-generation guides, and workflow documentation.

It is **not** in-universe lore. In-universe world research (the story bible: timeline, geography, communities, organizations, events, media, governance) lives in `content/lore/` and is surfaced in the admin **Story Bible** browser (`/lore`).

## What Belongs Here

- `guides/` — Authoring guides and workflows
- `PROMPT_GUIDELINES.md` — NVIDIA NIM / FLUX.2 Klein prompt-writing guidelines

## What Does NOT Belong Here

- In-universe world research (timeline, geography, communities, organizations, …) → `content/lore/`
- Per-entity game data (characters, scenes, locations) → `content/<type>/<slug>/`
- Dev-time scripts → `scripts/asset-pipeline/`
- Registries → `scripts/asset-pipeline/registries/`
- Image assets → `content/<type>/<slug>/assets/`

## Directory Structure

```
docs/lore/
├── guides/               # Authoring guides and workflows
│   ├── art_style_exploration/
│   ├── asset_generation_guide/
│   ├── creative_mediums_guide/
│   ├── lore_extraction_framework/
│   ├── prompt_library/
│   ├── templates/
│   ├── ui_ux_design_system/
│   ├── visual_style_translator/
│   └── workflows/
├── PROMPT_GUIDELINES.md  # Prompt-writing guidelines
└── README.md             # This file
```

## Relationship to `content/`

- `docs/lore/` = dev/authoring references (prompts, guides, workflows)
- `content/lore/` = in-universe world research (who, what, when, where) — the admin "Story Bible"
- `content/` = game engine data (YAML + lore + assets per entity)
- `shared/` = schema contracts (Zod types)
- `server/` = sole mediator between content and database

Per-entity files (character lore, location descriptions, scene backgrounds) live in `content/<type>/<slug>/`, not here.
