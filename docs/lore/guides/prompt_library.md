# LAS FLORES: PROMPT LIBRARY

> **Version:** 1.0  
> **Purpose:** Comprehensive collection of image and video generation prompts for Las Flores 2077.  
> **Audience:** AI artists, designers, content creators.  

---

## 🎯 TABLE OF CONTENTS

1. [Prompt Structure & Best Practices](#prompt-structure--best-practices)
2. [Master Prompts](#master-prompts)
3. [Location Prompts](#location-prompts)
4. [Character Prompts](#character-prompts)
5. [Scene Prompts](#scene-prompts)
6. [Thematic Prompts](#thematic-prompts)
7. [Video Prompts](#video-prompts)
8. [Negative Prompts](#negative-prompts)
9. [Tool-Specific Tips](#tool-specific-tips)

---

## 🔧 PROMPT STRUCTURE & BEST PRACTICES

*How to build effective prompts for Las Flores.*

---

### 🔹 CONSUMER INTENT TAGS

Tag every prompt with its consumer so generation settings match the target:

| Tag | Meaning | Generation Guidance |
|---|---|---|
| `[CONSUMER: phaser-sprite]` | Phaser Sprite/Atlas | Transparent background, centered, isolated asset, PNG with alpha |
| `[CONSUMER: html-background]` | DOM background image | No transparency required, 16:9 crop, JPEG acceptable |
| `[CONSUMER: tile]` | Map tile texture | Seamless tileable, no horizon, 1:1 crop, transparent optional |
| `[CONSUMER: portrait]` | Character portrait (both DOM + Phaser) | Transparent background, 3:4 crop, PNG with alpha |

**Usage:** Place the tag at the top of the prompt, after the title line. Example:
```
[CONSUMER: portrait]
Photorealistic portrait of ...
```

---

### 🔹 PROMPT STRUCTURE TEMPLATE

*Use this **modular system** to build any prompt:*

```
[STYLE] +
[SETTING] +
[MOOD] +
[LIGHTING] +
[COMPOSITION] +
[DETAILS] +
[CONTRAST] +
[TECHNICAL SPECS]
--no [NEGATIVE PROMPTS]
```

| **Category** | **Options for Las Flores** | **Example** |
|--------------|---------------------------|-------------|
| **Style** | Photorealistic, Concept Art, Cyberpunk (Soft), Architectural, Symbolic, Cinematic, Environmental Storytelling | *Photorealistic, soft cyberpunk* |
| **Setting** | Andean foothills, Pacific coast, Río de las Flores, Mercado Central, Luz del Río, Apartment Building, City Hall, etc. | *Mercado Central at dusk* |
| **Mood** | Tense, Hopeful, Melancholic, Gritty, Opulent, Industrial, Natural, Serene, Urgent, Forboding | *Tense, with underlying corruption* |
| **Lighting** | Dawn, Dusk, Night, Overcast, Streetlights, Industrial Glow, Natural Sunlight, Misty, Foggy | *Golden hour lighting with streetlight pools* |
| **Composition** | Wide Landscape, Street-Level, Aerial, Cross-Section, Interior, Portrait, Split-Screen (Diptych) | *Wide landscape, low angle to emphasize scale* |
| **Details** | Cableways, Contaminated River, Faded Murals, Luxury Skyscrapers, Poor Houses, Industrial Pipelines, Mist, Waves, etc. | *Cableways stretching over the river, faded graffiti on walls* |
| **Contrast** | Beauty vs. Corruption, Nature vs. Industry, Wealth vs. Poverty, Past vs. Future | *Vibrant market stalls with a bribe being slipped in the background* |
| **Technical Specs** | 8K, Hyper-Detailed, Atmospheric, Cinematic, Depth of Field, High Contrast, etc. | *8K, hyper-detailed, atmospheric depth of field* |

---

### 🔹 ADVANCED PROMPT TECHNIQUES

#### A. The "Layered Detail" Method

Add **3 layers of depth** to every prompt:
1. **Foreground** (Immediate focus)
2. **Midground** (Context)
3. **Background** (World-building)

**Example: The Apartment Building**
```
Foreground: A cross-section of the apartment building, showing a wealthy businessperson on a balcony (upper floor) and a working-class family at dinner (lower floor).
Midground: The faded, rounded architecture of the building, with peeling paint and multicultural murals.
Background: The stark, modern skyscrapers of the wealthy district looming in the distance, with the Andean foothills beyond.
Style: Architectural cross-section, photorealistic, warm lighting with cool accents.
```

#### B. The "Emotional Anchor" Method

Every prompt should include **one emotional trigger** to guide the AI.

| **Emotion** | **Prompt Additions** | **Example** |
|-------------|----------------------|-------------|
| **Hope** | "Fragile hope," "first light of dawn," "resilience" | *A fragile hope in the eyes of a child playing in the newly cleaned Río de las Flores* |
| **Despair** | "Crushing weight," "abandoned," "faded dreams" | *The crushing weight of defeat in the empty eyes of a factory worker, replaced by AI* |
| **Tension** | "Hidden danger," "whispers of corruption," "uneasy calm" | *An uneasy calm in Mercado Central, with whispers of corruption beneath the vibrant commerce* |
| **Anger** | "Simmering rage," "clenched fists," "unjust" | *Simmering rage in the clenched fists of a protester, facing down a line of police* |
| **Melancholy** | "Ghosts of the past," "lingering sorrow," "faded memories" | *Lingering sorrow in the empty chair at the café where Carlos used to sit* |
| **Awe** | "Majestic," "overwhelming scale," "humbling" | *The overwhelming scale of Luz del Río energy plant against the Andean foothills* |

#### C. The "Contrast Amplifier" Method

Explicitly **name the duality** you want to highlight.

**Template:**
```
A [SCENE] that captures the contrast between [CONCEPT A] and [CONCEPT B], with [VISUAL ELEMENT A] representing the former and [VISUAL ELEMENT B] representing the latter.
```

**Examples:**
1. *A wide shot of Las Flores at dawn that captures the contrast between **natural beauty** and **industrial decay**, with the **Andean foothills** representing the former and the **Luz del Río energy plant** representing the latter.*
2. *A split-screen portrait of Miguel and Carlos that captures the contrast between **stability** and **adventure**, with Miguel's **grounded posture** representing the former and Carlos's **eager expression** representing the latter.*
3. *An environmental shot of the Río de las Flores that captures the contrast between **life** and **death**, with a **child playing in the shallows** representing the former and the **contaminated, murky water** representing the latter.*

---

---

## ⭐ MASTER PROMPTS

*Foundational prompts that define the Las Flores aesthetic.*

---

### 🔹 MASTER LANDSCAPE PROMPT

*The definitive view of Las Flores, capturing all key elements.*

```
A breathtaking dawn landscape of Las Flores, a South American near-future city nestled between the mist-shrouded Andean foothills and the crashing waves of the Pacific coast. The contaminated Río de las Flores winds through the city, its once-vibrant waters now murky under the early light. In the foreground, clusters of poor houses with rounded shapes and faded pastel colors huddle together, their peeling paint telling stories of a vibrant multicultural past. Behind them, towering luxury skyscrapers with stark, modern designs and glass facades pierce the sky, casting long shadows. On the mountain slope, the Luz del Río energy plant dominates the landscape with its massive turbines and crisscrossing pipelines, an industrial scar on the natural beauty. Cableways stretch across the scene, their cars suspended mid-air, connecting the poor outskirts to the wealthy districts. Soft streetlights and warm window glows from the houses create pools of light in the pre-dawn darkness, contrasting with the cold industrial glow from the plant. The atmosphere is one of quiet tension: a city of stunning beauty hiding corruption and inequality beneath its surface. Near-future soft cyberpunk aesthetic, no androids or extreme violence, but subtle signs of AI and automation in the environment. Cinematic composition, 8k, hyper-detailed, atmospheric lighting, photorealistic.
--no androids, no robots, no neon, no oversaturated, no blood, no gore, no modern day, no utopian
```

**Variations:**
- **Day Version:** Replace "dawn" with "midday" and adjust lighting to "natural sunlight filtering through smog"
- **Night Version:** Replace "dawn" with "night", add "neon signs flickering, industrial glow from the plant"
- **Rainy Version:** Add "rain-slicked streets reflecting the city lights, umbrellas dotting the crowd"

---

### 🔹 MASTER CITYSCAPE (Aerial View)

```
An aerial view of Las Flores at dusk, showcasing the city's stark contrasts from above. The Andean foothills rise in the background, their peaks obscured by mist, while the Pacific Ocean crashes against the shore in the distance. The Río de las Flores cuts through the city like a vein, its contaminated waters a dark line through the urban sprawl. Poor districts dominate the foreground, their rounded, faded buildings in warm terracotta and soft sage, while luxury skyscrapers in stark black and cold silver pierce the skyline in the wealthy areas. The Luz del Río energy plant glows on the mountain slope, its turbines spinning slowly. Cableways crisscross the city like spider webs, connecting the divided neighborhoods. The lighting is golden hour, casting long shadows across the cityscape, with streetlights beginning to flicker on. The scene captures the duality of Las Flores: a city of vibrant life and hidden decay. Photorealistic, hyper-detailed, wide-angle, 8k.
--no androids, no robots, no clean environments, no utopian
```

---

---

## 🏙️ LOCATION PROMPTS

*Detailed prompts for key Las Flores locations.*

---

### 🔹 1. MERCADO CENTRAL

**Vibrant Corruption**
```
Interior of Mercado Central in Las Flores at midday, a bustling market filled with colorful stalls, exotic spices, and fresh produce. Vendors in traditional and modern clothing call out prices in a cacophony of languages, while shoppers from all backgrounds weave through the crowds. The air is thick with the scent of grilled meats and fresh bread. But beneath the vibrant surface, subtle signs of corruption are visible: a police officer slipping an envelope into a vendor's apron, a merchant quickly hiding a package as a suit-clad official walks by, and the tense body language of a poor family counting their coins. The architecture reflects the city's multicultural heritage with faded murals depicting scenes from Europe, Asia, and Africa, their colors worn by time. Warm sunlight filters through the high, arched windows, casting long shadows across the stone floor. The contrast between the lively commerce and the underlying tension is palpable. Photorealistic, detailed textures, cinematic lighting, 8k.
--no neon, no androids, no clean environments
```

**Dawn at the Market**
```
Exterior shot of Mercado Central at dawn, as vendors set up their stalls for the day. The first light of morning casts a golden glow on the colorful awnings and displays. A few early shoppers move through the space, their faces half-lit by the warm light. In the background, the misty Andean foothills provide a serene backdrop, while the first streetlights flicker off. The scene captures the moment of transition, as the market wakes up but the city's corruption is not yet fully visible. Soft cyberpunk, atmospheric, warm color palette, 8k.
--no harsh lighting, no modern day
```

---

### 🔹 2. PARQUE DE LAS MONTAÑAS

**Serene Tension**
```
A misty dawn at Parque de las Montañas, a lush green oasis in the heart of Las Flores. Towering Andean foothills rise in the background, their peaks obscured by a thin layer of fog. The park itself is a haven of tranquility, with winding paths, ancient trees, and a small, still pond reflecting the pale morning light. A few early risers practice tai chi or read on benches, but the peace feels fragile. Subtle signs of the city's turmoil are present: a faded protest sign half-buried in the grass, a couple whispering urgently near a fountain, and a police drone circling high above, its red light blinking like a distant star. The lighting is soft and natural, with the first rays of dawn filtering through the leaves, creating dappled patterns on the ground. The scene captures the paradox of Las Flores: a place of beauty where corruption lurks just beyond the edge of sight. Photorealistic, atmospheric, soft color palette, 8k.
--no neon, no androids
```

**Protest Gathering**
```
A crowd gathering in Parque de las Montañas for a protest against the Luz del Río energy plant. People of all ages hold signs and banners, their faces a mix of determination and fear. The park's natural beauty contrasts with the industrial glow of the plant visible in the distance, its turbines spinning ominously. The atmosphere is tense but hopeful, with the sound of chants and the rustling of leaves. Environmental storytelling, cinematic, high contrast between nature and industry, 8k.
--no violence, no police brutality
```

---

### 🔹 3. LUZ DEL RÍO ENERGY PLANT

**Industrial Might**
```
The Luz del Río energy plant at dusk, a colossal industrial complex clinging to the side of the Andean foothills. Massive turbines spin slowly, their blades catching the last light of the setting sun, while a network of pipelines and power lines crisscrosses the landscape like metallic veins. The plant looms over the surrounding valley, its imposing silhouette a testament to human ingenuity—and hubris. In the foreground, a handful of workers in protective gear and hard hats move like ants among the machinery, their faces illuminated by the cold glow of industrial lights. The plant's hum is almost a physical presence, vibrating through the air. In the distance, the natural beauty of the mountains and the setting sun create a stark contrast with the man-made monstrosity. The scene conveys both the awe-inspiring scale of the plant and the environmental cost it exacts on the land. Industrial photography style, high detail, dramatic lighting, 8k.
--no clean environments, no utopian
```

**Night Operations**
```
The Luz del Río energy plant at night, its massive turbines illuminated by cold industrial lights against the dark sky. Steam rises from the cooling towers, and the hum of machinery fills the air. In the foreground, a lone security guard patrolling the perimeter, his flashlight cutting through the darkness. The Andean foothills in the background are barely visible, shrouded in mist. The scene is oppressive and cold, with the plant's glow casting long, sharp shadows. Soft cyberpunk, high contrast, moody, 8k.
--no neon, no androids
```

---

### 🔹 4. THE APARTMENT BUILDING

**Microcosm of Conflict**
```
A cross-section view of the iconic apartment building in Las Flores, a vertical slice revealing the lives within. The building's exterior shows its age: faded paint, peeling plaster, and rounded architectural details that hint at its multicultural heritage. Inside, the contrast is stark. On the upper floors, a wealthy businessperson in a sleek suit sips coffee on a balcony overlooking the city, while on the lower floors, a working-class family gathers around a modest dinner table. In between, a student burns the midnight oil at a cluttered desk, and an elderly woman waters her plants on a tiny windowsill. The building is a microcosm of the city: diverse, unequal, and full of unseen tensions. In the background, the stark, modern lines of luxury skyscrapers rise above the faded rooftops, a constant reminder of the gap between rich and poor. The scene is lit by the warm glow of lamplight and the cool blue of the evening sky, creating a balance between intimacy and exposure. Architectural cross-section style, detailed interiors, storytelling composition, 8k.
--no clean interiors, no utopian
```

**Exterior at Dawn**
```
Exterior shot of the apartment building at dawn, its faded facade catching the first light of day. The building's rounded corners and once-vibrant colors are now muted, but signs of life are everywhere: laundry hanging from windows, a child playing on the stoop, an old man sweeping the sidewalk. In the background, the first workers head to their jobs, passing by the towering luxury buildings that cast long shadows over the street. The scene captures the resilience of the building's residents despite the decay. Photorealistic, warm lighting, atmospheric, 8k.
--no stark buildings, no modern day
```

---

### 🔹 5. RÍO DE LAS FLORES

**The Contaminated Heart**
```
A close-up view of the Río de las Flores as it winds through the industrial sector of Las Flores at dawn. The water, once a symbol of life, is now murky and unnatural, its surface reflecting the sickly glow of nearby factories. On the banks, poor families wash clothes or fish for their meals, their faces etched with resignation. In the distance, the Luz del Río energy plant looms, its pipes dumping waste into the river under the cover of early morning. The air is thick with the scent of chemicals and decay. Despite the pollution, there's a strange beauty to the scene: the way the light catches the ripples on the water, the resilience of the people who depend on the river, and the contrast between the natural and the industrial. The colors are muted, dominated by browns, grays, and sickly greens, with only hints of the river's former vibrancy. Photorealistic, environmental storytelling, moody lighting, 8k.
--no clean water, no pristine environments
```

**Flashback: Clean River**
```
A nostalgic, dreamlike memory of the Río de las Flores before contamination. The water is crystal clear, reflecting the blue sky and the lush greenery of the riverbanks. Children play in the shallows, and fishermen cast their nets from wooden boats. The Andean foothills in the background are vibrant and alive, and the air smells of fresh water and earth. The scene is bathed in a soft, golden light, as if viewed through the haze of memory. Impressionistic style, warm colors, nostalgic mood, 8k.
--no pollution, no industry
```

---

### 🔹 6. CITY HALL ARCHIVES

**Secrets in the Dark**
```
The City Hall archives at night, illuminated only by the flickering glow of old fluorescent lights and the screens of computers. Rows of filing cabinets stretch into the darkness, their labels worn and faded. Dust motes dance in the beams of flashlights held by unseen researchers. In the corner, a security guard dozes at his desk, unaware of the intruders moving silently through the stacks. The air is thick with the scent of old paper and the tension of hidden truths. The scene is dark and atmospheric, with deep shadows and pools of light creating a sense of mystery and urgency. Photorealistic, high contrast, moody, 8k.
--no bright lighting, no modern offices
```

**Break-In Scene**
```
A tense moment during the City Hall archive break-in. Isabella crouches behind a row of filing cabinets, her tablet glowing faintly as she photographs a document. In the corridor outside, Miguel and Ana argue in hushed tones with a guard who has discovered them. The guard's flashlight sweeps the area, its beam cutting through the darkness. The scene is lit by the cold glow of Isabella's tablet and the flickering overhead lights, creating sharp contrasts between light and shadow. Cinematic, high tension, dynamic lighting, 8k.
--no violence, no blood
```

---

### 🔹 7. ANDEAN FOOTHILLS

**Misty Guardians**
```
The Andean foothills at dawn, shrouded in a thick mist that rolls down the slopes like a living thing. The peaks are barely visible, their outlines softened by the fog. Ancient trees and hardy shrubs cling to the rocky terrain, their leaves glistening with dew. In the distance, the first lights of Las Flores begin to twinkle, a stark contrast to the natural wilderness. The scene is peaceful but foreboding, as if the mountains are watching the city, waiting. The colors are muted blues, grays, and greens, with the only bright spots being the distant city lights. Photorealistic, atmospheric, soft focus, 8k.
--no clear skies, no modern buildings
```

**From the City**
```
A view of the Andean foothills from a rooftop in Las Flores, the mountains looming over the city like silent sentinels. The mist obscures their lower slopes, and the peaks are lost in the clouds. In the foreground, the city sprawls out: the Río de las Flores winding through the buildings, the Luz del Río plant glowing on the mountain slope, and the cableways stretching like spider silk between the districts. The contrast between the natural and the man-made is stark, with the mountains seeming ancient and unchanging compared to the city's constant motion. Wide-angle landscape, cinematic, high detail, 8k.
--no clean cityscape, no utopian
```

---

### 🔹 8. PACIFIC COAST

**Relentless Waves**
```
The Pacific coast near Las Flores at sunset, the waves crashing against the rocky shore with relentless force. The water is a deep blue-gray, its surface choppy and wild. Seagulls circle overhead, their cries mixing with the sound of the surf. In the distance, the lights of the city begin to twinkle, a stark contrast to the natural power of the ocean. The sky is a mix of oranges, purples, and deep blues, with the setting sun casting long shadows across the landscape. The scene captures the duality of the coast: a place of natural beauty and relentless energy, mirroring the struggle of the city's inhabitants. Photorealistic, dynamic, atmospheric, 8k.
--no calm seas, no pristine beaches
```

**Docks at Dawn**
```
The docks of Las Flores at dawn, as fishermen prepare their boats for the day's work. The wooden piers are weathered and worn, the planks groaning underfoot. Nets and fishing gear are stacked neatly, and the scent of salt and fish fills the air. In the background, the first light of day reflects off the water, and the Andean foothills are visible as dark outlines against the brightening sky. The scene is one of quiet industry, a moment of calm before the day's labor begins. Environmental storytelling, warm lighting, detailed textures, 8k.
--no modern docks, no clean environments
```

---

---

## 👤 CHARACTER PROMPTS

*Detailed prompts for generating character portraits and scenes.*

---

### 🔹 CHARACTER PORTRAIT TEMPLATE

```
Photorealistic portrait of [NAME], a [AGE]-year-old [ROLE] from Las Flores. [PHYSICAL DESCRIPTION: skin tone, build, hair, eyes]. [EXPRESSION: e.g., calm and determined, weary but hopeful]. Dressed in [CLOTHING: practical/stylish/wear], with [ACCESSORIES: tools, weapons, personal items]. The background shows [SETTING: location or environment relevant to the character]. The lighting is [LIGHTING: warm/cool/moody], casting [SHADOWS: soft/sharp] on [FEATURES: face, hands, etc.]. [MOOD: e.g., hopeful, melancholic, tense]. Hyper-detailed, 8k, emotional depth.
--no neon, no androids, no clean backgrounds
```

---

### 🔹 INDIVIDUAL PORTRAITS

#### Miguel Jhonson
```
Photorealistic portrait of Miguel Jhonson, a 24-year-old logistics worker and urban management student from Las Flores's western district. He has broad shoulders and a sturdy frame, with a calm, grounding presence that makes him the rock of his friend group. His skin is a rich, warm brown, and his dark, curly hair is cropped short. He's dressed in practical clothing—a sturdy work shirt, cargo pants, and well-worn boots—reflecting his hands-on approach to life. His expression is serious but kind, with a hint of a smile playing at the corners of his mouth, as if he's about to share a joke. The background shows the bustling western district: colorful market stalls, children playing in the streets, and the faded facades of old buildings. The lighting is warm and natural, highlighting the texture of his skin and the sincerity in his eyes. Hyper-detailed, intimate framing, 8k.
--no modern clothing, no clean backgrounds
```

#### Carlos Lacan
```
Photorealistic portrait of Carlos Lacan, a 24-year-old electrical engineering student and the emotional heart of Alex's friend group. He has a lean build, with warm brown skin and a mop of dark, slightly unruly hair. His eyes are bright and kind, always crinkling at the corners as if he's about to laugh. He's wearing a simple t-shirt with the sleeves rolled up, revealing arms dusted with freckles and the faint scars of a tinkerer. In his hands, he holds a multimeter and a notebook, tools of his trade. The background is the cluttered but cozy interior of the electronics repair shop where he works part-time: shelves lined with tools, half-disassembled gadgets, and the warm glow of a desk lamp. The lighting is soft and inviting, casting a gentle glow on his face. There's a framed photo of him on the counter in the background, a silent tribute to his memory. Hyper-detailed, warm tones, nostalgic mood, 8k.
--no clean environments, no modern tools
```

#### Ana Kim
```
Photorealistic portrait of Ana Kim, a 25-year-old social work student and library worker from Las Flores's middle districts. She has a slender build, with fair skin, dark almond-shaped eyes, and long black hair tied back in a practical ponytail. Her expression is direct and honest, with a no-nonsense gaze that betrays her sharp intellect. She's dressed in a simple, neat outfit—a blouse, a cardigan, and a pair of comfortable trousers—reflecting her organized and practical nature. In her hands, she holds a stack of books and a notebook, tools of her trade as a researcher. The background is the quiet, wood-paneled interior of the university library, with towering bookshelves and pools of light from old-fashioned lamps. The lighting is soft and natural, highlighting her focused expression and the warmth in her eyes. Hyper-detailed, calm atmosphere, 8k.
--no modern clothing, no sterile environments
```

#### Isabella Vargas
```
Photorealistic portrait of Isabella Vargas, a 23-year-old architecture and urban studies student from Las Flores's eastern district. She has a medium build, with olive skin, sharp features, and dark, straight hair cut just above her shoulders. Her expression is calm and unreadable, but her eyes betray a keen intelligence and a quiet intensity. She's dressed in a minimalist, modern outfit—a black turtleneck, a long coat, and tailored pants—that reflects her analytical and precise nature. In her hands, she holds a tablet displaying a complex spreadsheet, the tool she used to uncover the patterns behind the Las Estrellas murders. The background is a sleek, modern architecture studio, with blueprints and models of buildings scattered across a large table. The lighting is cool and precise, with a single desk lamp casting sharp shadows. Hyper-detailed, high contrast, focused mood, 8k.
--no warm lighting, no cluttered backgrounds
```

#### Alex Garcia
```
Photorealistic portrait of Alex Garcia, a 23-year-old architecture student and the leader of the Las Estrellas investigation. He has a lean, athletic build, with warm olive skin and dark, expressive eyes that seem to burn with intensity. His dark hair is slightly disheveled, as if he's been running his hands through it in frustration. He's dressed in casual but stylish clothing—a fitted shirt, a leather jacket, and worn-in jeans—that reflects his role as both a student and a revolutionary. In his hands, he holds a notebook filled with sketches and notes, the physical manifestation of his investigations. The background is a dimly lit café, the kind where the group often met, with the warm glow of string lights and the faint outline of the other group members in the background. The lighting is warm and intimate, casting soft shadows that highlight his determined expression. Hyper-detailed, charismatic, 8k.
--no modern styling, no clean environments
```

---

### 🔹 GROUP PORTRAITS

#### The Core Group Together
```
A candid, intimate scene of Alex's core group—Miguel, Carlos, Ana, and Isabella—gathered around a small table in a dimly lit café in Las Flores. The café is cozy, with warm lighting from old-fashioned lamps and the scent of coffee hanging in the air. Miguel sits with his arms crossed, his expression serious but supportive. Carlos leans forward, his hands animated as he explains something technical, a half-smile on his face. Ana sits with her arms folded, listening intently, her direct gaze fixed on Carlos. Isabella is slightly apart from the group, her fingers tapping on a tablet, her expression thoughtful. The camera angle is slightly above and to the side, giving a sense of intimacy and inclusion, as if the viewer is part of the group. The lighting is warm and soft, with shadows playing across their faces, highlighting the bond between them. This is a moment of calm before the storm—a snapshot of the group before Carlos's death changes everything. Photorealistic, emotional, cinematic lighting, 8k.
--no modern café, no bright lighting
```

#### The Group After Carlos's Death
```
A somber scene of the remaining group—Miguel, Ana, and Isabella—sitting in silence at the same café table after Carlos's death. Miguel stares at his hands, his broad shoulders slumped in a way that seems unnatural for him. Ana's expression is distant, her usual directness replaced by a quiet sadness. Isabella's fingers tap restlessly on the table, her calm exterior cracked by the tension in her jaw. The café is darker now, the warm lighting unable to penetrate the weight of their grief. In the background, the framed photo of Carlos that usually hangs behind the bar is now draped with a black cloth. The scene captures the moment when the group realizes that nothing will be the same. Photorealistic, melancholic, high contrast between light and shadow, 8k.
--no bright colors, no happy expressions
```

---

### 🔹 CHARACTER IN ACTION

#### Miguel Building the Network
```
Miguel Jhonson in his element, organizing a safehouse in the western district of Las Flores. He stands in a dimly lit room, a map of the city spread out on a table before him. His hands move deftly as he places pins and draws lines, connecting safe locations across the district. Around him, other members of the movement work quietly—some packing supplies, others testing communication equipment. The room is cluttered but organized, with stacks of medical supplies and crates of food in the corner. The lighting is practical: a single lamp casting long shadows, and the glow of a tablet showing a list of contacts. Miguel's expression is focused but calm, the kind of concentration that comes from doing something he's good at. Photorealistic, warm lighting, detailed, 8k.
--no modern tech, no clean rooms
```

#### Isabella at Work
```
Isabella Vargas hunched over her tablet in a quiet corner of the university library, the screen casting a cold glow on her face. She's surrounded by papers—printouts of documents, handwritten notes, and a sprawling spreadsheet that seems to contain the entire Las Estrellas investigation. Her fingers fly over the keyboard, and her expression is one of intense focus, as if she's chasing a pattern only she can see. In the background, the towering bookshelves of the library stretch into the darkness, their contents a blur of knowledge waiting to be uncovered. The scene is quiet but electric, the tension of the investigation palpable in the air. Photorealistic, high contrast, moody, 8k.
--no modern devices, no bright lighting
```

#### Carlos on the Roof
```
Carlos Lacan on a rooftop at night, installing surveillance cameras for the Las Estrellas investigation. He's crouched low, his hands steady as he works with the equipment. The city sprawls out beneath him, a sea of lights and shadows, with the Andean foothills a dark silhouette in the distance. His expression is a mix of concentration and quiet excitement—this is the kind of technical challenge he lives for. The lighting is dim, with only the faint glow of his headlamp and the city lights below illuminating the scene. The scene captures the moment before the danger becomes real. Photorealistic, tense, atmospheric, 8k.
--no modern equipment, no bright city
```

---

---

## 🎬 SCENE PROMPTS

*Dramatic moments from the Las Flores story.*

---

### 🔹 KEY STORY MOMENTS

#### Carlos's Death (The Car Chase)
```
A dramatic, high-speed chase scene on the rain-slicked streets of Las Flores at night. A black car, its headlights cutting through the darkness, races through the empty streets, pursued by a second vehicle. Inside the first car, Carlos Lacan is at the wheel, his expression a mix of fear and determination. Beside him, Ana Kim clutches the door, her knuckles white, while Miguel Jhonson in the back seat barks instructions into a radio. The city blurs past them: the glow of streetlights, the flicker of neon signs, the shadows of towering buildings. The rain streaks across the windshield, distorting the view, while the tires screech on the wet pavement. In the distance, the lights of the Luz del Río energy plant loom like a beacon of doom. The scene is tense and urgent, with a sense of inevitability hanging in the air. The lighting is dramatic, with harsh contrasts between light and shadow, and the colors are cool and muted, dominated by blacks, blues, and grays. Cinematic, action-packed, high detail, 8k.
--no blood, no gore, no extreme violence
```

#### City Hall Archive Break-In
```
A tense, high-stakes scene inside the City Hall archives at night. Isabella Vargas moves silently through the stacks, her tablet glowing faintly as she photographs documents. The archives are a maze of towering shelves and filing cabinets, their contents a testament to the city's history—and its corruption. In another aisle, Miguel and Ana argue in hushed tones with a guard who has discovered them. The guard's flashlight sweeps the area, its beam cutting through the darkness and illuminating the dust motes dancing in the air. The scene is lit by the cold glow of Isabella's tablet, the flickering overhead lights, and the guard's flashlight, creating a dynamic interplay of light and shadow. The tension is palpable, as every sound—the creak of a floorboard, the rustle of paper—could mean discovery. Cinematic, high contrast, moody, 8k.
--no violence, no weapons
```

#### The Estate Raid
```
The climactic raid on the estate housing the evidence against Mayor Vega and Senator Chen. Alex Garcia leads the charge, his expression a mix of determination and fear. Behind him, the group moves as one—Miguel with his logistical precision, Isabella with her analytical focus, Ana with her quiet strength. The estate looms before them, its gates heavily guarded, but the group has a plan. In the background, the first light of dawn begins to break over the city, casting long shadows and creating a stark contrast with the dark estate. The scene captures the moment when the group's months of work come to a head. Cinematic, dramatic lighting, high tension, 8k.
--no violence, no weapons
```

#### Alex's Broadcast
```
Alex Garcia in the final moments before his broadcast, the one that will expose the truth about Las Flores to the world. He stands in a hidden studio, the camera pointed at him, its red light blinking. Behind him, a monitor displays the feed that will go out to the city—and the world. His expression is a mix of exhaustion and resolve, his hands gripping the edges of the desk as if it's the only thing holding him up. In the background, the other members of the group watch from a separate monitor, their faces a mix of hope and fear. The lighting is dramatic, with the camera light casting sharp shadows on Alex's face and the monitor glow illuminating the room. The scene captures the weight of the moment—the culmination of everything they've worked for. Photorealistic, emotional, high contrast, 8k.
--no modern tech, no clean studio
```

---

### 🔹 ATMOSPHERIC SCENES

#### Dawn Over Las Flores
```
A wide shot of Las Flores at dawn, the city just beginning to wake. The first light of day casts a golden glow over the Andean foothills, while the Pacific coast is still shrouded in mist. The Río de las Flores winds through the city, its contaminated waters reflecting the pale light. In the poor districts, the first vendors set up their stalls in Mercado Central, and the scent of fresh bread fills the air. In the wealthy districts, the luxury skyscrapers stand silent and imposing, their windows still dark. The scene captures the city in transition, a moment of quiet before the chaos of the day begins. Photorealistic, atmospheric, warm lighting, 8k.
--no clean cityscape, no modern day
```

#### Night in the Poor Districts
```
A scene from the poor districts of Las Flores at night. The streets are alive with activity, despite the late hour: vendors selling food from carts, children playing in the alleyways, neighbors chatting on stoops. The only light comes from streetlamps and the warm glow of windows, creating pools of gold in the darkness. In the background, the luxury buildings of the wealthy districts loom, their windows dark and forbidding. The scene is warm and communal, but the contrast with the wealthy areas is impossible to ignore. Photorealistic, warm lighting, detailed textures, 8k.
--no bright lights, no modern buildings
```

#### The Cableways at Dusk
```
The cableways of Las Flores at dusk, their cars suspended high above the city. Below, the city begins its evening routine: lights flicker on in houses, vendors pack up their stalls, and the first workers head home. The cableway cars move slowly, their windows reflecting the last light of day. In the distance, the Luz del Río plant glows on the mountain slope, its turbines spinning against the darkening sky. The scene captures the interconnectedness of the city, and the daily journey of its inhabitants between worlds that are physically close but socially distant. Cinematic, atmospheric, wide-angle, 8k.
--no modern cableways, no clean city
```

---

---

## 💭 THEMATIC PROMPTS

*Symbolic and conceptual images that explore Las Flores' themes.*

---

### 🔹 BEAUTY VS. CORRUPTION

#### Diptych: The Two Faces of Las Flores
```
A vertical diptych (split-screen) contrasting the two faces of Las Flores. Left side: The natural beauty of the city—lush Andean foothills, the pristine Pacific coast, a clean and vibrant Río de las Flores, the bustling and honest Mercado Central, and the peaceful Parque de las Montañas. The colors are bright and saturated, with warm lighting and a sense of life and hope. Right side: The corruption beneath the surface—the contaminated river, the industrial complex on the mountain, luxury buildings casting long shadows over poor houses, a backroom deal in the mayor's office, and a police officer taking a bribe. The colors are muted and cold, with harsh lighting and a sense of decay and despair. The split between the two sides is a thin, jagged line of dawn light, symbolizing the fragile balance between the two realities. Conceptual art style, high contrast, symbolic composition, 8k.
--no utopia, no dystopia
```

#### The River's Story
```
A series of three images telling the story of the Río de las Flores. First image: The river as it once was, clean and vibrant, reflecting the blue sky and lush greenery of its banks. Children play in the water, and fishermen cast their nets. Second image: The river as it is now, contaminated and murky, its waters a sickly green-brown. Factories line its banks, their pipes dumping waste into the water. Third image: A hopeful vision of the river's future, its waters gradually clearing as cleanup efforts take hold. The people on its banks are determined, their faces reflecting both the damage that has been done and the possibility of redemption. Triptych, environmental storytelling, symbolic, 8k.
--no clean water in present day
```

---

### 🔹 NATURE VS. INDUSTRY

#### The Mountain's Scar
```
A stark contrast between the natural Andean foothills and the industrial Luz del Río energy plant. The mountains rise in the background, their peaks obscured by mist, their slopes covered in lush vegetation. In the foreground, the energy plant dominates the landscape, its massive turbines and pipelines a jarring imposition on the natural beauty. The scene is lit by the cold glow of the plant's lights, which cast long, sharp shadows across the mountain slope. The contrast between the organic shapes of the mountains and the geometric lines of the plant is deliberate and jarring. Environmental storytelling, high contrast, dramatic lighting, 8k.
--no harmony, no clean industry
```

#### The Last Green Space
```
Parque de las Montañas as the last truly green space in Las Flores, a small oasis of nature surrounded by the encroaching city. The park's trees and grass are lush and vibrant, but in the background, the city looms: luxury skyscrapers, industrial complexes, and the ever-present Luz del Río plant. The contrast is stark, with the park seeming almost unnaturally green compared to the muted colors of the city. The scene captures the precariousness of nature in Las Flores, a beauty that is constantly under threat. Photorealistic, high contrast, atmospheric, 8k.
--no clean city, no utopia
```

---

### 🔹 WEALTH VS. POVERTY

#### The Divided City
```
A wide shot of Las Flores that captures the city's stark wealth divide. In the foreground, the poor districts: rounded buildings with faded paint, laundry hanging from windows, children playing in the streets. In the background, the wealthy districts: towering luxury skyscrapers with glass facades, their windows reflecting the cold light of the city. The contrast is deliberate and jarring, with the poor districts in warm, faded colors and the wealthy districts in stark, cold tones. The scene captures the inequality that defines Las Flores. Photorealistic, high contrast, atmospheric, 8k.
--no middle class, no clean environments
```

#### Two Worlds, One Street
```
A single street in Las Flores that perfectly captures the city's wealth divide. On one side of the street, a poor family sits on their stoop, their home a faded, rounded building with peeling paint. On the other side, a luxury car pulls up to a gleaming skyscraper, its doorman rushing to open the door. The street itself is a neutral ground, but the contrast between the two sides is impossible to ignore. The scene is lit by the warm glow of streetlights, which cast long shadows and highlight the divide. Photorealistic, high contrast, storytelling, 8k.
--no harmony, no clean street
```

---

### 🔹 PAST VS. FUTURE

#### Faded Memories
```
A faded mural on the side of a poor district building, its once-vibrant colors now muted and chipped. The mural depicts a scene from Las Flores' multicultural past: people from Europe, Asia, Africa, and Latin America coming together, their faces full of hope and possibility. In the foreground, a group of children play, their attention focused on a small, modern device—perhaps a tablet or a phone. The contrast between the mural's depiction of the past and the children's focus on the future captures the tension of Las Flores' identity. Photorealistic, nostalgic, warm lighting, 8k.
--no clean mural, no modern devices
```

#### The New Architecture
```
A stark, modern building rising among the faded, rounded architecture of the poor districts. The new building is all sharp lines and cold materials, its glass facade reflecting the muted colors of the surrounding area. In the foreground, a group of poor district residents watch the construction, their expressions a mix of awe and unease. The scene captures the tension between progress and tradition, between the future the city is building and the past it is leaving behind. Photorealistic, high contrast, atmospheric, 8k.
--no harmony, no clean construction
```

---

---

## 🎥 VIDEO PROMPTS

*For generating cinematic scenes with tools like Runway ML, Pika Labs, or Sora.*

---

### 🔹 VIDEO PROMPT STRUCTURE

```
[SCENE TYPE] +
[SETTING] +
[CHARACTERS] +
[ACTION] +
[CAMERA WORK] +
[LIGHTING] +
[MOOD] +
[SOUND DESIGN (optional)] +
[STYLE]
```

---

### 🔹 KEY VIDEO SCENES

#### Opening Shot: Dawn Over Las Flores
```
Establishing shot of Las Flores at dawn, a slow aerial pan over the city. The camera starts on the Andean foothills, shrouded in mist, then moves over the Pacific coast, where waves crash against the shore. It continues over the Río de las Flores, its contaminated waters winding through the city, and finally settles on the Luz del Río energy plant, its turbines beginning to spin as the sun rises. The camera work is smooth and cinematic, with a slow, deliberate pace. The lighting is soft and golden, with the first light of day casting long shadows. The mood is one of quiet tension, as the city wakes up to another day of beauty and corruption. Soft cyberpunk, cinematic, 8k, 24fps, 10 seconds.
--no modern drones, no clean city
```

#### The Chase Scene
```
A high-speed car chase through the rain-slicked streets of Las Flores at night. The camera follows the fleeing car, its headlights cutting through the darkness, as it weaves through traffic and takes sharp turns. Inside the car, Carlos grips the wheel, his expression a mix of fear and determination, while Ana and Miguel brace themselves in the back. The camera work is dynamic and shaky, capturing the urgency of the moment. The lighting is dramatic, with the car's headlights illuminating the rain-soaked streets and the flickering neon signs of the city. The mood is tense and urgent, with a sense of inevitability. Cinematic, high-energy, dramatic lighting, 8k, 60fps, 15 seconds.
--no extreme violence, no blood
```

#### The Break-In (Time-Lapse)
```
A time-lapse of the City Hall archive break-in, from Isabella's perspective. The camera starts outside the archives, its lens obscured by fog, then moves through the window as Isabella enters. It follows her through the stacks, capturing her stealthy movements and the documents she photographs. Meanwhile, in split-screen, we see Miguel and Ana dealing with the guard, their tense negotiation playing out in silence. The camera work is handheld and shaky, adding to the tension. The lighting is dim and moody, with only the glow of Isabella's tablet and the flickering overhead lights illuminating the scene. The mood is one of suspense and focus. Cinematic, time-lapse, high contrast, 8k, 24fps, 20 seconds.
--no violence, no weapons
```

#### The Broadcast
```
Alex Garcia delivering his broadcast, the camera fixed on his face as he speaks to the city. The shot starts tight on his eyes, then slowly pulls back to reveal the studio around him—the monitors, the notes, the weight of the moment. The lighting is dramatic, with the camera light casting sharp shadows on his face. The mood is intense and emotional, as Alex exposes the truth about Las Flores. The camera work is static but powerful, with the focus entirely on Alex and his words. Cinematic, emotional, high contrast, 8k, 24fps, 30 seconds.
--no modern studio, no clean environments
```

#### Cableway Journey
```
A serene cableway ride over Las Flores at dawn. The camera is mounted on the cableway car, capturing the view as it moves over the city. Below, the poor districts wake up: vendors set up their stalls, children play in the streets, workers head to their jobs. In the distance, the wealthy districts and the Luz del Río plant loom, their cold, industrial lines a stark contrast to the warmth of the poor areas. The camera work is smooth and steady, with a slow, deliberate pace. The lighting is soft and golden, with the first light of day illuminating the city. The mood is one of quiet reflection, as the cableway connects the divided parts of Las Flores. Cinematic, atmospheric, wide-angle, 8k, 24fps, 15 seconds.
--no modern cableways, no clean city
```

---

---

## ❌ NEGATIVE PROMPTS

*What to **exclude** from your Las Flores prompts to maintain consistency.*

---

### 🔹 UNIVERSAL NEGATIVE PROMPTS

Add these to **all** Las Flores prompts:
```
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural
```

---

### 🔹 LOCATION-SPECIFIC NEGATIVES

| **Location** | **Negative Prompts** | **Why?** |
|--------------|----------------------|----------|
| **Andean Foothills** | `--no modern buildings, no clear skies, no pristine nature` | Maintain the **mystical, foreboding** mood. |
| **Pacific Coast** | `--no calm seas, no pristine beaches, no tourist resorts` | Keep the **relentless, powerful** energy. |
| **Río de las Flores** | `--no clean water, no pristine riverbanks, no recreational activities` | Emphasize **contamination and decay**. |
| **Luz del Río** | `--no clean industry, no eco-friendly design, no happy workers` | Show **oppression and environmental cost**. |
| **Mercado Central** | `--no empty market, no sterile environment, no modern shopping mall` | Maintain **vibrancy and hidden corruption**. |
| **Parque de las Montañas** | `--no crowded park, no modern playground, no clean nature` | Keep the **serene but tense** atmosphere. |
| **Apartment Building** | `--no luxury interior, no clean exterior, no modern architecture` | Show **decay and class collision**. |
| **City Hall** | `--no bright lighting, no modern offices, no transparent government` | Emphasize **secrecy and corruption**. |

---

### 🔹 CHARACTER-SPECIFIC NEGATIVES

| **Character** | **Negative Prompts** | **Why?** |
|--------------|----------------------|----------|
| **Miguel** | `--no small build, no weak posture, no clean clothing` | He's **large, sturdy, practical**. |
| **Carlos** | `--no aggressive expression, no unkempt appearance, no modern tools` | He's **kind, methodical, technical**. |
| **Ana** | `--no disorganized appearance, no unclear expression, no modern devices` | She's **direct, honest, practical**. |
| **Isabella** | `--no emotional expression, no messy workspace, no outdated tech` | She's **focused, precise, analytical**. |
| **Alex** | `--no clean appearance, no uncertain expression, no modern styling` | He's **charismatic, determined, disheveled**. |

---

---

## 🛠️ TOOL-SPECIFIC TIPS

*Optimize prompts for different AI tools.*

---

### 🔹 MIDJOURNEY

**Strengths:** Best for **artistic, stylized** images.

**Tips:**
- Use `--v 6` for **realism**.
- Add `intricate details` for **textures**.
- Use `--ar 16:9` for **landscapes**, `--ar 3:4` for **portraits**.
- Add `--style raw` for **photorealism**.
- Use `--chaos 20-40` for **varied compositions**.

**Example Settings:**
```
--v 6 --ar 16:9 --style raw --chaos 20
```

**MidJourney-Specific Prompt Adjustments:**
- Replace "Photorealistic" with `photo, ultra-detailed, octane render`
- Add `trending on ArtStation` for artistic styles
- Use `unreal engine 5` for hyper-realism

**Example (Mercado Central):**
```
photo of Mercado Central in Las Flores at midday, ultra-detailed, octane render, a bustling market with colorful stalls and hidden corruption, warm sunlight filtering through high windows, faded multicultural murals on walls, vendors and shoppers from diverse backgrounds, subtle signs of bribery and police indifference, trending on ArtStation, 8k
--v 6 --ar 16:9 --style raw --chaos 30
```

---

### 🔹 STABLE DIFFUSION

**Strengths:** Best for **control** (negative prompts, inpainting).

**Tips:**
- Use **Checkpoint:** `Realistic Vision` or `Juggernaut` for realism.
- Add `hyper-detailed` for **depth**.
- Use **CFG scale:** 7-12 (7 for more creative, 12 for more precise).
- Use **Sampler:** `DPM++ 2M Karras` for best quality.
- Use **Steps:** 40-50 for high detail.

**Example Settings:**
```
Checkpoint: Realistic Vision v5.1
Sampler: DPM++ 2M Karras
CFG Scale: 9
Steps: 50
```

**Stable Diffusion-Specific Prompt Adjustments:**
- Add `masterpiece, best quality` at the start
- Use `by [artist name]` for specific styles (e.g., `by Greg Rutkowski` for fantasy, `by Andy Park` for concept art)
- Specify **resolution:** `intricate details, 8k, ultra HD`

**Example (Isabella Portrait):**
```
masterpiece, best quality, photorealistic portrait of Isabella Vargas, a 23-year-old architecture student from Las Flores, sharp features, olive skin, dark straight hair, calm and unreadable expression, black turtleneck, long coat, tailored pants, holding a tablet with a spreadsheet, sleek modern architecture studio background, cool precise lighting, high contrast, hyper-detailed, 8k, ultra HD
Negative prompt: no neon, no androids, no clean backgrounds, no emotional expression, no messy workspace
Steps: 50, CFG Scale: 9, Sampler: DPM++ 2M Karras
```

---

### 🔹 DALL·E 3

**Strengths:** Best for **text accuracy** and **consistency**.

**Tips:**
- **Be specific** with descriptions.
- Use **full sentences** for complex scenes.
- **Describe emotions** and **contrasts** clearly.
- Use **Quality:** HD
- Use **Style:** Photorealistic or Natural

**Example Settings:**
```
Quality: HD
Style: Photorealistic
```

**DALL·E-Specific Prompt Adjustments:**
- Use **natural language** (full sentences, paragraphs)
- Specify **camera angle:** `from a low angle`, `bird's eye view`
- Describe **lighting:** `soft natural light`, `dramatic shadows`

**Example (Luz del Río):**
```
A photorealistic image of the Luz del Río energy plant at dusk, a colossal industrial complex clinging to the side of the Andean foothills. Massive turbines spin slowly, catching the last light of the setting sun, while a network of pipelines crisscrosses the landscape like metallic veins. The plant looms over the surrounding valley, its imposing silhouette a testament to human ingenuity and hubris. In the foreground, a few workers in protective gear move among the machinery, their faces illuminated by cold industrial lights. In the distance, the natural beauty of the mountains contrasts with the man-made monstrosity. The scene conveys both awe and environmental cost. The image is ultra-detailed, 8k, with dramatic lighting and high contrast.
```

---

### 🔹 LEONARDO.AI

**Strengths:** Best for **consistent characters** and **fine details**.

**Tips:**
- Use **Model:** `Leonardo Diffusion XL` or `Leonardo Phoenix`
- Enable **Alchemy** for finer details
- Use **Preset:** Cinematic
- **Upscale:** Use `x2` for maximum detail

**Example Settings:**
```
Model: Leonardo Diffusion XL
Alchemy: On
Preset: Cinematic
Upscale: x2
Contrast: High
```

**Leonardo-Specific Prompt Adjustments:**
- Add `Leonardo Diffusion style` for consistent outputs
- Use `cinematic lighting` for dramatic scenes
- Specify **mood:** `tense, melancholic, hopeful`

**Example (Carlos on Roof):**
```
Leonardo Diffusion style, photorealistic image of Carlos Lacan on a rooftop at night, installing surveillance cameras, 24-year-old electrical engineering student, warm brown skin, dark unruly hair, bright kind eyes, simple t-shirt with rolled sleeves, multimeter in hand, city sprawling beneath him, Andean foothills in the distance, dim lighting with only a headlamp and city lights, tense but determined expression, cinematic lighting, hyper-detailed, 8k
```

---

### 🔹 RUNWAY ML / PIKA LABS / SORA

**Strengths:** Best for **video generation**.

**Tips:**
- **Duration:** 10-30 seconds for scenes
- **FPS:** 24 for cinematic, 60 for action
- **Seed:** Use same seed for **consistent characters**
- **Camera Motion:** `smooth camera movement`, `cinematic camera`, `handheld shot`

**Example Settings:**
```
Duration: 15 seconds
FPS: 24
Resolution: 1080p
Seed: 12345 (use same for consistent characters)
```

**Video-Specific Prompt Adjustments:**
- Add `cinematic camera movement` for smooth motion
- Specify **shots:** `establishing shot`, `close-up`, `wide shot`
- Describe **transitions:** `smooth zoom`, `slow pan`, `quick cut`

**Example (Cableway Journey):**
```
A cinematic video of a cableway car traveling over Las Flores at dawn, smooth camera movement following the car's path. Below, the poor districts wake up with vendors setting up stalls and children playing. In the distance, the wealthy districts and Luz del Río plant loom, their cold industrial lines contrasting with the warm poor areas. The lighting is soft golden hour, with long shadows and atmospheric depth. The mood is reflective and connected, capturing the daily journey between worlds. Cinematic, wide-angle, 8k, 24fps, 15 seconds.
```

---

---

---

## 👤 CHARACTER REFERENCE PROMPTS

*Detailed character references organized by type: face, body, expressions, and unique activity-specific prompts.*

---

### 🔹 FACE REFERENCE PROMPTS

*Close-up headshot portraits for character recognition and consistent facial features.*

#### Miguel Jhonson – Face
```
[CONSUMER: portrait]
Photorealistic close-up portrait of Miguel Jhonson, a 24-year-old logistics worker from Las Flores. His face has a strong, square jaw and broad cheekbones, with warm brown skin that shows the faint tan of outdoor work. His dark, curly hair is cropped short, neat but not styled. His eyes are dark brown, calm and grounding, with a hint of warmth beneath the serious exterior. His brows are slightly furrowed, giving him a naturally concerned look. His nose is straight and prominent. His lips are thin, often set in a neutral line. Clean shaven with no facial hair. Ears are unadorned. The shot is from the shoulders up, centered, with a transparent background. Soft natural lighting from above, highlighting the texture of his skin. Hyper-detailed, 8k, PNG with alpha.
--no facial hair, no piercings, no tattoos, no accessories, no bright lighting, no emotional expression
```

#### Carlos Lacan – Face
```
[CONSUMER: portrait]
Photorealistic close-up portrait of Carlos Lacan, a 24-year-old electrical engineering student from Las Flores. His face is lean with soft edges, warm brown skin that glows with health. His dark hair is slightly unruly, a mop that falls across his forehead in waves. His eyes are his most striking feature—bright, warm brown, always crinkling at the corners as if perpetually about to laugh. He has a straight nose and a warm, slightly crooked smile that seems ready to break out. He has faint freckles across his nose and cheeks. His ears show small fade marks from childhood injuries. Clean shaven. The shot is from the shoulders up, centered, with a transparent background. Warm, soft lighting from a desk lamp nearby, casting a gentle glow on his face. Hyper-detailed, 8k, PNG with alpha.
--no messy hair (intentionally styled messy is ok), no piercings, no sunglasses, no bright overhead lighting, no sad expression
```

#### Ana Kim – Face
```
[CONSUMER: portrait]
Photorealistic close-up portrait of Ana Kim, a 25-year-old social work student and library worker from Las Flores. Her face is slender with defined cheekbones, fair skin with a subtle natural warmth. Her dark hair is straight and long, falling past her shoulders, with a practical center part. Her eyes are dark almond-shaped, sharp and direct, with a keen intelligence in her gaze. Her eyebrows are well-groomed but natural, expressing her honest and straightforward nature. Her nose is small and straight. Her lips are of medium fullness, often set in a neutral or slight frown when thinking. No piercings, no visible makeup (natural look). The shot is from the shoulders up, centered, with a transparent background. Soft natural window lighting, creating gentle shadows. Hyper-detailed, 8k, PNG with alpha.
--no heavy makeup, no colored hair, no piercings, no glasses (unless character-relevant), no overly happy expression, no bright artificial lighting
```

#### Isabella Vargas – Face
```
[CONSUMER: portrait]
Photorealistic close-up portrait of Isabella Vargas, a 23-year-old architecture and urban studies student from Las Flores. Her face is sharp and angular with a precise jawline, olive skin with a subtle natural glow. Her dark straight hair falls just above her shoulders, with a clean, precise part. Her eyes are dark and intense, unreadable but betraying a keen intelligence. Her eyebrows are well-defined and slightly furrowed, giving her a perpetually focused look. Her nose is straight and elegant. Her lips are thin, often pressed into a neutral line. Her expression is calm and controlled, revealing little. No jewelry visible. The shot is from the shoulders up, centered, with a transparent background. Cool, precise lighting from a desk lamp, creating sharp but soft shadows. Hyper-detailed, 8k, PNG with alpha.
--no emotional expression, no warm lighting, no disheveled hair, no accessories, no visible makeup
```

#### Alex Garcia – Face
```
[CONSUMER: portrait]
Photorealistic close-up portrait of Alex Garcia, a 23-year-old architecture student and leader of the Las Estrellas investigation from Las Flores. His face is lean and angular with high cheekbones, warm olive skin that speaks to his mixed heritage. His dark hair is slightly disheveled, as if he's been running his hands through it in frustration, falling across his forehead in a way that's effortlessly magnetic. His eyes are dark and expressive, burning with intensity and a quiet charisma. His eyebrows are strong and expressive, often knit together in determination. His nose is straight and well-defined. His lips are of medium fullness, often curved in a slight knowing smile or set in serious determination. A faint shadow of stubble may be visible at his jawline. The shot is from the shoulders up, centered, with a transparent background. Warm, intimate lighting from nearby sources, casting soft shadows that highlight his determined expression. Hyper-detailed, 8k, PNG with alpha.
--no clean-shaven look (stubbled is his look), no overly neat hair, no bright fluorescent lighting, no boring neutral expression
```

#### Mayor Vega – Face
```
[CONSUMER: portrait]
Photorealistic close-up portrait of Mayor Vega, the corrupt mayor of Las Flores, approximately late 50s. His face is broad and weathered, with fair skin that has seen years of political stress and late nights. His hair is graying at the temples, combed back in a styled but aging manner. His eyes are pale blue, cold and calculating, with deep-set shadows beneath them. His eyebrows are heavy and expressive, conveying authority and suspicion. His nose is large and prominent, a strong feature. His lips are thin, often curled in a subtle smirk of knowing superiority. He has faint age spots and lines around his eyes and mouth. His jaw is set with the rigidity of someone used to being in power. He wears a custom tailored suit jacket visible at the collar. The shot is from the shoulders up, centered, with a transparent background. Professional office lighting, cool and precise, emphasizing his authority. Hyper-detailed, 8k, PNG with alpha.
--no casual clothing, no warm approachable lighting, no genuine smile, no disheveled appearance, no modern casual style
```

---

### 🔹 BODY REFERENCE PROMPTS

*Full-body reference with plan pose and minimal clothing options for sprite sheets and animation.*

#### Miguel Jhonson – Body (Plan Pose)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Miguel Jhonson, a 24-year-old logistics worker from Las Flores, in a standing plan pose. His build is broad-shouldered and sturdy, with a tall frame that commands presence. He's wearing minimal clothing: a plain white fitted tank top that shows his muscular arms and broad chest, and simple dark athletic shorts. His skin is warm brown, showing the health of physical labor. His feet are bare or in simple sandals. His hands are at his sides, relaxed but not limp—ready to act. His posture is grounded and stable, feet shoulder-width apart, weight evenly distributed. His face shows his calm, grounded expression from the face reference. The pose is front-facing, arms slightly away from body for clean sprite outlines. Transparent background, centered, full body visible from head to feet. Soft studio lighting from above, even and shadow-free for clean reference. Hyper-detailed, 8k, PNG with alpha.
--no weapons, no accessories, no footwear (or minimal), no complex poses, no harsh shadows
```

#### Miguel Jhonson – Body (Minimal Clothes)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Miguel Jhonson, a 24-year-old logistics worker from Las Flores, in minimal athletic clothing. His build is muscular and powerful, broad shoulders and a strong chest visible through a tight gray tank top, with athletic shorts in dark gray. His warm brown skin is shown in full, from his forearms and neck. His feet are in simple black athletic shoes. His posture is confident and grounded. This reference shows his physical build for figure studies. Front-facing, clean outline. Transparent background, centered. Even studio lighting. Hyper-detailed, 8k, PNG with alpha.
--no extreme muscular definition, no revealing too much skin (athletic wear is fine), no complex lighting
```

#### Carlos Lacan – Body (Plan Pose)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Carlos Lacan, a 24-year-old electrical engineering student from Las Flores, in a standing plan pose. His build is lean and wiry, not bulky but with visible muscle from working with his hands. He's wearing minimal clothing: a simple fitted black t-shirt with sleeves rolled up to show his forearms, and dark jeans. His skin is warm brown with faint freckles visible on his forearms. His feet are in worn brown leather shoes. His hands are at his sides, one hand slightly curled as if holding an invisible tool. His posture is relaxed but engaged, weight on one foot in a casual technical pose. His face shows his warm, approachable expression. Front-facing, arms slightly away from body. Transparent background, centered. Warm, soft studio lighting. Hyper-detailed, 8k, PNG with alpha.
--no work boots, no tools in hand (unless specified), no heavy clothing, no complex poses
```

#### Carlos Lacan – Body (Minimal Clothes)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Carlos Lacan, a 24-year-old electrical engineering student, in minimal clothing for figure study. His build is lean with visible definition in his arms from tinkering work. He's wearing a plain white undershirt (tank top style) and gray athletic shorts. His warm brown skin with freckles is visible on his arms and neck. His feet are bare. This reference shows his wiry, technical build. Front-facing. Transparent background, centered. Even studio lighting. Hyper-detailed, 8k, PNG with alpha.
--no overly muscular build, no heavy definition, no accessories, no footwear
```

#### Ana Kim – Body (Plan Pose)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Ana Kim, a 25-year-old social work student from Las Flores, in a standing plan pose. Her build is slender and fit, with a natural grace. She's wearing practical minimal clothing: a simple cream-colored blouse with sleeves rolled to the elbow, and dark fitted trousers. Her skin is fair with subtle warmth. Her feet are in practical brown leather flats. Her hands are at her sides, one hand holding an invisible notebook. Her posture is straight and direct, weight evenly distributed, standing with authority. Her face shows her direct, honest expression. Front-facing, arms slightly away from body. Transparent background, centered. Soft natural studio lighting. Hyper-detailed, 8k, PNG with alpha.
--no casual shoes, no dresses, no complex accessories, no overly feminine poses
```

#### Ana Kim – Body (Minimal Clothes)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Ana Kim, a 25-year-old social work student, in minimal athletic clothing. Her build is slender and athletic from walking and active work. She's wearing a simple navy sports bra and black athletic leggings. Her fair skin is visible at her arms and neck. Her feet are in simple black athletic shoes. Her posture is ready and active. This reference shows her practical, no-nonsense build. Front-facing. Transparent background, centered. Even studio lighting. Hyper-detailed, 8k, PNG with alpha.
--no revealing extremes, no overly form-fitting (athletic wear is fine), no accessories, no complex lighting
```

#### Isabella Vargas – Body (Plan Pose)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Isabella Vargas, a 23-year-old architecture student from Las Flores, in a standing plan pose. Her build is medium and lean, with an athlete's grace from walking the city's hills. She's wearing minimal but precise clothing: a black fitted turtleneck sweater and black tailored trousers. Her skin is olive with a natural glow. Her feet are in practical black leather boots. Her hands are at her sides, fingers slightly extended as if holding an invisible tablet. Her posture is perfectly straight and controlled. Her face shows her calm, unreadable expression. Front-facing, arms slightly away from body. Transparent background, centered. Cool, precise studio lighting. Hyper-detailed, 8k, PNG with alpha.
--no casual clothing, no bright colors, no accessories, no complex poses, no warm lighting
```

#### Isabella Vargas – Body (Minimal Clothes)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Isabella Vargas, a 23-year-old architecture student, in minimal clothing. Her build is lean and controlled. She's wearing a simple black sports bra and black high-waisted shorts. Her olive skin is visible. Her feet are bare. This reference shows her controlled, precise build. Front-facing. Transparent background, centered. Even studio lighting. Hyper-detailed, 8k, PNG with alpha.
--no bright colors, no overly revealing, no accessories, no complex lighting
```

#### Alex Garcia – Body (Plan Pose)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Alex Garcia, a 23-year-old architecture student from Las Flores, in a standing plan pose. His build is lean and athletic, with the wiry strength of someone who's always on the move. He's wearing minimal casual clothing: a fitted dark gray t-shirt and well-worn blue jeans. His skin is warm olive. His feet are in brown leather boots, slightly worn. His hands are at his sides, relaxed but ready. His posture is confident and slightly off-center, weight on one foot in a natural leader's pose. His face shows his intense, charismatic expression. Front-facing, arms slightly away from body. Transparent background, centered. Warm studio lighting with subtle shadows. Hyper-detailed, 8k, PNG with alpha.
--no formal clothing, no sneakers, no accessories (unless specified), no stiff poses
```

#### Alex Garcia – Body (Minimal Clothes)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Alex Garcia, a 23-year-old architecture student, in minimal clothing. His build is lean and athletic, showing natural muscle. He's wearing a plain black fitted tank top and dark athletic shorts. His warm olive skin is visible on his arms and neck. His feet are in simple black sneakers. This reference shows his active, leader's build. Front-facing. Transparent background, centered. Even studio lighting. Hyper-detailed, 8k, PNG with alpha.
--no overly muscular, no formal wear, no accessories, no complex lighting
```

#### Mayor Vega – Body (Plan Pose)
```
[CONSUMER: phaser-sprite]
Photorealistic full-body reference of Mayor Vega, corrupt mayor of Las Flores, late 50s, in a standing plan pose. His build is broad and heavy, with the physical presence of someone who's enjoyed political power. He's wearing his official mayoral attire: a perfectly tailored dark navy suit with a white dress shirt and conservative red tie. His skin is fair with the pallor of office work. His feet are in polished black dress shoes. His hands are at his sides, one holding an invisible pen. His posture is commanding and rigid, shoulders back, chin up—used to being in charge. His face shows his cold, calculating expression. Front-facing, arms slightly away from body. Transparent background, centered. Professional, cool office lighting. Hyper-detailed, 8k, PNG with alpha.
--no casual clothing, no casual stance, no warmth in expression, no informal accessories
```

---

### 🔹 EXPRESSION REFERENCE PROMPTS

*Multiple expressions per character for sprite sheets and dialogue systems.*

#### Miguel Jhonson – Expressions
```
[CONSUMER: portrait]
EXPRESSION SHEET: Miguel Jhonson, 24-year-old logistics worker, from Las Flores. Five expressions on a single transparent background, arranged horizontally: 1) NEUTRAL: Calm, grounded expression with lips in a flat line, eyes steady and watchful; 2) DETERMINED: Brow furrowed, jaw set, eyes focused with intensity; 3) CONCERNED: Slight frown, eyes worried, eyebrows raised slightly; 4) SLIGHT SMILE: Corner of mouth turned up, eyes warm, the hint of a joke; 5) ANGRY: Eyes blazing, brows low, jaw clenched, expression fierce. Same face model as face reference. Each expression clearly visible and distinct. Soft consistent lighting across all expressions. Hyper-detailed, 8k, PNG with alpha.
--no extreme expressions, no distorted faces, no harsh shadows
```

#### Carlos Lacan – Expressions
```
[CONSUMER: portrait]
EXPRESSION SHEET: Carlos Lacan, 24-year-old electrical engineering student, from Las Flores. Five expressions on a single transparent background, arranged horizontally: 1) NEUTRAL: Relaxed face, slight half-smile always present, eyes warm and kind; 2) HAPPY: Full smile showing teeth, eyes crinkled at corners, expression genuinely joyful; 3) FOCUSED: Brows slightly furrowed, eyes sharp and intent, mouth in a small line; 4) SURPRISED: Eyes wide, eyebrows raised, mouth slightly open; 5) SAD: Eyes downturned, eyebrows angled up, expression heavy with sorrow. Same face model as face reference. Each expression clearly visible and distinct. Soft consistent lighting across all expressions. Hyper-detailed, 8k, PNG with alpha.
--no extreme emotions, no angry expression (not his character), no distorted faces
```

#### Ana Kim – Expressions
```
[CONSUMER: portrait]
EXPRESSION SHEET: Ana Kim, 25-year-old social work student, from Las Flores. Five expressions on a single transparent background, arranged horizontally: 1) NEUTRAL: Direct gaze, lips in a flat line, expression no-nonsense and practical; 2) FOCUSED: Eyes sharp and intense, eyebrows slightly furrowed, mouth set; 3) CONCERNED: Eyes soft, eyebrows raised, slight frown showing empathy; 4) SLIGHT SMILE: Small, genuine smile, eyes warming—this is her letting guard down; 5) DETERMINED: Jaw set, eyes burning with conviction, expression fierce. Same face model as face reference. Each expression clearly visible and distinct. Soft consistent lighting across all expressions. Hyper-detailed, 8k, PNG with alpha.
--no overly emotional expressions, no fake smiles, no distorted faces
```

#### Isabella Vargas – Expressions
```
[CONSUMER: portrait]
EXPRESSION SHEET: Isabella Vargas, 23-year-old architecture student, from Las Flores. Five expressions on a single transparent background, arranged horizontally: 1) NEUTRAL: Calm, unreadable expression, eyes neutral, lips in a thin line; 2) FOCUSED: Eyes sharp and intense, eyebrows slightly furrowed, expression analytical; 3) CONFUSED: One eyebrow raised, eyes questioning, head slightly tilted; 4) SLIGHTLY CONCERNED: Subtle furrow in brow, eyes showing the first cracks in her calm; 5) DETERMINED: Eyes burning with intensity, jaw set, expression resolved. Same face model as face reference. Each expression clearly visible and distinct. Cool consistent lighting across all expressions. Hyper-detailed, 8k, PNG with alpha.
--no warm expressions, no genuine happiness, no emotional breakdown, no distorted faces
```

#### Alex Garcia – Expressions
```
[CONSUMER: portrait]
EXPRESSION SHEET: Alex Garcia, 23-year-old architecture student, from Las Flores. Five expressions on a single transparent background, arranged horizontally: 1) NEUTRAL: Slight knowing smile, eyes burning with latent intensity, charismatic default; 2) DETERMINED: Brows knit together, eyes fierce, jaw set, expression commanding; 3) CONCERNED: Eyes worried, expression showing the weight he's carrying; 4) CHARMING: Full charismatic smile, eyes warm, the full force of his magnetism; 5) ANGRY: Eyes blazing, expression fierce, the revolutionary fire visible. Same face model as face reference. Each expression clearly visible and distinct. Warm consistent lighting across all expressions. Hyper-detailed, 8k, PNG with alpha.
--no weak expressions, no uncertain look (except concerned), no distorted faces
```

#### Mayor Vega – Expressions
```
[CONSUMER: portrait]
EXPRESSION SHEET: Mayor Vega, late 50s, corrupt mayor of Las Flores. Five expressions on a single transparent background, arranged horizontally: 1) NEUTRAL: Cold, calculating expression, eyes dead, lips in a thin line; 2) SMIRKING: One corner of mouth curled up, eyes knowing, expression of superiority; 3) THREATENING: Eyes cold and piercing, brows lowered, expression dangerous; 4) FAKE CHARM: Slight smile not reaching eyes, the politician's mask; 5) DISGUSTED: Upper lip curled, eyes rolling, expression of contempt. Same face model as face reference. Each expression clearly visible and distinct. Cool professional lighting across all expressions. Hyper-detailed, 8k, PNG with alpha.
--no genuine emotion, no warm expressions, no vulnerability, no distorted faces
```

---

### 🔹 UNIQUE REFERENCE PROMPTS

*Character-specific outfits, uniforms, and activity references.*

#### Miguel Jhonson – Work Uniform
```
[CONSUMER: phaser-sprite]
Photorealistic reference of Miguel Jhonson, 24-year-old logistics worker, in his work outfit. He's wearing a durable navy blue work shirt with the sleeves rolled up to show his forearms, dark cargo pants with multiple pockets, and sturdy brown work boots. He has a tool belt at his waist with basic supplies. His expression is focused and practical. This is his look when organizing safehouses or doing logistics work. Standing pose, front-facing, arms slightly away from body. Transparent background, centered. Warm practical lighting from a warehouse or work environment. Hyper-detailed, 8k, PNG with alpha.
--no formal clothing, no bright colors, no casual shoes, no accessories not in character
```

#### Miguel Jhonson – Safehouse Leader
```
[CONSUMER: portrait]
Photorealistic portrait of Miguel Jhonson in his element, organizing a safehouse in the western district. He's surrounded by maps, supplies, and communication equipment. His expression is focused but calm—the competent leader in his domain. The background shows a dimly lit room with crates of supplies and a city map on the table. Practical warm lighting from a single lamp. Hyper-detailed, 8k.
--no bright clean environments, no modern tech, no military gear, no formal clothing
```

#### Carlos Lacan – Electronics Shop Worker
```
[CONSUMER: phaser-sprite]
Photorealistic reference of Carlos Lacan, 24-year-old electrical engineering student, working at the electronics repair shop. He's wearing his work outfit: a plain gray t-shirt with the sleeves rolled up, jeans, and a faded blue apron over it. He's holding a multimeter in one hand and a small screwdriver in the other. His expression is one of focused concentration—he's in his element. The background shows the cluttered but cozy interior of the repair shop with shelves of tools and half-disassembled gadgets. Warm glow from a desk lamp. Standing pose, front-facing. Transparent background optional. Hyper-detailed, 8k, PNG with alpha.
--no clean environments, no formal clothing, no fancy tools, no bright overhead lighting
```

#### Carlos Lacan – Rooftop Technician
```
[CONSUMER: portrait]
Photorealistic portrait of Carlos Lacan on a rooftop at night, installing surveillance cameras for the Las Estrellas investigation. He's crouched low, wearing a dark hoodie and cargo pants, his hands steady as he works with the equipment. The city sprawls out beneath him, a sea of lights and shadows, with the Andean foothills as a dark silhouette. His expression is a mix of concentration and quiet excitement. Dim lighting from his headlamp and the city lights below. Atmospheric, tense. Hyper-detailed, 8k.
--no modern equipment (use period-appropriate), no bright city, no clean environments
```

#### Ana Kim – Library Worker
```
[CONSUMER: phaser-sprite]
Photorealistic reference of Ana Kim, 25-year-old social work student, working at the university library. She's wearing her work outfit: a cozy brown cardigan over a cream blouse, dark trousers, and comfortable flats. She's holding a stack of books and a notebook. Her expression is focused and efficient. The background shows the quiet, wood-paneled interior of the library with towering bookshelves. Soft natural window lighting. Standing pose, front-facing. Transparent background optional. Hyper-detailed, 8k, PNG with alpha.
--no modern clothing, no casual wear, no bright colors, no sterile environments
```

#### Ana Kim – Social Work Field
```
[CONSUMER: portrait]
Photorealistic portrait of Ana Kim doing field work in the poor districts, visiting a family in need. She's wearing practical casual clothes: a simple gray sweater, dark jeans, and sturdy walking shoes. Her expression is one of genuine concern and empathy—she's in her element helping others. The background shows a modest home in the poor districts, showing the reality of her social work. Natural soft lighting from a window. Hyper-detailed, 8k.
--no formal clothing, no clean environments, no clinical look, no distanced expression
```

#### Isabella Vargas – Architecture Student
```
[CONSUMER: phaser-sprite]
Photorealistic reference of Isabella Vargas, 23-year-old architecture student, in her student outfit. She's wearing her signature look: a black turtleneck sweater, a long gray coat, tailored black trousers, and black leather boots. She's holding a tablet and a rolled blueprint under her arm. Her expression is focused and analytical. The background shows the sleek interior of an architecture studio. Cool precise lighting. Standing pose, front-facing. Transparent background optional. Hyper-detailed, 8k, PNG with alpha.
--no bright colors, no casual clothing, no warm tones, no disheveled look
```

#### Isabella Vargas – Investigator Mode
```
[CONSUMER: portrait]
Photorealistic portrait of Isabella Vargas hunched over her tablet in the university library, uncovering patterns in the Las Estrellas investigation. She's surrounded by papers, printouts, handwritten notes, and a sprawling spreadsheet. Her fingers fly over the keyboard, expression one of intense focus, chasing a pattern only she can see. The background shows towering bookshelves stretching into darkness. Cold glow from her tablet screen. High contrast, moody. Hyper-detailed, 8k.
--no warm lighting, no clean organized desk, no casual relaxed expression
```

#### Alex Garcia – Casual Student
```
[CONSUMER: phaser-sprite]
Photorealistic reference of Alex Garcia, 23-year-old architecture student, in his casual student outfit. He's wearing his signature look: a fitted dark gray t-shirt, a well-worn brown leather jacket, and blue jeans with brown boots. His dark hair is slightly disheveled in that effortlessly magnetic way. His expression is warm but with an underlying intensity. Standing pose, front-facing, arms slightly away from body. Transparent background optional. Warm intimate lighting. Hyper-detailed, 8k, PNG with alpha.
--no formal clothing, no overly neat hair, no clean crisp look, no boring expression
```

#### Alex Garcia – Investigation Leader
```
[CONSUMER: portrait]
Photorealistic portrait of Alex Garcia in the final moments before his broadcast, the one that will expose the truth about Las Flores. He stands in a hidden studio, wearing his leather jacket, his expression a mix of exhaustion and resolve. His hands grip the edges of the desk as if it's the only thing holding him up. Behind him, a monitor displays the feed that will go out to the city. The lighting is dramatic, with the camera light casting sharp shadows on his face. Emotional, high contrast. Hyper-detailed, 8k.
--no clean studio, no bright lighting, no weak expression, no casual relaxed look
```

#### Alex Garcia – Rally Leader
```
[CONSUMER: portrait]
Photorealistic portrait of Alex Garcia leading a protest gathering in Parque de las Montañas against the Luz del Río energy plant. He stands at the front of the crowd, his expression fierce and determined, a revolutionary's fire in his eyes. He holds a banner, his posture commanding. Behind him, people of all ages hold signs and banners. The park's natural beauty contrasts with the industrial glow of the plant visible in the distance. Cinematic, high tension, environmental storytelling. Hyper-detailed, 8k.
--no violence, no police brutality, no clean peaceful scene, no uncertain expression
```

#### Mayor Vega – Mayoral Attire
```
[CONSUMER: phaser-sprite]
Photorealistic reference of Mayor Vega in his official mayoral attire. He's wearing a perfectly tailored dark navy suit, white dress shirt, conservative red tie, and polished black dress shoes. His posture is commanding and rigid, shoulders back, chin up—used to being in power. His expression is the politician's mask: fake charm with underlying cold calculation. Standing pose, front-facing, arms slightly away from body. Transparent background optional. Professional cool office lighting. Hyper-detailed, 8k, PNG with alpha.
--no casual clothing, no casual stance, no warmth, no authentic emotion
```

#### Mayor Vega – Behind Closed Doors
```
[CONSUMER: portrait]
Photorealistic portrait of Mayor Vega in his private office, the mask slipping. He's sitting behind a grand desk, still in his suit, but his expression is cold and dangerous—the true face of the corrupt mayor. On his desk are documents and a glass of whiskey. The office is opulent but oppressive, dark wood and leather. The lighting is dramatic, cold, with sharp shadows. Cinematic, high contrast, threatening. Hyper-detailed, 8k.
--no warmth, no genuine smile, no humble surroundings, no kind expression
```

#### Mayor Vega – Meeting the Senator
```
[CONSUMER: portrait]
Photorealistic portrait of Mayor Vega meeting with Senator Chen in a private backroom. Both men are in tailored suits, their expressions indicating a deal being made. The setting is a dark, opulent room with leather chairs and dark wood. The atmosphere is tense, corrupt, a deal being sealed. The lighting is dim, with only the glow of a desk lamp illuminating their expressions. Cinematic, moody, high tension. Hyper-detailed, 8k.
--no public settings, no honest expressions, no simple surroundings, no bright lighting
```

---

## 📚 RELATED GUIDES

- **[Asset Generation Guide](./asset_generation_guide.md)** – Core principles and lore framework
- **[UI/UX Design System](./ui_ux_design_system.md)** – Visual identity and components
- **[Workflows](./workflows.md)** – Step-by-step processes for common tasks
- **[Templates](./templates.md)** – Copy-paste resources and cheat sheets

---

## 📝 CHANGELOG

- **v1.0** (2026-07-01): Initial release – Comprehensive prompt library for all tools
- **v1.1** (2026-07-02): Added character reference prompts – Face, body, expressions, and unique activity-specific prompts for Miguel, Carlos, Ana, Isabella, Alex, and Mayor Vega
- **v1.2** (Planned): Add more location-specific prompts, video generation examples

---

> **Need help?** Check the other guides in this folder or ask in the project's Discord.
