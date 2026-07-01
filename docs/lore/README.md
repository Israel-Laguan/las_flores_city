# Las Flores 2077 — Lore Bible

> Worldbuilding reference for the Las Flores 2077 universe.
> This folder is the **source of truth** for narrative consistency.
> Content here informs dialogue, mysteries, vault entries, and character design.

---

## 📚 GUIDES & DOCUMENTATION

For **creating new content** (lore, UI, assets), see the **[Guides](#-guides--documentation) section below**.

### 🎯 Quick Start for Contributors
1. **Read the [Lore Extraction Framework](guides/lore_extraction_framework.md)** – Extracted elements for lore, UI, and prompts
2. **Explore [Creative Mediums Guide](guides/creative_mediums_guide.md)** – Visual arts, literature, music applications
3. **Read the [Asset Generation Guide](guides/asset_generation_guide.md)** – Core principles and lore framework
4. **Use the [Templates](guides/templates.md)** – Copy-paste resources for quick creation
5. **Follow the [Workflows](guides/workflows.md)** – Step-by-step processes for common tasks
6. **Reference the [Prompt Library](guides/prompt_library.md)** – Image/video generation templates
7. **Design with the [UI/UX System](guides/ui_ux_design_system.md)** – Visual identity and components

---

## Directory Structure

```
docs/lore/
├── guides/                 # Creation guides & workflows (NEW!)
│   ├── asset_generation_guide.md  # Core principles & lore framework
│   ├── ui_ux_design_system.md      # Visual identity & components
│   ├── prompt_library.md           # Image/video generation templates
│   ├── workflows.md                # Step-by-step processes
│   ├── templates.md                # Copy-paste resources & cheat sheets
│   ├── lore_extraction_framework.md # Extracted elements for lore/UI/prompts
│   └── creative_mediums_guide.md   # Visual arts, literature, music guides
│
├── assets/                # Generated content (NEW!)
│   └── prompts/            # Curated prompt collections
│       ├── locations.txt   # Location-specific prompts
│       ├── characters.txt  # Character portrait prompts
│       └── scenes.txt      # Key story moment prompts
│
├── companies/
│   ├── european/          # Dutch/European investor entities
│   ├── lw_group/          # Chinese state-linked conglomerate
│   └── chinese/           # Independent Chinese companies
├── partnerships/          # Public-Private Partnerships (PPPs)
├── media/                 # Newspapers & journalism
├── platforms/             # Social media (non-interactive, referenced in ads/lore)
├── organizations/         # Civil society & activist groups
├── humanity_first/        # Dedicated folder — global movement
├── communities/           # Ethnic/cultural community profiles
├── families/              # Powerful family dynasties
├── figures/               # Key individual profiles
├── districts/             # City district profiles (11 districts)
├── landmarks/             # Detailed landmark profiles by district
├── stories/               # Narrative vignettes and character stories
├── conflicts/             # Lore conflict tracking and resolution log
├── geography.md           # Dimensions, elevation, travel distances
├── climate.md             # Weather seasons and vegetation
├── demography.md          # Population, ethnicity, socioeconomic data
├── events/                # Major historical events
├── transportation.md      # Metro, buses, streets, transit hubs
├── timeline.md            # Historical timeline (2033–2077)
└── city_overview.md       # City-wide overview
```

---

## Quick Reference — Power Map

### 🇪🇺 European / USA Interests
| Entity | Type | Key Function |
|---|---|---|
| [Van der Meer Mining](companies/european/van_der_meer_mining.md) | Mining (GLC subsidiary) | Lithium extraction, 2 mines |
| [Neptune's Haven B.V.](companies/european/neptunes_haven.md) | Port Operations | Dutch pier management |
| [EnerGlobe Inc.](companies/european/energlobe.md) | Energy Corp | Renewable/sustainable energy |
| [EBF](partnerships/las_flores_dam_authority.md) | Water/Energy | Manages San Miguel Dam |

### 🇨🇳 Chinese State / LW Group
| Entity | Type | Key Function |
|---|---|---|
| [LW Group](companies/lw_group/overview.md) | Conglomerate | Port, airport, energy, mining |
| [Minera Estrella](companies/lw_group/minera_estrella.md) | Mining JV | Primary lithium extraction |
| [Jade Dragon Ports](companies/lw_group/jade_dragon_ports.md) | Port Logistics | Port infrastructure PPP |
| [Great Dragon Energy](companies/lw_group/great_dragon_energy.md) | Energy | Rio Grande Dam |
| [Electra Battery Factory](companies/lw_group/electra_battery_factory.md) | Manufacturing | Lithium-to-battery pipeline |

### 🇨🇳 Independent Chinese Companies
| Entity | Type | Key Function |
|---|---|---|
| [Zephyr Renewables](companies/chinese/zephyr_renewables.md) | Renewables | Solar & wind installations |
| [Autopia Motors](companies/chinese/autopia_motors.md) | EV Manufacturer | AI-enhanced electric vehicles |
| [Lotus Capital](companies/chinese/lotus_capital.md) | Investment Firm | VC for local startups |
| [NetWave](companies/chinese/netwave.md) | Telecom | High-speed internet |
| [AquaDragon](companies/chinese/aquadragon.md) | Water Management | Water distribution |
| [Jade Phoenix Tech](companies/chinese/jade_phoenix_technologies.md) | Mining Automation | AI/robots for mines |
| [Dragon Phoenix Trading](companies/chinese/dragon_phoenix_trading.md) | Import/Export | China–Las Flores trade |

### 🏛️ Public-Private Partnerships
| Entity | Partners | Key Function |
|---|---|---|
| [Dam Authority](partnerships/las_flores_dam_authority.md) | Great Dragon Energy + EBF + Governor | Water & hydroelectric |
| [Airport Authority](partnerships/las_flores_airport_authority.md) | LFAA + LW Logistics | Air cargo & travel |

### 📰 Media & Platforms
| Entity | Type | Notes |
|---|---|---|
| [El Informador](media/el_informador.md) | Newspaper | Voice of marginalized communities |
| [Las Flores Chronicle](media/las_flores_chronicle.md) | Magazine | Elite gossip & society |
| [Social Media Ecosystem](media/social_media_ecosystem.md) | Overview | Comprehensive platform analysis |
| [LinkPulse](platforms/linkpulse.md) | Social Media | European intellectual vibe |
| [PlayNetix](platforms/playnetix.md) | Streaming/Gaming | Gamified youth platform |
| [ShénShǒu 神兽](platforms/shenshou.md) | Social Commerce | Chinese AR + e-commerce |
| [Vitrina](platforms/vitrina.md) | Video/Image Sharing | Latin American community platform |
| [VoxStream](platforms/voxstream.md) | Professional Streaming | European/American serious content |

### ✊ Civil Organizations
| Entity | Focus | Leader |
|---|---|---|
| [COFAVIC](organizations/cofavic.md) | Human Rights / Victims | Laura Rodriguez |
| [Fundación Esperanza](organizations/fundacion_esperanza.md) | Sustainable Development | Board-led |
| [GreenWatch](organizations/greenwatch.md) | Environmental Advocacy | Maria Lopez |
| [CJS](organizations/cjs.md) | Indigenous Rights | Ana Ramirez |
| [Músicos en Acción](organizations/musicos_en_accion.md) | Music Activism | Sofia Diaz |

### 🔪 Criminal Organizations

| Entity | Type | Leader |
|---|---|---|
| [Flowers Syndicate](organizations/flowers_syndicate.md) | Street Gang / Criminal Syndicate | Dong van der Meer |

### 🌍 Global Movements
| Entity | Scope | Status in 2077 |
|---|---|---|
| [Humanity First](humanity_first/overview.md) | Global movement | Deeply embedded in Las Flores culture |

### 👨‍👩‍👧‍👦 Communities & Families
| Entry | Type |
|---|---|
| [Chinese Community](communities/chinese_community.md) | Cultural community profile |
| [Dutch Community](communities/dutch_community.md) | Cultural community profile |
| [Van der Meer Family](families/van_der_meer.md) | Dynasty profile |
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
- **Path:** `docs/lore/figures/<name>.md`
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
1. `docs/lore/figures/<name>.md` (For worldbuilding and linking)
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