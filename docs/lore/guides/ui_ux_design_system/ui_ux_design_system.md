# LAS FLORES: UI/UX DESIGN SYSTEM

> **Version:** 1.0  
> **Purpose:** Visual identity, navigation, and component library for Las Flores 2077 assets.  
> **Audience:** UI/UX designers, frontend developers, world-builders.  

---

## 🎯 TABLE OF CONTENTS

1. [Visual Identity Guide](#visual-identity-guide)
2. [Navigation Architecture](#navigation-architecture)
3. [UI Component Library](#ui-component-library)
4. [Mood & Atmosphere Guide](#mood--atmosphere-guide)
5. [UI Workflow Examples](#ui-workflow-examples)

---

## 🎨 VISUAL IDENTITY GUIDE

*How to translate lore into visual design.*

| **Element** | **Las Flores Aesthetic** | **Do** | **Don't** |
|-------------|--------------------------|--------|-----------|
| **Colors** | Faded pastels (poor) + stark monochrome (elite) + industrial steel (Luz del Río) + sickly green (river) | Use **contrast** to show duality. | Avoid pure black/white; always add **texture**. |
| **Typography** | **Rounded sans-serif** (poor/middle class) + **sharp serif** (elite) + **monospace** (tech/AI) | Mix fonts to **show class divide**. | Don't use more than **3 fonts**. |
| **Textures** | **Worn paper** (archives), **rusted metal** (industry), **mist** (foothills), **water stains** (river) | Layer textures for **depth**. | Avoid **clean, pristine** surfaces. |
| **Lighting** | **Dawn/dusk** (hope), **streetlights** (warmth), **industrial glow** (cold), **flickering** (unstable) | Use light to **guide the eye**. | Avoid **harsh noon sunlight**. |
| **Icons/Symbols** | **Cableways** (connection), **turbines** (power), **faded murals** (heritage), **contaminated water droplets** (decay) | Use **symbols with meaning**. | Avoid **generic icons**. |

---

### 🔹 COLOR PALETTE

#### Primary Colors (Poor/Middle Class)
| Color | Hex | Usage | Example |
|-------|-----|-------|---------|
| Faded Teal | `#4A7C8A` | Río de las Flores (contaminated) | River, water elements |
| Warm Terracotta | `#C17854` | Andean foothills, Mercado Central | Natural elements |
| Muted Gold | `#B8956A` | Poor district buildings | Architecture, textures |
| Soft Sage | `#8A9B68` | Parque de las Montañas | Nature, parks |

#### Secondary Colors (Elite/Industry)
| Color | Hex | Usage | Example |
|-------|-----|-------|---------|
| Stark Black | `#1A1A1A` | Luxury buildings, LW Group | Elite architecture |
| Industrial Steel | `#5C6A7A` | Luz del Río, pipelines | Industrial elements |
| Cold Silver | `#A8B2C4` | Tech, AI elements | Cyberpunk accents |
| Toxic Green | `#6B8C42` | Contaminated areas | Pollution, decay |

#### Accent Colors (Highlights)
| Color | Hex | Usage | Example |
|-------|-----|-------|---------|
| Dawn Orange | `#D4834F` | Hope, new beginnings | Sunrise, warmth |
| Streetlight Amber | `#E6A857` | Warmth, community | Lights, cozy areas |
| Blood Red | `#9E3030` | Danger, corruption | Warnings, tension |

**Usage Rules:**
- **Poor districts:** Use **faded pastels** (70% of palette).
- **Elite areas:** Use **stark monochromes** (30% of palette).
- **Always include contrast** – e.g., a faded building with a stark luxury tower in the background.
- **Avoid pure white** – Use `#F5F5DC` (off-white) for text backgrounds.

---

### 🔹 TYPOGRAPHY

| **Type** | **Font** | **Usage** | **Example** |
|----------|----------|-----------|-------------|
| **Body (Poor/Middle)** | **Quicksand** (rounded sans-serif) | Main text, poor districts | Descriptions, lore |
| **Headers (Elite)** | **Montserrat** (sharp sans-serif) | Titles, elite sections | Location names, faction headers |
| **Accent (Tech)** | **JetBrains Mono** (monospace) | Code, AI elements | Spreadsheets, technical docs |
| **Fancy (Heritage)** | **Cormorant Garamond** (serif) | Quotes, historical | Character dialogue, old documents |

**Font Weights:**
- **Body:** 400 (Regular)
- **Headers:** 600 (Semi-Bold)
- **Accent:** 700 (Bold)

**Example Pairings:**
```css
/* Poor district page */
body { font-family: 'Quicksand', sans-serif; }
h1 { font-family: 'Montserrat', sans-serif; font-weight: 600; }
code { font-family: 'JetBrains Mono', monospace; }

/* Elite faction page */
body { font-family: 'Montserrat', sans-serif; }
h1 { font-family: 'Montserrat', sans-serif; font-weight: 700; }
blockquote { font-family: 'Cormorant Garamond', serif; }
```

---

### 🔹 TEXTURES & PATTERNS

| **Texture** | **Usage** | **File** | **Example** |
|-------------|-----------|----------|-------------|
| Worn Paper | Archives, old documents | `textures/paper_worn.png` | Ana's newspaper clippings |
| Rusted Metal | Industrial areas | `textures/metal_rust.png` | Luz del Río plant |
| Mist/Fog | Andean foothills | `textures/mist_overlay.png` | Parque de las Montañas |
| Water Ripples | Río de las Flores | `textures/water_ripples.png` | Contaminated river |
| Cracked Plaster | Poor buildings | `textures/plaster_cracked.png` | Western district walls |
| Concrete | Elite buildings | `textures/concrete_smooth.png` | Luxury skyscrapers |

**How to Apply:**
```css
/* Background with texture */
.background {
  background-image: url('textures/paper_worn.png');
  background-blend-mode: overlay;
  background-color: #4A7C8A;
}

/* Subtle texture overlay */
.overlay {
  background: rgba(0, 0, 0, 0.3);
  background-image: url('textures/mist_overlay.png');
  background-size: cover;
}
```

---

## 🧭 NAVIGATION ARCHITECTURE

*Recommended structure for your app/website/game.*

---

### 🔹 OPTION 1: GEOGRAPHIC (Recommended for Exploration)

```
Las Flores City Map (Interactive)
├── 🏔️ Andean Foothills
│   ├── Parque de las Montañas
│   └── Luz del Río Energy Plant
├── 🌊 Río de las Flores
│   ├── Mercado Central
│   └── The Apartment Building
├── 🏖️ Pacific Coast
├── 🏙️ Districts
│   ├── Western District (Miguel's Home)
│   ├── Northern Edge (Carlos's Background)
│   ├── Eastern District (Isabella's Grandfather)
│   └── Middle Districts (Ana's Home)
└── 🏛️ Government
    ├── Mayor's Office
    ├── Police Station
    └── City Hall Archives
```

**Implementation:**
- **Interactive map** with clickable regions.
- **Zoom levels:** City → District → Location.
- **Overlays:** Toggle corruption, safehouses, key events.

---

### 🔹 OPTION 2: THEMATIC (Recommended for Storytelling)

```
Contrasts of Las Flores
├── 🌿 Beauty vs. Corruption
│   ├── Río de las Flores (Clean vs. Contaminated)
│   └── Mercado Central (Vibrant vs. Corrupt)
├── ⚙️ Nature vs. Industry
│   ├── Andean Foothills vs. Luz del Río
│   └── Pacific Coast vs. Port Industry
├── 💰 Wealth vs. Poverty
│   ├── Luxury Skyscrapers vs. Dilapidated Houses
│   └── Elite vs. Poor Architecture
└── ⏳ Past vs. Future
    ├── Faded Multicultural Buildings
    └── Stark Elite Designs
```

**Implementation:**
- **Split-screen comparisons** for each contrast.
- **Filter by theme** in the lore database.

---

### 🔹 OPTION 3: CHRONOLOGICAL (Recommended for Story Mode)

```
2077 Timeline
├── Pre-Investigation (2070-2076)
│   ├── Alex's Theory
│   └── Early Suspicions
├── The Group Forms (Early 2077)
│   ├── Miguel Joins
│   ├── Carlos Confirms Theory
│   └── Ana Discovers PR Staff Link
├── Turning Point (Mid-2077)
│   ├── Carlos's Death
│   ├── Isabella Joins
│   └── City Hall Break-In
├── The Movement (Late 2077)
│   ├── Estate Raid
│   └── Alex's Broadcast
└── Post-2077 (2078+)
    ├── Transitional Council
    └── Ongoing Investigations
```

**Implementation:**
- **Horizontal timeline** with scrollable events.
- **Click events** to see details, connections, and impact.

---

## 🖥️ UI COMPONENT LIBRARY

*Reusable components for your interface.*

---

### 🔹 LOCATION CARD

**Purpose:** Preview a place with key details.

**Design:**
```
┌─────────────────────────────────────────┐
│  [IMAGE: Hero shot of location]         │
│  ┌───────────────────────────────────┐  │
│  │ 📍 Mercado Central                │  │
│  │ "A market of life, shadowed by    │  │
│  │    greed."                        │  │
│  │                                   │  │
│  │ 🌿 Beauty  |  🏭 Corruption      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Code:**
```html
<div class="location-card">
  <img src="images/mercado_central.jpg" alt="Mercado Central">
  <div class="location-info">
    <h3>📍 Mercado Central</h3>
    <p class="tagline">"A market of life, shadowed by greed."</p>
    <div class="contrasts">
      <span class="beauty">🌿 Beauty</span>
      <span class="corruption">🏭 Corruption</span>
    </div>
  </div>
</div>
```

**CSS:**
```css
.location-card {
  background: #1A1A1A;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  transition: transform 0.3s ease;
}
.location-card:hover {
  transform: translateY(-5px);
}
.location-card img {
  width: 100%;
  height: 200px;
  object-fit: cover;
}
.location-info {
  padding: 16px;
  background: linear-gradient(to bottom, rgba(26,26,26,0.9), #1A1A1A);
}
.location-info h3 {
  margin: 0 0 8px 0;
  font-family: 'Montserrat', sans-serif;
  color: #F5F5DC;
}
.location-info .tagline {
  margin: 0 0 12px 0;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  color: #A8B2C4;
}
.contrasts {
  display: flex;
  gap: 8px;
}
.contrasts span {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
}
.contrasts .beauty {
  background: #4A7C8A;
  color: #F5F5DC;
}
.contrasts .corruption {
  background: #9E3030;
  color: #F5F5DC;
}
```

---

### 🔹 CHARACTER PROFILE

**Purpose:** Deep dive into a character's backstory and role.

**Design:**
```
┌───────────────────────────────────────────────────────────┐
│  [BACK]                          MIGUEL JHONSON           [EDIT] │
│  ┌─────────────┐  ┌───────────────────────────────────┐   │
│  │             │  │ **Role:** Logistics, Infrastructure   │   │
│  │  [PORTRAIT] │  │ **Age (2077):** ~24                 │   │
│  │             │  │ **Background:** Western district...│   │
│  └─────────────┘  │                                       │   │
│                  │ **Thematic Role:** The Anchor       │   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📜 HIS STORY                                   [EXPAND]│   │
│  │   Miguel was born and raised...                     │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │ 🏠 LOCATION    │  │ 👥 CONNECTIONS │  │ 💀 COST PAID  │   │
│  │ Western        │  │ • Alex        │  │ • Carlos's    │   │
│  │ District       │  │ • Ana         │  │   death       │   │
│  └───────────────┘  └───────────────┘  └───────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🎨 VISUAL CUES: Broad shoulders, sturdy boots...      │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Portrait:** Hero image (circular crop for consistency).
- **Visual Cues:** List traits that artists can reference.
- **Connections:** Link to other characters/locations (clickable).
- **Cost Paid:** Reinforce the human stakes.
- **Collapsible Sections:** For long descriptions (mobile-friendly).

---

### 🔹 TIMELINE EVENT

**Purpose:** Display a key story moment in context.

**Design:**
```
┌───────────────────────────────────────────────────────────┐
│  📅 2077-03-15                      ⚡ CITY HALL BREAK-IN   [VIEW] │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 📍 City Hall Archives                               │ │
│  │ 👥 Isabella, Ana, Miguel                            │ │
│  │                                                   │ │
│  │ "The documents confirm everything they suspected."  │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ 🔥 Trigger    │  │ ⚖️ Choices   │  │ 💡 Revelation   │ │
│  │ Passive...   │  │ Split up...   │  │ Bribes, land... │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

### 🔹 INTERACTIVE MAP

**Purpose:** Explore the city and its locations.

**Design:**
```
┌───────────────────────────────────────────────────────────┐
│  LAS FLORES CITY MAP                          [🔍 SEARCH]   │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                       │ │
│  │         [INTERACTIVE MAP WITH PINS]                  │ │
│  │                                                       │ │
│  │  📍 Mercado Central    📍 Luz del Río               │ │
│  │  📍 Apartment Building  📍 Parque de las Montañas   │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 🎚️ FILTERS: [All] [Corruption] [Safehouses] [Events]  │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

**Features:**
- **Clickable Pins:** Open location cards.
- **Zooming:** City → District → Location.
- **Overlays:** Toggle layers (corruption heatmap, safehouse network, etc.).
- **Search:** Find locations, characters, or events.

**Pin Styles:**
- **🟢 Green:** Safe/Neutral (Parque de las Montañas)
- **🟡 Yellow:** Caution (Mercado Central)
- **🔴 Red:** Danger (Luz del Río, Mayor's Office)
- **🔵 Blue:** Movement (Safehouses, Meeting Points)

---

### 🔹 THEME EXPLORER

**Purpose:** Visualize the contrasts of Las Flores.

**Design:**
```
┌───────────────────────────────────────────────────────────┐
│  THEME EXPLORER                      [🌿 Beauty vs. Corruption]   │
│  ┌─────────────────┐  ┌─────────────────┐               │
│  │  [CLEAN RIVER]   │  │ [CONTAMINATED    │               │
│  │                 │  │  RIVER]          │               │
│  │   🌊 Pristine    │  │   💀 Polluted    │               │
│  │   water         │  │   water         │               │
│  └─────────────────┘  └─────────────────┘               │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ The Río de las Flores once symbolized life and        │ │
│  │ abundance. Now, its contaminated waters reflect the    │ │
│  │ city's moral decay.                                  │ │
│  └───────────────────────────────────────────────────────┘ │
│  [← PREV THEME]                              [NEXT THEME →]   │
└───────────────────────────────────────────────────────────┘
```

**Themes to Include:**
1. Beauty vs. Corruption
2. Nature vs. Industry
3. Wealth vs. Poverty
4. Past vs. Future
5. Truth vs. Lies
6. Hope vs. Despair

---

### 🔹 ARCHIVE VIEWER

**Purpose:** Simulate document discovery (e.g., Isabella's spreadsheet).

**Design:**
```
┌───────────────────────────────────────────────────────────┐
│  📄 ARCHIVE VIEWER                   [🔍 City Hall Documents]   │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                       │ │
│  │  [SCANNED DOCUMENT WITH TEXTURE]                    │ │
│  │                                                       │ │
│  │  ┌─────────────────────────────────────────────┐   │ │
│  │  │  [REDACTED]                                  │   │ │
│  │  │  Approval for land use change:                │   │ │
│  │  │  Río de las Flores basin →                   │   │ │
│  │  │  Minera Estrella lithium extraction            │   │ │
│  │  │  Signed: [REDACTED]                            │   │ │
│  │  └─────────────────────────────────────────────┘   │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│  [↑ PREV]  [DOWNLOAD]  [SHARE]  [NEXT →]               │
└───────────────────────────────────────────────────────────┘
```

**Features:**
- **Scanned paper texture** background.
- **Redacted sections** (black bars or blurs).
- **Handwritten notes** in margins (e.g., Isabella's annotations).
- **Zoom/pan** for detailed inspection.

---

### 🔹 GALLERY GRID

**Purpose:** Display concept art and generated images.

**Design:**
```
┌───────────────────────────────────────────────────────────┐
│  🎨 GALLERY                              [🔍 FILTER: All]   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ [IMG 1] │  │ [IMG 2] │  │ [IMG 3] │  │ [IMG 4] │       │
│  │ Las... │  │ Mercado │  │ Luz...  │  │ Group   │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ [IMG 5] │  │ [IMG 6] │  │ [IMG 7] │  │ [IMG 8] │       │
│  │ Carlos  │  │ Ana    │  │ Miguel │  │ Isabella│       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│  [LOAD MORE]                                              │
└───────────────────────────────────────────────────────────┘
```

**Features:**
- **Masonry grid** for varied image sizes.
- **Hover effects:** Title + tags appear on hover.
- **Filter by:** Type (Location/Character/Scene), Mood, Style.
- **Click to enlarge** in a modal.

---

## 🎭 MOOD & ATMOSPHERE GUIDE

*How to set the tone for different locations and scenes.*

| **Location** | **UI Mood** | **Sound Design** | **Visual Filters** | **Color Palette** |
|--------------|-------------|------------------|--------------------|-------------------|
| **Andean Foothills** | Mysterious, foreboding | Wind, distant howls | Mist overlay, cool tones | Teal, Gray, White |
| **Pacific Coast** | Relentless, powerful | Crashing waves, seagulls | Blue/gray tint, motion blur | Blue, Gray, White |
| **Río de las Flores** | Poisoned, tragic | Gurgling water, industrial hum | Brown/green tint, distortion | Toxic Green, Brown, Gray |
| **Luz del Río Plant** | Industrial, oppressive | Machinery hum, metallic clangs | Steel/black palette, high contrast | Industrial Steel, Black, White |
| **Mercado Central** | Vibrant, tense | Market chatter, hidden whispers | Warm tones, slight saturation | Warm Terracotta, Gold, Red |
| **Parque de las Montañas** | Peaceful, deceptive | Birds, rustling leaves | Soft focus, pastel colors | Soft Sage, Green, Blue |
| **Apartment Building** | Cluttered, alive | Muffled voices, creaking floors | Warm lighting, tight framing | Muted Gold, Brown, Amber |
| **City Hall Archives** | Secretive, urgent | Paper rustling, footsteps | Dark, high-contrast, green screen glow | Stark Black, Cold Silver, Green |
| **Western District** | Grounded, communal | Children playing, market sounds | Texture overlay, warm | Warm Terracotta, Gold, Brown |
| **Eastern District** | Tense, divided | Distant sirens, whispers | Cool tones, sharp contrast | Industrial Steel, Gray, Blue |

---

## 🎬 UI WORKFLOW EXAMPLES

---

### 🔹 EXAMPLE 1: CHARACTER PROFILE PAGE (Miguel Jhonson)

**Goal:** Create a page for Miguel Jhonson.

**Layout:**
```
┌───────────────────────────────────────────────────────────────┐
│  [BACK BUTTON]                          MIGUEL JHONSON          │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐ │
│  │             │  │ **Role:** Logistics, Infrastructure       │ │
│  │  PORTRAIT   │  │ **Age (2077):** ~24                        │ │
│  │  (Hero     │  │ **Background:** Western district,         │ │
│  │  Shot)     │  │   urban management student               │ │
│  │             │  │                                             │ │
│  └─────────────┘  │ **Thematic Role:** The Anchor –          │ │
│                     │   Stability in chaos.                    │ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 📜 **HIS STORY**                                      [EDIT] │ │
│  │   Miguel was born and raised in the western district...   │ │
│  │   [Collapsible text]                                  [EXPAND] │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐ │
│  │ 🏠 LOCATION    │  │ 👥 CONNECTIONS │  │ 💀 COST PAID      │ │
│  │ Western       │  │ • Alex        │  │ • Carlos's death  │ │
│  │ District      │  │ • Ana         │  │   changed him      │ │
│  │               │  │ • Isabella    │  │ • Carries guilt   │ │
│  │ [Map Pin]     │  │ • Evelyn      │  │   over risks      │ │
│  └───────────────┘  └───────────────┘  └───────────────────┘ │
│                                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🎨 **VISUAL CUES**                                      [GALLERY] │ │
│  │   • Broad shoulders  • Sturdy boots  • Always moving slowly │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 📚 **RELATED LORE**                                    [ALL] │ │
│  │   [Safehouse Network]  [City Hall Archives]  [Transitional Council] │
│  └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Portrait:** Circular crop, warm lighting (western district).
- **Visual Cues:** List traits that artists can reference.
- **Connections:** Clickable character cards.
- **Cost Paid:** Reinforce the human stakes.
- **Related Lore:** Cross-link to keep users exploring.

**Design Spec:**
```css
/* Background */
body {
  background: linear-gradient(135deg, #C17854 0%, #8B4513 100%);
  background-image: url('textures/plaster_cracked.png');
  background-blend-mode: overlay;
}

/* Header */
header {
  background: rgba(26, 26, 26, 0.8);
  backdrop-filter: blur(10px);
}

/* Portrait */
.portrait {
  border: 4px solid #B8956A;
  box-shadow: 0 0 20px rgba(184, 149, 106, 0.5);
}

/* Cards */
.connection-card {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #B8956A;
  transition: all 0.3s ease;
}
.connection-card:hover {
  background: rgba(184, 149, 106, 0.2);
  transform: translateY(-5px);
}
```

---

### 🔹 EXAMPLE 2: LOCATION PAGE (Mercado Central)

**Goal:** Create an immersive page for Mercado Central.

**Layout:**
```
┌───────────────────────────────────────────────────────────────┐
│  📍 MERCADO CENTRAL                              [🔍 EXPLORE]   │
│  "A market of life, shadowed by greed."                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                      │ │
│  │  [HERO IMAGE: Wide shot of Mercado Central at dusk]       │ │
│  │                                                      │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 📌 **OVERVIEW**                                         [EXPAND] │ │
│  │   Mercado Central is the vibrant heart of Las Flores...   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌───────────────────┐  ┌───────────────────┐                │
│  │ 🌿 BEAUTY          │  │ 🏭 CORRUPTION     │                │
│  │ • Colorful stalls  │  │ • Hidden bribes   │                │
│  │ • Lively commerce  │  │ • Police turn a   │                │
│  │ • Cultural murals  │  │   blind eye      │                │
│  └───────────────────┘  └───────────────────┘                │
│                                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 👥 **KEY FIGURES**                                    [ALL]   │ │
│  │   [Miguel]  [Ana]  [Isabella]  [Various Vendors]           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🗺️ **ON THE MAP**                                      [VIEW]   │ │
│  │   [Mini-map with Mercado Central highlighted]           │ │
│  └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

**Design Spec:**
```css
/* Background */
body {
  background: linear-gradient(135deg, #C17854 0%, #8B4513 50%, #4A7C8A 100%);
  background-image: url('textures/mist_overlay.png');
  background-blend-mode: multiply;
}

/* Hero Image */
.hero-image {
  border: 4px solid #B8956A;
  box-shadow: 0 0 30px rgba(184, 149, 106, 0.7);
}

/* Contrast Cards */
.contrast-card {
  background: rgba(26, 26, 26, 0.7);
  border-left: 4px solid;
}
.contrast-card.beauty {
  border-left-color: #4A7C8A;
}
.contrast-card.corruption {
  border-left-color: #9E3030;
}
```

---

### 🔹 EXAMPLE 3: HOMEPAGE (Interactive Map Focus)

**Goal:** Create an engaging landing page.

**Layout:**
```
┌───────────────────────────────────────────────────────────────┐
│  LAS FLORES 2077                      [📖 LORE] [🎨 GALLERY]   │
│  "A city of beauty and corruption"                              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                      │ │
│  │         [INTERACTIVE MAP - FULL SCREEN]                │ │
│  │                                                      │ │
│  │  🌿 Andean Foothills    🌊 Río de las Flores           │ │
│  │  🏭 Luz del Río         🏙️ Districts                   │ │
│  │  📍 Mercado Central     🏖️ Pacific Coast             │ │
│  │                                                      │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🔥 **FEATURED STORY: THE 2077 MOVEMENT**                 │ │
│  │   [Alex] and his friends uncovered the truth about...   │ │
│  │   [READ MORE →]                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 👥 **MEET THE GROUP**                                    [ALL] │ │
│  │   [Miguel]  [Carlos]  [Ana]  [Isabella]  [Alex]          │ │
│  └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

**Features:**
- **Full-screen interactive map** as the hero element.
- **Featured story** section highlighting the 2077 movement.
- **Quick access** to main sections (Lore, Gallery).
- **Character showcase** for the core group.

---

## 📥 EXPORT TEMPLATES

*For handing off designs to developers.*

### 🔹 Figma/Adobe XD Template
- **Artboards:**
  - Mobile (375px)
  - Tablet (768px)
  - Desktop (1440px)
- **Color Variables:** Use the [palette](#color-palette).
- **Text Styles:** Define for each font family.
- **Components:** Create reusable components for:
  - Location Cards
  - Character Profiles
  - Timeline Events
  - Buttons (Primary, Secondary, Danger)

### 🔹 CSS Variables Template

```css
:root {
  /* Colors - Poor/Middle */
  --color-faded-teal: #4A7C8A;
  --color-warm-terracotta: #C17854;
  --color-muted-gold: #B8956A;
  --color-soft-sage: #8A9B68;
  
  /* Colors - Elite/Industry */
  --color-stark-black: #1A1A1A;
  --color-industrial-steel: #5C6A7A;
  --color-cold-silver: #A8B2C4;
  --color-toxic-green: #6B8C42;
  
  /* Colors - Accents */
  --color-dawn-orange: #D4834F;
  --color-streetlight-amber: #E6A857;
  --color-blood-red: #9E3030;
  --color-off-white: #F5F5DC;
  
  /* Typography */
  --font-body: 'Quicksand', sans-serif;
  --font-headers: 'Montserrat', sans-serif;
  --font-tech: 'JetBrains Mono', monospace;
  --font-fancy: 'Cormorant Garamond', serif;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Shadows */
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.4);
  
  /* Borders */
  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  
  /* Transitions */
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
  --transition-slow: 0.5s ease;
}
```

---

## 📚 RELATED GUIDES

- **[Asset Generation Guide](./asset_generation_guide.md)** – Core principles and lore framework
- **[Prompt Library](./prompt_library.md)** – Image/video generation templates
- **[Workflows](./workflows.md)** – Step-by-step processes
- **[Templates](./templates.md)** – Copy-paste resources

---

## 📝 CHANGELOG

- **v1.0** (2026-07-01): Initial release – Visual identity, components, navigation
- **v1.1** (Planned): Add dark/light mode support, more component variations

---

> **Need help?** Check the other guides in this folder or ask in the project's Discord.
