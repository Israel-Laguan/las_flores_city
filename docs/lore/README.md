# Las Flores 2077 — Lore Bible (Developer Reference)

> **Player-facing lore has moved to [`content/lore/`](../../content/lore/).**
> This folder (`docs/lore/`) now contains only developer tools and workspace.
> 
> - `guides/` — Authoring guides & workflows
> - `assets/` — Developer workspace (ui-concepts, scripts, registries, references, biometric, expressions, outfits)

## 📚 Developer Guides

For **creating new content** (lore, UI, assets), see:

1. **[Lore Extraction Framework](guides/lore_extraction_framework.md)** – Extracted elements for lore, UI, and prompts
2. **[Creative Mediums Guide](guides/creative_mediums_guide.md)** – Visual arts, literature, music applications
3. **[Asset Generation Guide](guides/asset_generation_guide.md)** – Core principles and lore framework
4. **[Templates](guides/templates.md)** – Copy-paste resources for quick creation
5. **[Workflows](guides/workflows.md)** – Step-by-step processes for common tasks
6. **[Prompt Library](guides/prompt_library.md)** – Image/video generation templates
7. **[UI/UX System](guides/ui_ux_design_system.md)** – Visual identity and components

---

## Where to Find Player-Facing Content

All lore content now lives under **[`content/lore/`](../../content/lore/)**:

```
content/lore/
├── organizations/      # Companies, families, movements, civil society, criminal, partnerships
├── media/              # Press & platforms
├── communities/        # Ethnic/cultural community profiles
├── events/             # Major historical events
├── conflicts/          # Lore conflict tracking
├── stories/            # Narrative vignettes
├── districts/          # District profiles
├── geography.md        # Dimensions, elevation, travel distances
├── timeline.md         # Historical timeline (2033–2077)
├── city_overview.md    # City-wide overview
└── assets/             # Generated assets (ui-concepts, registries, biometric, etc.)
```

Per-entity game data (characters, scenes, locations, overlays, mysteries) lives in their respective `content/` directories:
```
content/characters/<slug>/    # Character YAML + lore + prompt + assets/
content/locations/<slug>/     # Location YAML + lore + prompt + assets/
content/scenes/<slug>/        # Scene YAML + lore + assets/
content/overlays/<slug>/      # Overlay YAML + lore + assets/
content/mysteries/<slug>/     # Mystery YAML + lore + assets/
```

---

## Quick Reference — Power Map

### 🇪🇺 European / USA Interests
| Entity | Type | Key Function |
|---|---|---|
| [Van der Meer Mining](organizations/companies/van_der_meer_mining/van_der_meer_mining.md) | Mining (GLC subsidiary) | Lithium extraction, 2 mines |
| [Neptune's Haven B.V.](organizations/companies/neptunes_haven/neptunes_haven.md) | Port Operations | Dutch pier management |
| [EnerGlobe Inc.](organizations/companies/energlobe/energlobe.md) | Energy Corp | Renewable/sustainable energy |
| [EBF](organizations/partnerships/las_flores_dam_authority/las_flores_dam_authority.md) | Water/Energy | Manages San Miguel Dam |

### 🇨🇳 Chinese State / LW Group
| Entity | Type | Key Function |
|---|---|---|
| [LW Group](organizations/companies/overview/overview.md) | Conglomerate | Port, airport, energy, mining |
| [Minera Estrella](organizations/companies/minera_estrella/minera_estrella.md) | Mining JV | Primary lithium extraction |
| [Jade Dragon Ports](organizations/companies/jade_dragon_ports/jade_dragon_ports.md) | Port Logistics | Port infrastructure PPP |
| [Great Dragon Energy](organizations/companies/great_dragon_energy/great_dragon_energy.md) | Energy | Rio Grande Dam |
| [Electra Battery Factory](organizations/companies/electra_battery_factory/electra_battery_factory.md) | Manufacturing | Lithium-to-battery pipeline |

### 🇨🇳 Independent Chinese Companies
| Entity | Type | Key Function |
|---|---|---|
| [Zephyr Renewables](organizations/companies/zephyr_renewables/zephyr_renewables.md) | Renewables | Solar & wind installations |
| [Autopia Motors](organizations/companies/autopia_motors/autopia_motors.md) | EV Manufacturer | AI-enhanced electric vehicles |
| [Lotus Capital](organizations/companies/lotus_capital/lotus_capital.md) | Investment Firm | VC for local startups |
| [NetWave](organizations/companies/netwave/netwave.md) | Telecom | High-speed internet |
| [AquaDragon](organizations/companies/aquadragon/aquadragon.md) | Water Management | Water distribution |
| [Jade Phoenix Tech](organizations/companies/jade_phoenix_technologies/jade_phoenix_technologies.md) | Mining Automation | AI/robots for mines |
| [Dragon Phoenix Trading](organizations/companies/dragon_phoenix_trading/dragon_phoenix_trading.md) | Import/Export | China–Las Flores trade |

### 🏛️ Public-Private Partnerships
| Entity | Partners | Key Function |
|---|---|---|
| [Dam Authority](organizations/partnerships/las_flores_dam_authority/las_flores_dam_authority.md) | Great Dragon Energy + EBF + Governor | Water & hydroelectric |
| [Airport Authority](organizations/partnerships/las_flores_airport_authority/las_flores_airport_authority.md) | LFAA + LW Logistics | Air cargo & travel |

### 📰 Media & Platforms
| Entity | Type | Notes |
|---|---|---|
| [El Informador](media/press/el_informador/el_informador.md) | Newspaper | Voice of marginalized communities |
| [Las Flores Chronicle](media/press/las_flores_chronicle/las_flores_chronicle.md) | Magazine | Elite gossip & society |
| [Social Media Ecosystem](media/social_media_ecosystem/social_media_ecosystem.md) | Overview | Comprehensive platform analysis |
| [LinkPulse](media/platforms/linkpulse/linkpulse.md) | Social Media | European intellectual vibe |
| [PlayNetix](media/platforms/playnetix/playnetix.md) | Streaming/Gaming | Gamified youth platform |
| [ShénShǒu 神兽](media/platforms/shenshou/shenshou.md) | Social Commerce | Chinese AR + e-commerce |
| [Vitrina](media/platforms/vitrina/vitrina.md) | Video/Image Sharing | Latin American community platform |
| [VoxStream](media/platforms/voxstream/voxstream.md) | Professional Streaming | European/American serious content |

### ✊ Civil Organizations
| Entity | Focus | Leader |
|---|---|---|
| [COFAVIC](organizations/civil_society/cofavic/cofavic.md) | Human Rights / Victims | Laura Rodriguez |
| [Fundación Esperanza](organizations/civil_society/fundacion_esperanza/fundacion_esperanza.md) | Sustainable Development | Board-led |
| [GreenWatch](organizations/civil_society/greenwatch/greenwatch.md) | Environmental Advocacy | Maria Lopez |
| [CJS](organizations/civil_society/cjs/cjs.md) | Indigenous Rights | Ana Ramirez |
| [Músicos en Acción](organizations/civil_society/musicos_en_accion/musicos_en_accion.md) | Music Activism | Sofia Diaz |

### 🔪 Criminal Organizations

| Entity | Type | Leader |
|---|---|---|
| [Flowers Syndicate](organizations/criminal/flowers_syndicate/flowers_syndicate.md) | Street Gang / Criminal Syndicate | Dong van der Meer |

### 🌍 Global Movements
| Entity | Scope | Status in 2077 |
|---|---|---|
| [Humanity First](organizations/movements/humanity_first/overview/overview.md) | Global movement | Deeply embedded in Las Flores culture |

### 👨‍👩‍👧‍👦 Communities & Families
| Entry | Type |
|---|---|
| [Chinese Community](communities/chinese_community.md) | Cultural community profile |
| [Dutch Community](communities/dutch_community.md) | Cultural community profile |
| [Van der Meer Family](organizations/families/van_der_meer/van_der_meer.md) | Dynasty profile |
| [Dong van der Meer](figures/dong_van_der_meer.md) | Key figure (criminal) |
| [Constitution Backstory](figures/constitution_backstory.md) | Historical event |
| [Evelyn Ruthenberg](figures/evelyn_ruthenberg.md) | Whistleblower, Luz del Rio engineer |
| [Sofia Duarte](figures/sofia_duarte.md) | Councilwoman, Business Coalition, corrupt politician |

### 👥 Alex's Friends (The 2077 Core Group)

| Entry | Type | Role | Status |
|---|---|---|---|
| [Miguel Jhonson](figures/miguel_jhonson.md) | Key Figure | Logistics, Infrastructure | Active |
| [Carlos Lacan](figures/carlos_lacan.md) | Key Figure | Technical Expert | Deceased (2077) |
| [Ana Kim](figures/ana_kim.md) | Key Figure | Research, Conscientious Objector | Active |
| [Isabella Vargas](figures/isabella_vargas.md) | Key Figure | Intelligence, Analysis | Active |
| [The 2077 Core Group](figures/gdd_friends.md) | Group Overview | All | Mixed |
| [Yara Rossi](figures/yara_rossi.md) | Businesswoman-activist, assassinated 2059 |
| [Lina Kim](figures/lina_kim.md) | Investigative journalist, La Prensa |
| [Liu Fang](figures/liu_fang.md) | Whistleblower, disappeared 2055 |
| [Zheng Wuhao](figures/zheng_wuhao.md) | Minera Estrella facility supervisor |
| [Míngzé Luo](figures/mingze_luo.md) | President of Minera Estrella |
| [Dr. Wei Zhang](figures/dr_wei_zhang.md) | Scientist, restoration partner, defector |
| [Dr. Maria Hernandez](figures/dr_maria_hernandez.md) | Las Flores University professor |
| [Sofia Ramirez](figures/sofia_ramirez.md) | Lead prosecutor at the trial |
| [Karla](figures/karla.md) | Murdered activist, evidence carrier |
| [Cecilia Perez](figures/cecilia_perez.md) | Safety auditor & researcher, murdered 2049 |
| [Javier Mendoza](../figures/javier_mendoza.md) | Intimidated safety inspector |
| [Alicia Quevedo](../figures/alicia_quevedo.md) | Second Governor (2041–2045), PLF |
| [Elena Torres](../figures/elena_torres.md) | Sustainability Lead, LW Group; former translator, crisis PR |

---

## 📝 How to Add New Characters vs. Figures

When creating or documenting a new person in the Las Flores 2077 universe, it is critical to understand the distinction between the **Lore Wiki** and the **Game Engine**. 

Depending on the character's role, you must create files in the appropriate directories. **Never create a `docs/lore/characters/` directory.**

### 1. The Lore Wiki: `docs/lore/figures/`
If you are adding a person to the worldbuilding lore—whether they are a historical figure, a politician, a corporate executive, or a notable citizen—their profile goes here.
- **Path:** `content/lore/figures/<name>.md`
- **Purpose:** Deep lore reference, backstory, metadata, and cross-linking for writers and designers.
- **Format:** Markdown file containing a tags block (e.g., `> Tags: #figure #faction`), overview, background, relationships, and legacy. 
- **Rule:** Always use the `#figure` tag in the metadata block, never `#character`.

### 2. The Game Engine: `content/characters/`
If the person is an **active NPC** that the player will interact with in the game engine (e.g., in dialogues, phone overlays, or events), they *must* have character files in the `content/` pipeline.
- **Paths:** 
  - `content/characters/char_<name>.yaml` (Structured data: id, name, metadata, faction)
  - `content/characters/char_<name>.md` (Narrative description ingested by the engine)
- **Purpose:** Data ingestion for the dialogue and event systems.
- **Format:** The `.md` file here should be purely narrative (no tag blocks like in the lore wiki), formatted to match other `content/characters/*.md` files.

### 3. The Dual-Track Character
For major NPCs who are *both* deeply rooted in the lore and active in the game (e.g., Evelyn Ruthenberg, Dr. Wei Zhang, Ana Ramirez), you must create **all three files**:
1. `content/lore/figures/<name>.md` (For worldbuilding and linking)
2. `content/characters/char_<name>.yaml` (For the engine)
3. `content/characters/char_<name>.md` (For the engine)

*Note: While the narrative text may be similar or identical across the two `.md` files, they serve different systems and are NOT duplicates.*

---

## Cross-Reference Tags

Use these tags when referencing lore in dialogue YAML or vault entries:

- `#lw_group` — anything related to the Chinese conglomerate
- `#dutch_interest` — Van der Meer / GLC / Neptune's Haven
- `#civil_society` — COFAVIC, CJS, GreenWatch, etc.
- `#humanity_first` — the global movement
- `#media` — newspapers, platforms, journalists
- `#criminal` — Dong van der Meer, Flowers Syndicate
- `#lithium` — mining operations, environmental impact
- `#ppp` — public-private partnerships
- `#great_lithium_leak` — the 2052 disaster and cover-up
- `#cover_up` — corporate and political cover-up
- `#trial` — Minera Estrella tribunal
- `#restoration` — cleanup and rehabilitation efforts
---

## Lore folder convention

### Figures
Each character/figure lives in its own folder:

```
content/lore/figures/<name>/
  <name>.md          # lore / description
  <name>.prompt.md   # generated asset prompt
  assets/            # generated images, optional
```

Example: `content/lore/figures/aisha_al_sayed/aisha_al_sayed.md`

### Landmarks
Each landmark lives inside its owning district, organized as:

```
content/lore/districts/<district>/landmarks/<name>/
  <name>.md
  <name>.prompt.md
  assets/
```

Example: `content/lore/districts/city/landmarks/plaza_de_la_constitucion/plaza_de_la_constitucion.md`

Cross-district natural spaces (rivers, mountains, forests) are placed in the
primary owning district with `adjacent_districts` noted in frontmatter.

### Why this layout?
- Landmarks nest in their district (`districts/<d>/landmarks/`), which makes
  district → scene → landmark a natural hierarchy.
- Keeps related files together (lore, prompt, assets).
- Matches the recursive discovery used by `docs/lore/assets/scripts/generate-drafts-unified.mjs`.
- Matches the per-character asset routing already expected by the draft generator.
