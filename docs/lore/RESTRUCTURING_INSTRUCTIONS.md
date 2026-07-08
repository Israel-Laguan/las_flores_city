# Lore Directory Restructuring — COMPLETED

> **Status:** ✅ Restructuring complete on 2026-07-08. This file is now an archival record of what was done, not active instructions.

---

## Summary

The `docs/lore/` directory was reorganized to consolidate overlapping categories into a cleaner, more effective grouping. All moves, cross-references, prompt files, scripts, and documentation have been updated.

---

## Resulting Structure

```
docs/lore/
├── organizations/                         # Power groups hub
│   ├── companies/                         # 14 companies (flattened — no origin sub-dirs)
│   │   ├── aquadragon/
│   │   ├── autopia_motors/
│   │   ├── dragon_phoenix_trading/
│   │   ├── jade_phoenix_technologies/
│   │   ├── lotus_capital/
│   │   ├── netwave/
│   │   ├── zephyr_renewables/
│   │   ├── energlobe/
│   │   ├── neptunes_haven/
│   │   ├── van_der_meer_mining/
│   │   ├── electra_battery_factory/
│   │   ├── great_dragon_energy/
│   │   ├── jade_dragon_ports/
│   │   ├── minera_estrella/
│   │   ├── luz_del_rio/                    # Energy company
│   │   └── overview/                       # LW Group overview
│   ├── families/
│   │   └── van_der_meer/
│   ├── movements/
│   │   └── humanity_first/                 # Internal structure preserved
│   │       ├── overview/
│   │       ├── rules/
│   │       ├── rogue_incidents/
│   │       ├── timeline_influence/
│   │       ├── timeline_founding/
│   │       └── timeline_growth/
│   ├── civil_society/
│   │   ├── cofavic/
│   │   ├── cjs/
│   │   ├── greenwatch/
│   │   ├── fundacion_esperanza/
│   │   └── musicos_en_accion/
│   ├── criminal/
│   │   └── flowers_syndicate/
│   └── partnerships/
│       ├── las_flores_airport_authority/
│       └── las_flores_dam_authority/
├── media/                                 # Information channels
│   ├── press/
│   │   ├── el_informador/
│   │   ├── el_grito_estudiantil/
│   │   ├── la_prensa/
│   │   └── las_flores_chronicle/          # Canonical copy
│   ├── platforms/
│   │   ├── linkpulse/
│   │   ├── playnetix/
│   │   ├── shenshou/
│   │   ├── vitrina/
│   │   └── voxstream/
│   ├── social_media_ecosystem/             # Overview doc
│   └── README.md
├── communities/                            # UNCHANGED (+ quechua/)
│   ├── african_american_community/
│   ├── afro_latino_community/
│   ├── chinese_community/
│   ├── dutch_community/
│   ├── indigenous_community/
│   ├── international_community/
│   ├── latin_american_community/
│   ├── mountain_communities/
│   └── quechua/                            # ← moved from organizations/
└── (figures/, districts/, landmarks/, stories/, conflicts/, events/, guides/, assets/ — UNCHANGED)
```

---

## Changes Made

### 1. Directory moves
- `companies/{chinese,european,lw_group}/*` → `organizations/companies/*` (flattened)
- `families/van_der_meer/` → `organizations/families/van_der_meer/`
- `humanity_first/` → `organizations/movements/humanity_first/` (internal sub-dirs preserved)
- `partnerships/*` → `organizations/partnerships/*`
- `platforms/` → `media/platforms/`
- `media/{el_informador,el_grito_estudiantil,la_prensa,las_flores_chronicle}` → `media/press/`
- `organizations/{cofavic,cjs,greenwatch,fundacion_esperanza,musicos_en_accion}` → `organizations/civil_society/`
- `organizations/flowers_syndicate` → `organizations/criminal/`
- `organizations/luz_del_rio` → `organizations/companies/luz_del_rio`
- `organizations/quechua` → `communities/quechua`
- `organizations/las_flores_chronicle` (duplicate) → removed after verification

### 2. Cross-references
- ~40 files updated to use nested paths (e.g., `organizations/companies/netwave.md` → `organizations/companies/netwave/netwave.md`)
- Files inside `organizations/` had relative path depths adjusted (e.g., `../organizations/companies/...` → `../../companies/...`)
- Old `lw_group/`, `chinese/`, `european/` origin sub-directory references removed

### 3. Scripts
- `docs/lore/assets/scripts/generate-drafts-unified.mjs` — removed `docs/lore/companies` from `PROMPT_ROOTS`
- `docs/lore/assets/scripts/migrate-lore-layout-v2.mjs` — updated `CATEGORIES` to include `organizations` and `media` (no longer top-level `companies`, `families`, `partnerships`, `platforms`, `humanity_first`)
- `docs/lore/assets/scripts/fix-prompt-sources.mjs` — same `CATEGORIES` update
- All 3 scripts pass `node --check`

### 4. Documentation
- `docs/lore/README.md` — directory structure tree and Power Map link tables updated
- `docs/lore/media/README.md` — platform references updated
- `docs/lore/assets/scripts/RUN_GENERATION_PROMPT.md` — removed stale `docs/lore/companies/` reference

### 5. Origin metadata
- Each company `.md` file documents its origin/affiliation in content (e.g., `**Origin:** Chinese company`, `**Origin:** Netherlands`, `**Parent:** LW Group consortium`)

---

## Verification

| Check | Status |
|---|---|
| No old path references (grep returns 0 results) | ✅ |
| Old top-level dirs removed (`companies`, `families`, `humanity_first`, `partnerships`, `platforms`) | ✅ |
| Directory structure matches target | ✅ |
| All 3 scripts pass `node --check` | ✅ |
| Company origin metadata documented in content | ✅ |
| Prompt file `**Source:**` paths correct | ✅ |
