# Las Flores 2077 — World-Level Research

This directory contains **world-level research** for the Las Flores 2077 universe. It is NOT the game engine content — that lives in `content/`.

## What Belongs Here

- **Timeline** — Historical events (2033–2077)
- **Geography** — City layout, districts, elevation, travel
- **Communities** — Cultural and ethnic community profiles
- **Governance** — Political structures, councils, parties
- **Organizations** — Companies, movements, civil society, criminal groups
- **Media** — Press, platforms, journalists
- **Events** — Major historical events
- **Guides** — Authoring guides and workflows

## What Does NOT Belong Here

- Per-entity game data (characters, scenes, locations) → `content/<type>/<slug>/`
- Dev-time scripts → `scripts/asset-pipeline/`
- Registries → `scripts/asset-pipeline/registries/`
- Image assets → `content/<type>/<slug>/assets/`

## Directory Structure

```
docs/lore/
├── communities/          # Cultural community profiles
├── guides/               # Authoring guides and workflows
├── media/                # Press, platforms, journalists
├── organizations/        # Companies, movements, civil society
├── governance/           # Political structures
├── geography.md          # City layout and geography
├── timeline.md           # Historical timeline
└── README.md             # This file
```

## Relationship to `content/`

- `docs/lore/` = world-level research (who, what, when, where)
- `content/` = game engine data (YAML + lore + assets per entity)
- `shared/` = schema contracts (Zod types)
- `server/` = sole mediator between content and database

Per-entity files (character lore, location descriptions, scene backgrounds) live in `content/<type>/<slug>/`, not here.
