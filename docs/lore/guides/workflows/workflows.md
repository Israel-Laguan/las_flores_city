# LAS FLORES: WORKFLOWS

> **Version:** 1.0  
> **Purpose:** Step-by-step processes for creating lore, UI, and assets for Las Flores 2077.  
> **Audience:** Writers, designers, world-builders, project managers.  

---

## 🎯 TABLE OF CONTENTS

1. [Lore Creation Workflows](#lore-creation-workflows)
2. [UI/UX Design Workflows](#uiux-design-workflows)
3. [Asset Generation Workflows](#asset-generation-workflows)
4. [Quality Control Workflow](#quality-control-workflow)

---

## 📖 LORE CREATION WORKFLOWS

*Step-by-step guides for expanding the Las Flores universe.*

---

### 🔹 WORKFLOW 1: CREATING A NEW CHARACTER

**Goal:** Add a new character to the lore that fits seamlessly with existing content.

**Time Estimate:** 30-60 minutes

**Steps:**

#### 1️⃣ Define Their Role (5 min)
- Pick from the **6 archetypes** (Spark, Anchor, Heart, Brain, Conscience, Shadow).
- *Example: "The Shadow" – a smuggler who helps the movement.*
- **Reference:** [Asset Generation Guide - Character Archetypes](../asset_generation_guide.md#step-1-pick-a-role-in-the-movement)

#### 2️⃣ Give Them a Cost (10 min)
- Every character **pays a price** for their involvement.
- Choose from:
  - **Physical:** Injury, disability, death
  - **Emotional:** Guilt, trauma, loss
  - **Social:** Stigma, isolation, blacklisting
  - **Moral:** Compromise, secrets, regret
- *Example: "Lost his brother to LW Group enforcers."*
- **Reference:** [Asset Generation Guide - Define Their Cost](../asset_generation_guide.md#step-2-define-their-cost)

#### 3️⃣ Connect to Existing Lore (10 min)
- Link to **minimum 2 existing elements** (characters, locations, factions, events).
- Use the **Lore Connection Map** to verify.
- *Example:*
  - **Character Connection:** "Works with Miguel's logistics network"
  - **Location Connection:** "Knows the eastern district alleys"
  - **Faction Connection:** "Wanted by LW Group"
- **Reference:** [Asset Generation Guide - Connect to Existing Lore](../asset_generation_guide.md#step-3-connect-to-existing-lore)

#### 4️⃣ Write Their Profile (15 min)
- Use the **[Character Creation Template](../asset_generation_guide.md#step-1-pick-a-role-in-the-movement)**.
- Fill in all sections:
  - **Role, Age, Background**
  - **Who They Are** (Personality, appearance, quirks)
  - **Their Arc** (Pre-2077, 2077, Post-2077)
  - **Their Cost**
  - **Connections** (To other characters/locations)
  - **Visual Cues** (For artists)
  - **Quote** (Optional but recommended)

#### 5️⃣ Generate Their Portrait (10 min)
- Use the **[Character Prompt Template](../prompt_library.md#character-portrait-template)**.
- **Recommended Tools:** Leonardo.AI (for consistency), MidJourney (for style)
- **Example Prompt:**
  ```
  Photorealistic portrait of Javier "El Fantasma" Morales, a 30-year-old smuggler with a scar across his left cheek, dark circles under his eyes from sleepless nights, wearing a worn leather jacket and a cap pulled low. Background: a dimly lit alley in the eastern district, with crates of smuggled goods and a flickering streetlight. Moody lighting, tense expression, hyper-detailed, 8K.
  --no neon, no androids, no clean backgrounds
  ```
- **Save As:** `docs/lore/assets/images/characters/javier_morales.png`

#### 6️⃣ Add to UI (5 min)
- Create a **Character Profile Page** using the **[UI Component Library](../ui_ux_design_system.md#character-profile)**.
- Link from:
  - **Figures Index** (`docs/lore/figures/README.md`)
  - **Related Characters** (in their profiles)
  - **Locations** (where they appear)

#### 7️⃣ Quality Control (5 min)
- Run through the **[Lore Quality Checklist](../templates.md#for-lore-entries)**.
- Verify:
  - [ ] Duality Check
  - [ ] Connection Check (2+ links)
  - [ ] Human Stakes
  - [ ] Consistency Check
  - [ ] Cultural Check
  - [ ] Tech Check

**Example Output:** [Javier Morales](../asset_generation_guide.md#example-new-character--javier-el-fantasma-morales)

---

### 🔹 WORKFLOW 2: DESIGNING A NEW LOCATION

**Goal:** Add a new place to Las Flores that enhances the world's depth.

**Time Estimate:** 45-90 minutes

**Steps:**

#### 1️⃣ Pick a Thematic Role (5 min)
- Does it show **beauty vs. corruption**, **nature vs. industry**, or **wealth vs. poverty**?
- *Example: "A place where the elite **hide their corruption** behind beauty."*

#### 2️⃣ Place It on the Map (5 min)
- Which **district**? (Western, Northern, Eastern, Middle, Outskirts, Government)
- *Example: "Northern district – near Carlos's old neighborhood."*
- **Reference:** [City Map Layout](../../city_map_layout.md)

#### 3️⃣ Define Its Physical Traits (10 min)
- **Appearance:** Architecture, key features, sensory details
- *Example:*
  - *"A **rooftop garden** on a luxury tower, with **dying plants** (due to contaminated soil) and a **view of the poor districts**."*
- **Sensory Details:** Smells, sounds, textures
- *Example:* "The scent of decay beneath the perfume of flowers; the hum of the city below."

#### 4️⃣ Add Social Context (10 min)
- **Who uses it?** (Characters, factions, communities)
- **Who controls it?** (LW Group, Mayor Vega, etc.)
- **What secrets does it hold?** (Hidden documents, meetings, corruption)
- *Example:*
  - *"Owned by **Senator Chen**; used for **secret meetings** with LW Group."*
  - *"Miguel's network **infiltrates** it."*

#### 5️⃣ Write Its Lore Entry (15 min)
- Use the **[Location Template](../asset_generation_guide.md#the-5-ws--h-lore-template)**.
- Include:
  - **Physical Details**
  - **Social Details**
  - **Thematic Details**
  - **Expanded Lore** (Backstory, Future, Quote)

#### 6️⃣ Generate Concept Art (10 min)
- Use the **[Location Prompts](../prompt_library.md#location-prompts)** as reference.
- **Recommended Tools:** MidJourney (for artistic), Stable Diffusion (for control)
- **Example Prompt:**
  ```
  Concept art of a rooftop garden on the Vega Tower in Las Flores, wide landscape view from above. Withered plants and contaminated soil in an otherwise luxurious garden, string lights flickering. In the background, the poor districts sprawl below, and the Andean foothills rise misty and foreboding in the distance. The scene captures the contrast between the elite's false beauty and the city's decay. Environmental storytelling, moody lighting, hyper-detailed textures, 8K, atmospheric.
  --no neon, no androids, no clean environments, no utopian
  ```
- **Save As:** `docs/lore/assets/images/locations/garden_of_lies.jpg`

#### 7️⃣ Add to UI (5 min)
- Create a **Location Page** using the **[UI Component Library](../ui_ux_design_system.md#location-card)**.
- Add to:
  - **Interactive Map** (as a pin)
  - **Geographic Navigation**
  - **Thematic Navigation** (under relevant contrast)

#### 8️⃣ Quality Control (5 min)
- Run through the **[Lore Quality Checklist](../templates.md#for-lore-entries)**.
- Verify:
  - [ ] Duality Check
  - [ ] Connection Check (2+ links)
  - [ ] Human Stakes
  - [ ] Consistency Check

**Example Output:** [The Garden of Lies](../asset_generation_guide.md#example-location--the-garden-of-lies)

---

### 🔹 WORKFLOW 3: WRITING A NEW SCENE

**Goal:** Create a narrative moment that fits the lore and advances the story.

**Time Estimate:** 60-120 minutes

**Steps:**

#### 1️⃣ Pick a Location & Time (5 min)
- *Example: "Mercado Central, dusk, 2076."*
- **Reference:** [Locations](../../landmarks/) or [Timeline](../../timeline.md)

#### 2️⃣ Choose Characters Involved (5 min)
- *Example: "Miguel, Ana, and a new informant (Javier)."*
- Ensure they have **existing connections** or **plausible reasons** to be there.

#### 3️⃣ Define the Stakes (10 min)
- What do they **want**?
- What do they **fear**?
- *Example:*
  - **Want:** "They need **proof of LW Group's bribes**."
  - **Fear:** "They risk **being caught by police**."

#### 4️⃣ Use the "Cause → Effect" Chain (15 min)
- Fill in the **[Event Template](../asset_generation_guide.md#template-for-new-events)**:
  - **Trigger:** What sets it in motion?
  - **Choices:** What do the characters decide?
  - **Cost:** What do they lose?
  - **Revelation:** What do they learn?
  - **Ripple:** How does it affect the world?
- *Example:*
  - **Trigger:** Javier **slips Miguel a USB drive** with financial data.
  - **Choice:** Miguel **hides it in a loaf of bread** (Ana's idea).
  - **Cost:** A **vendor notices** and **reports them** to police.
  - **Revelation:** The data **confirms Senator Chen's involvement**.
  - **Ripple:** The police **raid the bakery** the next day.

#### 5️⃣ Write the Scene (20 min)
- Use the **[Writing Style Guidelines](../../stories/)** (First-person, present tense, stream of consciousness).
- Focus on:
  - **Sensory details** (smells, sounds, textures)
  - **Internal monologue** (thoughts, emotions)
  - **Dialogue** (character voices)
  - **Duality** (show the contrast)

#### 6️⃣ Generate Accompanying Image (10 min)
- Use the **[Scene Prompts](../prompt_library.md#scene-prompts)** as reference.
- **Example Prompt:**
  ```
  Mercado Central at dusk, a vendor slipping a small USB drive into a loaf of bread on a market stall. A woman in a cardigan (Ana) pretends to examine the bread while a large man (Miguel) keeps watch. In the background, a suspicious vendor eyes them from behind his stall. Warm lighting from setting sun and street lamps, tense atmosphere, photorealistic, 8K.
  --no modern tech, no clean market, no bright lighting
  ```
- **Save As:** `docs/lore/assets/images/scenes/mercado_usb_handoff.jpg`

#### 7️⃣ Add to Timeline (5 min)
- Update the **[Timeline](../../timeline.md)** with:
  - **Date:** (Estimate based on existing events)
  - **Event Name:** (Short, descriptive)
  - **Description:** (1-2 sentences)
  - **Connections:** (Link to characters, locations)

#### 8️⃣ Quality Control (5 min)
- Run through the **[Scene Quality Checklist](./templates.md#scene-quality-checklist)** (See below).
- Verify:
  - [ ] Fits timeline
  - [ ] Character motivations make sense
  - [ ] Reflects at least one duality
  - [ ] Has human stakes

**Example Output:** [Mercado Central Scene](../asset_generation_guide.md#example-output-1)

---

### 🔹 WORKFLOW 4: CREATING A NEW EVENT

**Goal:** Design a significant story beat that impacts the world.

**Time Estimate:** 60-90 minutes

**Steps:**

#### 1️⃣ Pick an Event Type (5 min)
- **Investigation** (Discovering clues)
- **Confrontation** (Direct conflict)
- **Discovery** (Uncovering truth)
- **Betrayal** (Trust broken)
- **Sacrifice** (Loss for greater good)

#### 2️⃣ Place It on the Timeline (5 min)
- **Pre-2077** (2070-2076): Setup, early investigations
- **2077**: The movement, climax
- **Post-2077** (2078+): Aftermath, rebuilding
- *Example: "3 months before Carlos's death (Early 2077)."*

#### 3️⃣ Define the Trigger (10 min)
- What **sets the event in motion**?
- *Example: "LW Group **cuts power** to the western district to **pressure residents** into accepting a new pipeline."*

#### 4️⃣ Design the Choices (15 min)
- What **options** do the characters have?
- What **do they choose**?
- *Example:*
  - **Option A:** **Protest** (risk police crackdown)
  - **Option B:** **Sabotage** (risk LW Group retaliation)
  - **Chosen Path:** Miguel organizes a **black market power grid**

#### 5️⃣ Determine the Cost (10 min)
- What do they **lose**?
- *Example:*
  - **Physical:** A **worker is electrocuted** setting up the grid.
  - **Social:** LW Group **labels Miguel a terrorist**.

#### 6️⃣ Reveal the Consequences (10 min)
- What do they **learn**?
- How does it **change the world**?
- *Example:*
  - **Revelation:** The group learns **Luz del Río is overcharging the city**.
  - **Ripple:** Miguel's **logistics network** is born.

#### 7️⃣ Write the Event Entry (10 min)
- Use the **[Event Template](../asset_generation_guide.md#template-for-new-events)**.
- Save in `docs/lore/events/[event_name].md`

#### 8️⃣ Generate Key Images (10 min)
- **Before:** The trigger (e.g., power cut in western district)
- **During:** The action (e.g., setting up the black market grid)
- **After:** The ripple effect (e.g., western district united)
- **Example Prompt (During):**
  ```
  Miguel Jhonson and Javier Morales working in a dimly lit basement in the western district, stringing wires between car batteries to create a makeshift power grid. The walls are covered in faded murals, and the only light comes from a single lamp and the glow of a multimeter. Their expressions are focused and determined, despite the danger. Photorealistic, tense, warm lighting, 8K.
  --no modern tech, no clean basement
  ```

#### 9️⃣ Update Connected Lore (5 min)
- Add **links** from:
  - **Characters involved** (update their arcs)
  - **Locations** (add to history)
  - **Other events** (add as related)

#### 🔟 Quality Control (5 min)
- Run through the **[Lore Quality Checklist](../templates.md#for-lore-entries)**.

**Example Output:** [The Blackout](../asset_generation_guide.md#example-new-event----the-blackout)

---

---

## 🎨 UI/UX DESIGN WORKFLOWS

*Step-by-step guides for creating UI elements.*

---

### 🔹 WORKFLOW 1: DESIGNING A CHARACTER PROFILE PAGE

**Goal:** Create a visually appealing and informative character page.

**Time Estimate:** 60-90 minutes

**Steps:**

#### 1️⃣ Gather Content (10 min)
- **Character Profile** (from `docs/lore/figures/[name].md`)
- **Portrait Image** (from `docs/lore/assets/images/characters/[name].png`)
- **Connections** (other characters, locations)
- **Visual Cues** (from the profile)

#### 2️⃣ Choose a Layout (5 min)
- Use the **[Character Profile Component](../ui_ux_design_system.md#character-profile)** as a base.
- Decide on:
  - **Portrait Placement** (Left, Center, Right)
  - **Information Hierarchy** (What's most important?)
  - **Collapsible Sections** (For long descriptions)

#### 3️⃣ Select Colors (5 min)
- Use the **[Color Palette](../ui_ux_design_system.md#color-palette)**.
- For Miguel: **Warm Terracotta** (western district) + **Stark Black** (contrast)
- For Isabella: **Cold Silver** (tech) + **Toxic Green** (corruption she fights)

#### 4️⃣ Design in Figma/Adobe XD (20 min)
- Create **artboards** for:
  - Desktop (1440px)
  - Tablet (768px)
  - Mobile (375px)
- Use **components** from the **[UI Component Library](../ui_ux_design_system.md#ui-component-library)**.
- Add **textures** (e.g., worn paper for Ana's library background).

#### 5️⃣ Add Interactivity (10 min)
- **Hover Effects:** Connection cards glow on hover
- **Click Actions:** Links to related lore
- **Collapsible Sections:** Smooth expand/collapse

#### 6️⃣ Write the Design Spec (10 min)
- Document **colors, fonts, spacing, interactions**.
- **Example:**
  ```markdown
  ### Miguel Jhonson – Profile Page
  **Colors:**
  - Primary: Warm Terracotta (#C17854)
  - Secondary: Muted Gold (#B8956A)
  - Accent: Stark Black (#1A1A1A)
  
  **Typography:**
  - Headers: Montserrat Semi-Bold
  - Body: Quicksand Regular
  
  **Interactions:**
  - Connection cards: Glow on hover, link to character pages
  - Visual cues: Tooltip on hover
  ```

#### 7️⃣ Export Assets (5 min)
- **Images:** PNG (transparent background for portraits)
- **Icons:** SVG
- **Design File:** Figma/Adobe XD file

#### 8️⃣ Implement in Code (15 min)
- Use the **[CSS Variables Template](../ui_ux_design_system.md#css-variables-template)**.
- Add **responsive breakpoints** for mobile/tablet.

**Example Output:** [Miguel's Profile Page](../ui_ux_design_system.md#example-1-character-profile-page-miguel-jhonson)

---

### 🔹 WORKFLOW 2: DESIGNING A LOCATION PAGE

**Goal:** Create an immersive page for a Las Flores location.

**Time Estimate:** 90-120 minutes

**Steps:**

#### 1️⃣ Gather Content (10 min)
- **Location Entry** (from `docs/lore/locations/[name].md`)
- **Concept Art** (from `docs/lore/assets/images/locations/[name].jpg`)
- **Connected Characters** (who appears here?)
- **Connected Events** (what happened here?)

#### 2️⃣ Choose a Layout (10 min)
- Use the **[Location Page Example](../ui_ux_design_system.md#example-2-location-page-mercado-central)** as a base.
- Decide on:
  - **Hero Image** (Full-width location shot)
  - **Overview Section** (Description + tagline)
  - **Contrast Cards** (Beauty vs. Corruption, etc.)
  - **Key Figures** (Characters who appear here)
  - **Map Integration** (Where is it in the city?)

#### 3️⃣ Select Colors & Textures (10 min)
- Use the **location's thematic palette**.
- For Mercado Central: **Warm Terracotta** + **Blood Red** (hidden corruption)
- Add **texture overlays** (e.g., mist for Parque de las Montañas)

#### 4️⃣ Design in Figma (30 min)
- Create **artboards** for all screen sizes.
- Use **components:**
  - Location Card
  - Character Thumbnails
  - Contrast Cards
  - Mini-Map
- Add **micro-interactions:**
  - Hover to reveal more info
  - Click to expand images

#### 5️⃣ Write the Design Spec (10 min)
- Document **colors, fonts, textures, interactions**.
- **Example:**
  ```markdown
  ### Mercado Central – Location Page
  **Colors:**
  - Primary: Warm Terracotta (#C17854)
  - Secondary: Muted Gold (#B8956A)
  - Accent: Blood Red (#9E3030)
  
  **Textures:**
  - Background: Worn paper overlay
  - Cards: Subtle wood grain
  
  **Interactions:**
  - Hero image: Parallax scroll
  - Contrast cards: Flip on click
  ```

#### 6️⃣ Export & Implement (20 min)
- Export **images, icons, SVGs**.
- Implement **responsive design**.
- Add **animations** (e.g., fade-in on scroll).

**Example Output:** [Mercado Central Page](../ui_ux_design_system.md#example-2-location-page-mercado-central)

---

### 🔹 WORKFLOW 3: DESIGNING THE HOMEPAGE

**Goal:** Create an engaging landing page for the Las Flores lore.

**Time Estimate:** 120-180 minutes

**Steps:**

#### 1️⃣ Define the Hero Element (10 min)
- **Option A:** Interactive Map (Recommended)
- **Option B:** Featured Story Carousel
- **Option C:** Character Showcase
- *Example: **Interactive Map** with key locations pinned.*

#### 2️⃣ Choose Featured Content (10 min)
- **Featured Story:** The 2077 Movement
- **Featured Characters:** The Core Group (Alex, Miguel, Carlos, Ana, Isabella)
- **Featured Locations:** Mercado Central, Luz del Río, Parque de las Montañas

#### 3️⃣ Design the Layout (20 min)
- Use the **[Homepage Example](../ui_ux_design_system.md#example-3-homepage-interactive-map-focus)** as a base.
- Include sections:
  - **Hero Map** (Full-width, interactive)
  - **Featured Story** (With call-to-action)
  - **Meet the Group** (Character showcase)
  - **Quick Links** (Lore, Gallery, Timeline)

#### 4️⃣ Select Colors & Mood (10 min)
- **Primary:** Faded Teal (#4A7C8A) – Río de las Flores
- **Secondary:** Warm Terracotta (#C17854) – Andean foothills
- **Accent:** Industrial Steel (#5C6A7A) – Luz del Río
- **Mood:** Mysterious, inviting, tense

#### 5️⃣ Design in Figma (40 min)
- Create **artboards** for:
  - Desktop (1440px)
  - Tablet (768px)
  - Mobile (375px)
- Design **interactive map:**
  - Clickable pins
  - Zoom/pan functionality
  - Overlay toggles (Corruption, Safehouses, etc.)
- Design **feature sections:**
  - Hover effects
  - Call-to-action buttons

#### 6️⃣ Add Animations (15 min)
- **Map:** Smooth zoom/pan
- **Pins:** Pulse on hover
- **Cards:** Slide in on scroll
- **Text:** Typewriter effect for taglines

#### 7️⃣ Write the Design Spec (15 min)
- Document **colors, fonts, interactions, animations**.
- **Example:**
  ```markdown
  ### Las Flores 2077 – Homepage
  **Hero Map:**
  - Colors: Faded Teal (water), Warm Terracotta (land), Industrial Steel (buildings)
  - Pins: Color-coded by type (Green=Safe, Yellow=Caution, Red=Danger, Blue=Movement)
  - Interactions: Click to open location card, zoom with mouse wheel
  
  **Featured Story:**
  - Background: Semi-transparent overlay with mist texture
  - Text: Off-white with drop shadow
  
  **Character Showcase:**
  - Layout: Horizontal scroll on mobile, grid on desktop
  - Hover: Scale up + shadow
  ```

#### 8️⃣ Export & Implement (20 min)
- Export **images, icons, SVGs**.
- Implement **interactive map** (use Leaflet.js or similar).
- Add **responsive design**.

**Example Output:** [Homepage Design](../ui_ux_design_system.md#example-3-homepage-interactive-map-focus)

---

---

## 🎬 ASSET GENERATION WORKFLOWS

*Step-by-step guides for creating visual assets.*

---

### 🔹 WORKFLOW 1: GENERATING A LOCATION IMAGE

**Goal:** Create a high-quality image for a Las Flores location.

**Time Estimate:** 20-40 minutes

**Steps:**

#### 1️⃣ Gather Lore Details (5 min)
- From the **location's entry**, note:
  - Physical traits
  - Mood
  - Key elements
  - Contrasts
- *Example (The Garden of Lies):*
  - Rooftop garden, withered plants, Vega Tower
  - Hypocrisy, decay beneath beauty
  - Contaminated soil, string lights, view of poor districts

#### 2️⃣ Choose a Composition (5 min)
- **Options:**
  - Wide landscape
  - Street-level
  - Aerial
  - Cross-section
  - Interior
- *Example: **Wide landscape, high angle** (looking down on the garden and city)*

#### 3️⃣ Pick a Style (2 min)
- **Photorealistic** (for realism)
- **Concept Art** (for artistic interpretation)
- **Symbolic** (for thematic representation)
- *Example: **Concept art, environmental storytelling**

#### 4️⃣ Build the Prompt (5 min)
- Use the **[Prompt Structure Template](../prompt_library.md#prompt-structure--best-practices)**.
- **Example (The Garden of Lies):**
  ```
  Concept art of a rooftop garden on the Vega Tower in Las Flores, wide landscape view from above. Withered plants and contaminated soil in an otherwise luxurious garden, string lights flickering. In the background, the poor districts sprawl below, and the Andean foothills rise misty and foreboding in the distance. The scene captures the contrast between the elite's false beauty and the city's decay. Environmental storytelling, moody lighting, hyper-detailed textures, 8K, atmospheric.
  --no neon, no androids, no clean environments, no utopian
  ```

#### 5️⃣ Generate the Image (5 min)
- **Tool Selection:**
  - **MidJourney:** Best for artistic styles
  - **Stable Diffusion:** Best for control
  - **DALL·E 3:** Best for text accuracy
  - **Leonardo.AI:** Best for consistency
- **Example (MidJourney):**
  ```
  /imagine prompt: [YOUR PROMPT HERE] --v 6 --ar 16:9 --style raw --chaos 30
  ```

#### 6️⃣ Refine & Iterate (10 min)
- **Generate 3-4 variations** (different angles, lighting, moods).
- **Upscale** the best result (use tool's upscale feature).
- **Inpaint/Outpaint** to fix issues (e.g., add more detail to the poor districts in the background).

#### 7️⃣ Post-Process (5 min)
- **Enhance:** Use tools like **Topaz Gigapixel** for higher resolution.
- **Color Grade:** Adjust colors to match the **[Las Flores Palette](../ui_ux_design_system.md#color-palette)**.
- **Add Textures:** Overlay **mist, grunge, or film grain** for atmosphere.

#### 8️⃣ Save & Organize (3 min)
- **Filename:** `[location_name]_[view]_[style].jpg`
- *Example: `garden_of_lies_wide_concept_art.jpg`*
- **Save To:** `docs/lore/assets/images/locations/`
- **Add to Gallery:** Update `docs/lore/assets/prompts/locations.txt` with the prompt.

**Example Output:** [The Garden of Lies Image](#)

---

### 🔹 WORKFLOW 2: GENERATING A CHARACTER PORTRAIT

**Goal:** Create a consistent, lore-accurate portrait of a character.

**Time Estimate:** 30-60 minutes

**Steps:**

#### 1️⃣ Gather Character Details (5 min)
- From the **character's profile**, note:
  - **Physical traits** (age, build, skin tone, hair, eyes)
  - **Clothing** (style, colors, accessories)
  - **Personality** (expression, posture)
  - **Visual Cues** (scars, tools, etc.)
  - **Background** (setting for the portrait)
- *Example (Javier Morales):*
  - Lean, wiry, scar on left cheek
  - Worn leather jacket, cap, fingerless gloves
  - Serious, calculating expression
  - Eastern district alley background

#### 2️⃣ Choose a Style (2 min)
- **Photorealistic** (for most characters)
- **Concept Art** (for stylized interpretation)
- **Portrait** (for close-ups)
- *Example: **Photorealistic, intimate framing**

#### 3️⃣ Pick a Pose & Expression (5 min)
- **Pose Options:**
  - Full-body
  - Upper-body
  - Close-up (face only)
- **Expression Options:**
  - **Miguel:** Calm, grounding, slight smile
  - **Carlos:** Bright, kind, eager
  - **Ana:** Direct, honest, no-nonsense
  - **Isabella:** Calm, unreadable, intense focus
  - **Alex:** Determined, intense, disheveled
- *Example: **Upper-body, slight turn, serious but kind expression**

#### 4️⃣ Build the Prompt (5 min)
- Use the **[Character Prompt Template](../prompt_library.md#character-portrait-template)**.
- **Example (Javier Morales):**
  ```
  Photorealistic portrait of Javier "El Fantasma" Morales, a 30-year-old smuggler with a scar across his left cheek, dark circles under his eyes from sleepless nights. Lean, wiry build, dark hair, sharp features. Wearing a worn leather jacket, cap pulled low, fingerless gloves. Background: a dimly lit alley in the eastern district, with crates of smuggled goods and a flickering streetlight. Moody lighting, tense expression, hyper-detailed, 8K. Hispanic and Native American heritage.
  --no neon, no androids, no clean backgrounds, no modern clothing
  ```

#### 5️⃣ Generate the Image (5 min)
- **Recommended Tools:**
  - **Leonardo.AI** (for consistency across multiple images)
  - **MidJourney** (for artistic quality)
- **Example (Leonardo.AI):**
  ```
  Model: Leonardo Diffusion XL
  Alchemy: On
  Preset: Cinematic
  Upscale: x2
  Prompt: [YOUR PROMPT HERE]
  ```

#### 6️⃣ Refine for Consistency (15 min)
- **Generate 4-5 variations** with the same seed (for consistency).
- **Use Face Swap** (if needed) to maintain the same face across images.
- **Inpaint** to fix:
  - Clothing details
  - Background elements
  - Lighting issues
- **Check Proportions:** Ensure the character matches their description (e.g., Miguel is large, Carlos is lean).

#### 7️⃣ Create Multiple Angles (10 min)
- Generate **3-4 portraits** of the same character:
  1. **Standard Portrait** (Upper-body, neutral expression)
  2. **Action Shot** (Character in their element)
  3. **Emotional Moment** (Sad, angry, determined)
  4. **Group Shot** (With other characters)
- *Example Prompts:*
  - **Action:** *"Javier Morales crouching in an alley, adjusting a burner phone, his scar glowing in the dim light."*
  - **Emotional:** *"Javier Morales looking at a photo of his brother, his expression a mix of grief and determination."*

#### 8️⃣ Save & Organize (3 min)
- **Filenames:**
  - `javier_morales_portrait.jpg`
  - `javier_morales_action.jpg`
  - `javier_morales_emotional.jpg`
  - `javier_morales_group.jpg`
- **Save To:** `docs/lore/assets/images/characters/`
- **Add to Gallery:** Update `docs/lore/assets/prompts/characters.txt` with prompts.

---

### 🔹 WORKFLOW 3: GENERATING A SCENE IMAGE

**Goal:** Create a dramatic image for a key story moment.

**Time Estimate:** 40-80 minutes

**Steps:**

#### 1️⃣ Gather Scene Details (10 min)
- From the **scene description**, note:
  - **Characters involved**
  - **Location**
  - **Time of day**
  - **Key actions**
  - **Mood**
  - **Duality/Contrast**
- *Example (Mercado Central USB Handoff):*
  - Characters: Miguel, Ana, Javier
  - Location: Mercado Central
  - Time: Dusk
  - Action: Javier slipping Miguel a USB in a loaf of bread
  - Mood: Tense, secretive
  - Contrast: Trust vs. danger

#### 2️⃣ Storyboard the Scene (10 min)
- Sketch **3-4 key moments** from the scene.
- *Example:*
  1. **Wide Shot:** Mercado Central at dusk, Javier approaching Miguel's stall.
  2. **Medium Shot:** Javier slipping the USB into the bread loaf.
  3. **Close-Up:** Miguel's hand closing around the bread, Ana watching.
  4. **Over-the-Shoulder:** A suspicious vendor watching from behind his stall.

#### 3️⃣ Choose a Composition (5 min)
- Pick **1-2 compositions** to generate:
  - **Wide Shot** (Establishing the scene)
  - **Medium Shot** (Main action)
  - **Close-Up** (Emotional detail)
  - **Dutch Angle** (Tension)
- *Example: **Medium Shot** (Javier handing off the USB) + **Close-Up** (Miguel's hand on the bread)

#### 4️⃣ Build the Prompts (10 min)
- Use the **[Scene Prompts](../prompt_library.md#scene-prompts)** as reference.
- **Example (Medium Shot):**
  ```
  Mercado Central at dusk, Javier Morales slipping a small USB drive into a loaf of pan de elote at a bread stall. Miguel Jhonson, a large man with broad shoulders, pretends to examine the bread while Ana Kim, a woman with a direct gaze, keeps watch. In the background, a suspicious vendor eyes them from behind his stall, his face half-hidden by shadows. Warm lighting from setting sun and flickering street lamps, tense atmosphere, photorealistic, 8K.
  --no modern tech, no clean market, no bright lighting
  ```
- **Example (Close-Up):**
  ```
  Extreme close-up of Miguel Jhonson's hand, weathered and strong, gripping a loaf of bread with a USB drive hidden inside. His knuckles are calloused, and a bead of sweat rolls down his temple. In the blurred background, Javier Morales watches, his expression unreadable. Moody lighting, hyper-detailed, cinematic, 8K.
  --no clean hands, no modern bread
  ```

#### 5️⃣ Generate the Images (10 min)
- Use **MidJourney** or **Stable Diffusion** for control.
- Generate **2-3 variations** of each composition.
- **Example (Stable Diffusion):**
  ```
  Checkpoint: Realistic Vision v5.1
  Sampler: DPM++ 2M Karras
  CFG Scale: 9
  Steps: 50
  Prompt: [YOUR PROMPT HERE]
  Negative Prompt: --no modern tech, no clean market, no bright lighting
  ```

#### 6️⃣ Refine & Composite (15 min)
- **Upscale** the best results.
- **Inpaint** to fix:
  - Character faces (if not accurate)
  - Background details
  - Lighting consistency
- **Composite** multiple images if needed (e.g., combine wide shot and close-up).
- **Color Grade** to match the scene's mood.

#### 7️⃣ Add Special Effects (5 min)
- **Depth of Field:** Blur background for close-ups.
- **Motion Blur:** For action scenes (e.g., chase scenes).
- **Light Effects:** Add lens flares, god rays, or glows.
- **Textures:** Overlay grunge, film grain, or mist.

#### 8️⃣ Save & Organize (5 min)
- **Filenames:**
  - `mercado_usb_handoff_wide.jpg`
  - `mercado_usb_handoff_medium.jpg`
  - `mercado_usb_handoff_closeup.jpg`
- **Save To:** `docs/lore/assets/images/scenes/`
- **Add to Gallery:** Update `docs/lore/assets/prompts/scenes.txt` with prompts.

---

---

## ✅ QUALITY CONTROL WORKFLOW

*Ensure all content meets the Las Flores standards.*

---

### 🔹 FOR ALL CONTENT

**Before Finalizing, Check:**

1. **Consistency Check**
   - [ ] Matches existing lore (no contradictions)
   - [ ] Follows the **Core Principles**
   - [ ] Uses correct **names, terms, and spellings**

2. **Connection Check**
   - [ ] Links to **2+ existing lore elements**
   - [ ] Cross-references are **accurate and functional**

3. **Duality Check**
   - [ ] Reflects **at least one core contrast**
   - [ ] Thematic depth is **clear and meaningful**

4. **Human Stakes Check**
   - [ ] Has **personal cost or emotional weight**
   - [ ] Characters' **motivations are clear**

---

### 🔹 FOR LORE ENTRIES

**Use the [Quality Control Checklist](../templates.md#for-lore-entries):**
- [ ] Duality Check
- [ ] Connection Check (2+ links)
- [ ] Human Stakes
- [ ] Consistency Check
- [ ] Cultural Check
- [ ] Tech Check
- [ ] Language Check (for narratives)

**Tools:**
- **Manual Review:** Read through carefully.
- **Peer Review:** Have another team member check.
- **Lore Map:** Verify connections on a visual map.

---

### 🔹 FOR UI/UX DESIGN

**Use the [UI Quality Control Checklist](../templates.md#for-uiux-design):**
- [ ] Visual Identity Check
- [ ] Navigation Check
- [ ] Lore Integration Check
- [ ] Responsive Check
- [ ] Accessibility Check
- [ ] Performance Check

**Tools:**
- **Figma/Adobe XD:** Use design system components.
- **Browser Testing:** Check on multiple devices.
- **Accessibility Checker:** Use tools like **axe DevTools**.

---

### 🔹 FOR IMAGES & VIDEOS

**Use the [Image Quality Control Checklist](../templates.md#for-imagesvideos):**
- [ ] Prompt Check
- [ ] Negative Prompt Check
- [ ] Consistency Check
- [ ] Quality Check
- [ ] Emotion Check
- [ ] Contrast Check

**Tools:**
- **Image Comparison:** Use **Diffchecker** to compare variations.
- **Color Analysis:** Use **Adobe Color** to verify palette.
- **Resolution Check:** Ensure minimum **2K resolution**.

---

---

## 📚 RELATED GUIDES

- **[Asset Generation Guide](./asset_generation_guide.md)** – Core principles and lore framework
- **[UI/UX Design System](./ui_ux_design_system.md)** – Visual identity and components
- **[Prompt Library](./prompt_library.md)** – Image/video generation templates
- **[Templates](./templates.md)** – Copy-paste resources and cheat sheets

---

## 📝 CHANGELOG

- **v1.0** (2026-07-01): Initial release – Comprehensive workflows for lore, UI, and assets
- **v1.1** (Planned): Add video generation workflows, more tool-specific tips

---

> **Need help?** Check the other guides in this folder or ask in the project's Discord.
