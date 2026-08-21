#!/usr/bin/env node

/**
 * generate-prompt.mjs
 *
 * Reads lore markdown files or registry YAMLs from content/ (and docs/lore/ for world-level
 * research) and generates .prompt.md files. Each .prompt.md contains a copy-pasteable AI
 * prompt for generating an asset (image, audio, video).
 *
 * Usage (lore-based):
 *   node generate-prompt.mjs --type portrait --source content/characters/miguel_jhonson/miguel_jhonson.md
 *   node generate-prompt.mjs --type portrait --batch content/characters/
 *   node generate-prompt.mjs --type portrait --batch content/characters/ --force
 *
 * Usage (registry-based):
 *   node generate-prompt.mjs --type tile --registry scripts/asset-pipeline/registries/tiles.yaml --output-dir content/maps/assets/tiles/
 *   node generate-prompt.mjs --type overlay --registry scripts/asset-pipeline/registries/landmarks.yaml --output-dir content/overlays/assets/overlays/
 *
 * Character / location sheets:
 *   node generate-prompt.mjs --type character-sheet --source content/characters/char_diego_huaman.yaml
 *   node generate-prompt.mjs --type location-map --source content/districts/_draft/locations/location_plaza_de_la_constitucion.yaml
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────────

const UNIVERSAL_NEGATIVES =
  '--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural';

const PROMPT_TYPES = [
  'portrait',
  'background',
  'tile',
  'overlay',
  'thematic',
  'ambient',
  'sfx',
  'music',
  'phone-wallpaper',
  'app-icon',
  'biometric',
  'expression',
  'outfit-pose',
  'character-sheet',
  'location-map',
];

// ── Template Library ────────────────────────────────────────────────────────

const TEMPLATES = {
  portrait({ name, age, role, district, physical, expression, clothing, accessories, setting, lighting, shadows, mood, heritage, negatives, sourcePath }) {
    const physicalDesc = (physical && physical !== 'Distinctive appearance') ? physical : 'distinctive appearance fitting their background';
    const expressionDesc = (expression && expression !== 'undefined') ? expression : 'calm and determined';
    const clothingDesc = (clothing && clothing !== 'undefined') ? clothing : 'practical clothing suited to their environment';
    const accessoriesDesc = (accessories && accessories !== 'undefined') ? accessories : 'personal items reflecting their role';
    const ageLabel = /^\d+$/.test(age) ? age + '-year-old' : age;
    const heritageNote = heritage ? `Multicultural heritage (${heritage}).` : '';
    const draftPrompt = `[CONSUMER: portrait] ${name}, ${ageLabel} ${role}, ${district}. ${physicalDesc}. ${expressionDesc}. ${clothingDesc}, ${accessoriesDesc}. ${setting}. ${lighting}, ${shadows}. ${heritageNote} Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. Transparent background.`;
    const fullPrompt = `[CONSUMER: portrait]
Bust portrait of ${name}, a ${ageLabel} ${role} from Las Flores's ${district}.
${physicalDesc}.
${expressionDesc}.
Dressed in ${clothingDesc}, with ${accessoriesDesc}.
Background: ${setting}.
Lighting: ${lighting}, casting ${shadows}.
${mood}. ${heritageNote}
Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. Transparent background.`;
    const frontmatter = `---
name: ${name}
type: portrait
size: 1024x1024
aspect_ratio: 3:4
source: ${sourcePath}
target: \`portrait_urls[].url\` in \`content/characters/char_${slugify(name)}.yaml\`
consumer: portrait
---
`;
    return `${frontmatter}# Prompt: ${name} (portrait)

## Prompt (Draft)
${draftPrompt}

## Prompt
${fullPrompt}

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches${negatives ? `, ${negatives}` : ''}

${variationsBlock(name, 'character')}`;
  },

  background({ name, timeOfDay, keyElements, lighting, atmosphere, mood, contrast, sourcePath }) {
    const moodWords = mood.split(',').map(w => w.trim()).filter(Boolean);
    const uniqueMoodWords = [...new Set(moodWords)];
    const cleanMood = uniqueMoodWords.join(', ');
    const styleDesc = 'Premium contemporary graphic novel realism, refined editorial line art illustration.';
    const draftPrompt = `[CONSUMER: html-background] Scene of ${name} in Las Flores, ${timeOfDay}, ${keyElements}. ${lighting}. ${cleanMood}${contrast ? `, contrast: ${contrast}` : ''}. ${styleDesc} No people, no text.`;
    const fullPrompt = `Scene of ${name} in Las Flores, ${timeOfDay}, ${keyElements}, ${lighting}, ${cleanMood}${contrast ? `, capturing the contrast between ${contrast}` : ''}. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. No people, no text, no logos.`;
    const frontmatter = `---
name: ${name}
type: background
aspect_ratio: 16:9
source: ${sourcePath}
target: \`scene.background_url\` in \`content/districts/_draft/locations/location_${slugify(name)}.yaml\`
consumer: html-background
---
`;
    return `${frontmatter}# Prompt: ${name}

## Prompt (Draft)
${draftPrompt}

## Prompt
${fullPrompt}

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

${variationsBlock(name, 'scene')}`;
  },

  tile({ name, terrainType, description, colors }) {
    const title = name.toLowerCase().includes(terrainType.toLowerCase()) ? name : `${name} (${terrainType})`;
    const draftPrompt = `[CONSUMER: tile] Seamless top-down tile texture of ${description}, Las Flores 2077. ${colors ? `Color palette: ${colors}.` : ''} No objects, no people, tileable.`;
    const fullPrompt = `Seamless top-down tile texture of ${description}, Las Flores 2077. ${colors ? `Color palette: ${colors}.` : ''} Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. No objects, no people, no external shadows, no horizon, no sky, tileable.`;
    return `---
name: ${title}
type: tile
aspect_ratio: 1:1
source: scripts/asset-pipeline/registries/tiles.yaml
target: \`base_image_url\` in \`content/maps/map_*.yaml\`
consumer: tile
---

# Prompt: ${title}

[CONSUMER: tile]
**Type:** tile
**Source:** scripts/asset-pipeline/registries/tiles.yaml
**Target field:** \`base_image_url\` in \`content/maps/map_*.yaml\`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
${draftPrompt}

## Prompt
${fullPrompt}

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches
`;
  },

  overlay({ name, description, sourcePath }) {
    const draftPrompt = `[CONSUMER: phaser-sprite] Top-down view of ${name}, Las Flores 2077, ${description}. Transparent background, centered.`;
    const fullPrompt = `Top-down view of ${name}, Las Flores 2077, ${description}. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Transparent background, centered composition, no external shadows.`;
    return `---
name: ${name}
type: overlay
aspect_ratio: 1:1
source: ${sourcePath}
target: \`overlay_image_url\` in \`content/maps/map_*.yaml\`
consumer: phaser-sprite
---

# Prompt: ${name} (landmark overlay)

[CONSUMER: phaser-sprite]
**Type:** overlay
**Source:** ${sourcePath}
**Target field:** \`overlay_image_url\` in \`content/maps/map_*.yaml\`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
${draftPrompt}

## Prompt
${fullPrompt}

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches
`;
  },

  thematic({ name, description, contrast, mood }) {
    const draftPrompt = `[CONSUMER: thematic] Conceptual art: ${description}, Las Flores. ${contrast ? `Contrast: ${contrast}.` : ''} ${mood}. High contrast, symbolic.`;
    const fullPrompt = `Conceptual art capturing ${description} in Las Flores. ${contrast ? `The scene captures the contrast between ${contrast}.` : ''} ${mood}. High contrast, symbolic, environmental storytelling, 8K.`;
    return `---
name: ${name}
type: thematic
aspect_ratio: 16:9
source: content/lore/events/${slugify(name)}.md
target: Vault entry or loading screen
consumer: thematic
---

# Prompt: ${name} (thematic art)

**Type:** thematic
**Source:** content/lore/events/${slugify(name)}.md
**Target:** Vault entry or loading screen

## Prompt (Draft)
${draftPrompt}

## Prompt
${fullPrompt}

## Negative Prompt
--no utopia, no dystopia, no clean divide, no androids, no robots, no neon
`;
  },

  ambient({ name, timeOfDay, atmosphere, elements, mood }) {
    return `# Prompt: ${name} (ambient audio)

**Type:** ambient
**Source:** content/districts/_draft/locations/${slugify(name)}/${slugify(name)}.md
**Target field:** \`scene.ambient_sound_url\` in \`content/districts/_draft/locations/location_${slugify(name)}.yaml\`
**Tool:** Suno

## Prompt
Ambient soundscape of ${name} in Las Flores, ${timeOfDay}. ${atmosphere}. ${elements}. ${mood}. Soft cyberpunk atmosphere, loopable, 60 seconds, no melody, no vocals, environmental recording style.

## Tags
ambient, soundscape, las flores, ${timeOfDay}, ${mood.toLowerCase()}, cyberpunk, environmental
`;
  },

  sfx({ name, description, mood }) {
    return `# Prompt: ${name} (sound effect)

**Type:** sfx
**Source:** content/lore/events/${slugify(name)}.md
**Target:** Sound effect reference
**Tool:** ElevenLabs

## Prompt
Sound effect: ${description}. ${mood}. Short, impactful, cinematic quality, 2-5 seconds.

## Tags
sfx, ${mood.toLowerCase()}, cinematic, las flores
`;
  },

  music({ name, role, mood, instruments, tempo }) {
    return `# Prompt: ${name} (musical theme)

**Type:** music
**Source:** content/characters/${slugify(name)}/${slugify(name)}.md
**Target:** Musical theme reference
**Tool:** Suno

## Prompt
Musical theme for ${name}, ${role}. ${mood}. ${instruments ? `Instruments: ${instruments}.` : ''} ${tempo ? `Tempo: ${tempo}.` : ''} Soft cyberpunk aesthetic, cinematic, emotional, loopable, 30-60 seconds.

## Tags
theme, ${mood.toLowerCase()}, cinematic, las flores, cyberpunk
`;
  },

  'phone-wallpaper'({ name, description, timeOfDay, mood, colors }) {
    const draftPrompt = `[CONSUMER: html-background] Phone wallpaper Las Flores 2077: ${description}. ${timeOfDay || 'ambient'}, ${mood}. ${colors ? `Palette: ${colors}.` : ''} Vertical composition, no text.`;
    const fullPrompt = `Phone wallpaper for Las Flores 2077, ${description}. ${timeOfDay || 'ambient time of day'}, ${mood}. ${colors ? `Color palette: ${colors}.` : ''} Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Vertical composition, no text, no logos.`;
    return `---
name: ${name}
type: phone-wallpaper
size: 1080x1920
aspect_ratio: 9:16
target: Phone OS home screen wallpaper
consumer: html-background
---

# Prompt: ${name} (phone wallpaper)

[CONSUMER: html-background]
**Type:** phone-wallpaper
**Target:** Phone OS home screen wallpaper
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
${draftPrompt}

## Prompt
${fullPrompt}

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

${variationsBlock(name, 'generic')}`;
  },

  'app-icon'({ name, description, iconStyle }) {
    const draftPrompt = `[CONSUMER: phaser-sprite] App icon: ${description}, Las Flores 2077, ${iconStyle || 'minimalist geometric icon'}. Transparent background, centered, no text.`;
    const fullPrompt = `Phone app icon design: ${description}, Las Flores 2077 style, ${iconStyle || 'minimalist geometric icon'}. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Transparent background, centered, sharp edges, no text.`;
    return `---
name: ${name}
type: app-icon
size: 128x128
aspect_ratio: 1:1
target: Phone OS app grid icon
consumer: phaser-sprite
---

# Prompt: ${name} (app icon)

[CONSUMER: phaser-sprite]
**Type:** app-icon
**Target:** Phone OS app grid icon
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
${draftPrompt}

## Prompt
${fullPrompt}

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, text, complex details, neon glow, cartoon, anime

${variationsBlock(name, 'generic')}`;
  },

  biometric({ name, age, gender, ethnicity, phenotype, body_shape, skeletal_description, physical_description }) {
    const ageStr = age || 'young adult';
    const genderStr = gender || 'person';
    const ethnicityStr = ethnicity || 'mixed ancestry';
    const phenotypeStr = phenotype || 'distinctive facial features';
    const skeletalStr = skeletal_description || 'average build';
    const physicalStr = physical_description || '';
    const charDesc = `A ${ageStr}-year-old ${genderStr} of ${ethnicityStr} descent.`;
    const neutralFace = 'Completely neutral expression, relaxed facial muscles, bare natural lips, bare skin, zero makeup, zero jewelry. Hair is tightly pulled back, not obstructing the face or neck.';
    const hFaceDraft = `[CONSUMER: biometric] 5-panel horizontal face arc, white bg. Left profile → 3/4 left → front → 3/4 right → right profile. Even studio lighting, no shadows. Photorealistic, hyper-detailed, 8k. ${charDesc} ${phenotypeStr}. ${physicalStr} ${neutralFace}`;
    const vFaceDraft = `[CONSUMER: biometric] 5-panel vertical face arc, white bg. Worm's eye → slight low → front eye level → slight high → bird's eye. Even studio lighting, no shadows. Photorealistic, hyper-detailed, 8k. ${charDesc} ${phenotypeStr}. ${physicalStr} ${neutralFace}`;
    const bodyDraft = `[CONSUMER: biometric] 3-panel orthographic body sheet, white bg. Front, side, rear views. Even studio lighting, no shadows. Photorealistic, hyper-detailed, 8k. ${charDesc} ${skeletalStr}. Neutral A-pose. Minimal form-fitting black gym clothes (compression tank + athletic leggings). Hair pulled back. Zero makeup, zero accessories, zero tech.`;
    const horizontalFace = `[CONSUMER: biometric]\nMulti-panel portrait reference strip, horizontal layout, 5 panels on clean white background. Same character in all panels. Camera arcs horizontally: Panel 1 — far left profile, Panel 2 — 3/4 left, Panel 3 (center) — front-facing eye level, Panel 4 — 3/4 right, Panel 5 — far right profile. Soft flat even studio lighting, no cast shadows. Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. ${charDesc} ${phenotypeStr}. ${physicalStr} ${neutralFace}`;
    const verticalFace = `[CONSUMER: biometric]\nMulti-panel portrait reference strip, vertical layout, 5 panels on clean white background. Same character front-facing in all panels. Camera arcs vertically: Panel 1 — extreme low angle worm's eye view, Panel 2 — slight low angle, Panel 3 (center) — front-facing eye level, Panel 4 — slight high angle, Panel 5 — extreme high angle bird's eye view. Soft flat even studio lighting, no cast shadows. Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. ${charDesc} ${phenotypeStr}. ${physicalStr} ${neutralFace}`;
    const bodySheet = `[CONSUMER: biometric]\nOrthographic character full-body reference sheet, clean white background, 3 panels. Same character in all panels: front view, side profile view, rear view. Soft flat even studio lighting, no cast shadows. Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. ${charDesc} ${skeletalStr}. Neutral standing A-pose. Wears minimal form-fitting black athletic gym clothes consisting of a plain compression tank top and basic athletic leggings to clearly reveal body mass and geometry. Hair is tightly pulled back. Zero makeup, zero accessories, zero tech.`;
    return `# Biometric Reference Sheets: ${name}

[CONSUMER: biometric]
**Type:** biometric
**Source:** content/characters/char_${slugify(name)}.yaml
**Target:** content/characters/${slugify(name)}/assets/
**Pipeline stage:** draft → refine
**Recommended tools:** NIM (draft), Flux/Seedance (refine)

---

## Sheet 1: Horizontal Face Arc

**File:** \`horizontal_face.png\`
**Dimensions:** Multi-panel horizontal strip

### Prompt (Draft)
${hFaceDraft}

### Prompt
${horizontalFace}

### Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, stylized poses, dynamic angles, heavy clothing, jackets, loose fabric, makeup, lipstick, earrings, necklaces, glasses, text, watermarks

---

## Sheet 2: Vertical Face Arc

**File:** \`vertical_face.png\`
**Dimensions:** Multi-panel vertical strip

### Prompt (Draft)
${vFaceDraft}

### Prompt
${verticalFace}

### Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, stylized poses, dynamic angles, heavy clothing, jackets, loose fabric, makeup, lipstick, earrings, necklaces, glasses, text, watermarks

---

## Sheet 3: Body Reference Sheet

**File:** \`body_sheet.png\`
**Dimensions:** 3-panel orthographic (front, side, rear)

### Prompt (Draft)
${bodyDraft}

### Prompt
${bodySheet}

### Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, stylized poses, dynamic angles, heavy clothing, jackets, loose fabric, makeup, lipstick, earrings, necklaces, glasses, text, watermarks
`;
  },

  expression({ name, expressions, face_base_ref }) {
    const expressionList = expressions || ['neutral', 'happy', 'sad', 'surprised', 'angry'];
    const expressionDescriptions = {
      neutral: 'completely neutral expression, relaxed facial muscles, bare natural lips, no emotion',
      happy: 'warm genuine smile, eyes crinkled at corners, happy expression',
      sad: 'sad expression, downturned mouth, eyes half-closed with slight moisture',
      surprised: 'surprised expression, eyes wide open, mouth slightly open in shock',
      angry: 'angry glare, furrowed brows, gritted teeth, intense expression',
      smirk: 'confident smirk, one side of mouth raised, knowing half-lidded eyes',
      thoughtful: 'thoughtful expression, slight frown, eyes narrowed in contemplation',
      stern: 'stern expression, serious eyes, firm set mouth, authoritative',
      blushing: 'shy blushing expression, slight closed-mouth smile, rosy cheeks',
      gentle_smile: 'soft gentle smile, warm eyes, peaceful expression',
      determined: 'determined expression, focused eyes, set jaw, resolute',
      evil_grin: 'menacing grin, narrowed eyes, cruel confident expression',
      flirty: 'playful flirty expression, half-lidded eyes, teasing smirk',
      serious: 'serious expression, neutral eyes, straight mouth, professional',
      pout: 'pouting expression, pushed-out lower lip, slight blush, petulant',
      crying: 'crying expression, eyes squeezed shut, tears streaming, mouth open in distress',
      soft_smile: 'soft subtle smile, warm gentle expression, peaceful',
    };
    const stripPanels = expressionList.map((expr, i) => {
      const desc = expressionDescriptions[expr] || `${expr} expression`;
      return `Panel ${i + 1} — ${expr}: ${desc}`;
    }).join('\n');
    const exprNames = expressionList.join(', ');
    const draftPrompt = `[CONSUMER: biometric] Horizontal expression strip, white bg. Head and shoulders, same character all panels. Expressions: ${exprNames}. Even studio lighting, no shadows. Photorealistic, hyper-detailed, 8k. Hair pulled back, no makeup, bare skin.`;
    const fullPrompt = `Horizontal expression reference strip, clean white background. Same character in all panels, head and shoulders framing.\n${stripPanels}.\nSoft flat even studio lighting, no cast shadows. Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. Hair is pulled back, no makeup, no jewelry, bare skin.`;
    return `# Expression Strip: ${name}

[CONSUMER: biometric]
**Type:** expression
**Source:** content/characters/char_${slugify(name)}.yaml
**Target:** content/characters/${slugify(name)}/assets/expression_strip.png
**Pipeline stage:** draft → refine
**Recommended tools:** NIM (draft), Flux/Seedance (refine)
**Reference:** ${face_base_ref || 'Use face base from biometric sheets for consistency'}

## Prompt (Draft)
${draftPrompt}

## Prompt
${fullPrompt}

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, stylized poses, dynamic angles, heavy clothing, jackets, loose fabric, makeup, lipstick, earrings, necklaces, glasses, text, watermarks
`;
  },

  'outfit-pose'({ name, outfit_label, outfit_description, pose_description, body_ref, character_description }) {
    return `# Outfit Pose: ${name} — ${outfit_label}

[CONSUMER: phaser-sprite]
**Type:** outfit-pose
**Source:** content/characters/char_${slugify(name)}.yaml
**Target:** content/characters/${slugify(name)}/assets/
**Pipeline stage:** draft → refine
**Recommended tools:** NIM (draft), Flux/Seedance (refine)
**Body reference:** ${body_ref || 'Use body sheet from biometric phase'}

## Prompt (Draft)
[CONSUMER: phaser-sprite] ${character_description || name} in ${outfit_description}. ${pose_description}. Photorealistic, hyper-detailed, 8k. White bg, front view, flat studio lighting.

## Prompt
Full-body character portrait, clean white background, front view. ${character_description || name}. Wearing ${outfit_description}. ${pose_description}. Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. Flat studio lighting with subtle volumetric shading, no harsh cast shadows.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, wristwatches
`;
  },

  'character-sheet'({ name, occupation, moveset_label, moveset_description, moveset_poses }) {
    const occStr = occupation || 'resident of Las Flores';
    const labelStr = moveset_label || 'Generic Resident';
    const descStr = moveset_description || 'Everyday movement drawn from neutral and personality poses.';
    const poseLines = (moveset_poses && moveset_poses.length)
      ? moveset_poses.map((p, i) => `### Pose ${i + 1}: \`${p.id}\`\n${p.description}\n\n*Prompt keywords:* ${p.keywords}`).join('\n\n')
      : 'No occupation-specific moveset assigned — use neutral/personality poses.';
    return `# Character Sheet: ${name}

[CONSUMER: biometric]
**Type:** character-sheet
**Source:** content/characters/char_${slugify(name)}.yaml
**Target:** content/characters/${slugify(name)}/assets/
**Pipeline stage:** reference
**Recommended tools:** Use biometric sheets (face + body) + moveset poses below

---

## 1. Face Reference
Use the horizontal and vertical face arcs from the biometric phase
(\`content/characters/${slugify(name)}/${slugify(name)}.biometric.prompt.md\`).
Ethnicity/face base and expressions are defined there.

## 2. Body Reference (minimal / plain clothes)
Use the 3-panel orthographic body sheet from the biometric phase
(front / side / rear, minimal black gym clothes, A-pose).
Body shape is defined in \`scripts/asset-pipeline/registries/body_shapes.yaml\`.

## 3. Moveset — ${labelStr}
**Occupation:** ${occStr}

${descStr}

This character's unique movement vocabulary, distinct from generic NPCs.
Resolved from \`scripts/asset-pipeline/registries/movesets.yaml\` by occupation.

${poseLines}

---

## Assembly notes
- Face + body come from the biometric sheets (isolation rule: neutral expression,
  hair pulled back, no makeup, minimal gym clothes).
- The moveset poses above are layered on the body sheet for action/animation frames.
- Keep the same face base and body geometry across all sheets for consistency.
`;
  },

  'location-map'({ name, importantPlaces, map }) {
    const gridStr = map && map.grid ? `${map.grid.cols} × ${map.grid.rows}` : 'not defined';
    const baseTile = map && map.baseTile ? map.baseTile : 'not defined';
    const maskStr = map && map.walkableMask ? map.walkableMask : 'not defined';
    const spawnStr = map && map.spawn ? `(${map.spawn.x}, ${map.spawn.y})` : 'not defined';
    const waypointRows = (map && map.waypoints && map.waypoints.length)
      ? map.waypoints.map(w => `| ${w.name} | (${w.x}, ${w.y}) |`).join('\n')
      : '| — | — |';
    const poiList = (importantPlaces && importantPlaces.length)
      ? importantPlaces.map(p => `- ${p}`).join('\n')
      : '- (none defined)';
    return `# Location Map: ${name}

**Type:** location-map
**Source:** content/districts/_draft/locations/location_${slugify(name)}.yaml
**Target:** content/districts/_draft/locations/${slugify(name)}.map.md
**Consumer:** phaser-navmesh (data doc, not an image prompt)

---

## General layout
A general idea of the location's walkable space and points of interest.

- **Grid:** ${gridStr}
- **Base tile:** \`${baseTile}\`
- **Spawn:** ${spawnStr}

## Walkable mask
Legend: \`#\` = blocked (building / landmark footprint / edge), \`.\` = walkable.

\`\`\`
${maskStr}
\`\`\`

## Waypoints (linked to important_places)
| Waypoint | Coordinates (x, y) |
|---|---|
${waypointRows}

## Points of interest (important_places)
${poiList}

---

## Usage
- The walkable mask is the navmesh source for the Phaser \`LocationScene\`.
- Waypoints mark interactable landmarks; ensure each sits on a \`.\` cell.
- Extend the mask for larger locations; keep it readable (≤ 20×20).
`;
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Canonical variation block (per docs/PROMPT_AUTHORING_SPEC.md and
 * docs/ASSET_EXPRESSION_VOCABULARY.md). Replaces the retired two-stage
 * i2i variant format ("Variants (image-to-image)" + "**Edit prompt:**").
 *
 * Emits a `## Variations` checklist plus a `## Expression Variants` section of
 * usable prompts staged as `assets/<slug>__<tag>.png` and wired into the
 * entity asset arrays with an `expression` tag.
 *
 * @param {string} name - Entity display name (used to derive the asset slug).
 * @param {'character'|'scene'|'generic'} mode - Determines the staged array.
 */
function variationsBlock(name, mode) {
  const slug = slugify(name);
  if (mode === 'character') {
    return `## Variations
- [ ] Casual street scene with neighborhood backdrop
- [ ] Formal civic event under hall lighting
- [ ] Intimate interior with warm lamp light

## Expression Variants
<!-- Variants are staged as \`assets/${slug}__<tag>.png\` and wired into
     \`portrait_urls[]\` (characters) / \`background_urls[]\` (scenes) with an
     \`expression\` tag — see docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **\`__default.png\`**: Use the base portrait as reference. Neutral resting expression, looking at the camera, 3/4 take. Keep the same art style as reference, same clothing and backdrop.
- **\`__<expr>.png\`**: Use the base portrait as reference. <expression-specific description>. Keep the same art style as reference, same clothing and backdrop.
`;
  }
  if (mode === 'scene') {
    return `## Variations
- [ ] Night — re-light under streetlights and neon
- [ ] Sunset — golden-hour raking light
- [ ] Rain — wet surfaces, diffused light

## Expression Variants
<!-- Environment variants staged as \`assets/${slug}__<tag>.png\` and wired into
     \`background_urls[]\` (scenes) with an \`expression\` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **\`__default.png\`**: Use the base scene as reference. Day / neutral shot, same layout, same graphic novel style, no people.
- **\`__night.png\`**: Use the base scene as reference. Re-light as a night scene: warm streetlights and neon accents, cooler palette, deeper shadows. Same layout, same graphic novel style, no people.
- **\`__sunset.png\`**: Use the base scene as reference. Re-light with golden-hour sun: amber light raking across the scene, long shadows. Same layout, same graphic novel style, no people.
`;
  }
  return `## Variations
- [ ] Alternate color palette variant
- [ ] Alternate lighting variant
- [ ] Seasonal variant

## Expression Variants
<!-- Variants are staged as \`assets/${slug}__<tag>.png\` and wired into the
     entity asset arrays with an \`expression\` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **\`__default.png\`**: Use the base asset as reference. Keep the same art style and layout.
- **\`__<variant>.png\`**: Use the base asset as reference. <variant-specific description>. Keep the same art style and layout.
`;
}

// ── Simple YAML Parsers (no deps) ────────────────────────────────────────

function parseSimpleYaml(text) {
  const lines = text.split('\n');
  const result = {};
  let currentKey = null;
  let currentObj = null;
  let inArray = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    const topLevel = line.match(/^(\w[\w_]*):\s*$/);
    if (topLevel) {
      currentKey = topLevel[1];
      result[currentKey] = [];
      inArray = true;
      continue;
    }
    const arrayItem = line.match(/^\s+- (\w+):\s*(.*)$/);
    if (arrayItem && inArray) {
      currentObj = {};
      currentObj[arrayItem[1]] = parseYamlValue(arrayItem[2]);
      result[currentKey].push(currentObj);
      continue;
    }
    const prop = line.match(/^\s{4,}(\w[\w_]*):\s*(.*)$/);
    if (prop && currentObj) {
      currentObj[prop[1]] = parseYamlValue(prop[2]);
      continue;
    }
  }
  return result;
}

// Parse a YAML file that uses map-style entries (like poses.yaml) instead of
// array-style (like tiles.yaml). Returns { section_name: [{ id: '...', ... }] }.
function parseMapYaml(text) {
  const lines = text.split('\n');
  const result = {};
  let currentSection = null;
  let currentEntry = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    const section = line.match(/^(\w[\w_]*):\s*$/);
    if (section) {
      currentSection = section[1];
      result[currentSection] = [];
      currentEntry = null;
      continue;
    }
    if (currentSection) {
      const entry = line.match(/^\s{2}(\w[\w_]*):\s*$/);
      if (entry) {
        currentEntry = { id: entry[1] };
        result[currentSection].push(currentEntry);
        continue;
      }
    }
    if (currentEntry) {
      const prop = line.match(/^\s{4,}(\w[\w_]*):\s*(.*)$/);
      if (prop) {
        currentEntry[prop[1]] = parseYamlValue(prop[2]);
        continue;
      }
    }
  }
  return result;
}

function parseYamlValue(val) {
  if (!val || val.trim() === '') return '';
  val = val.trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val;
}

function parseInlineArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val !== 'string') return [];
  const t = val.trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    return t.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return [t].filter(Boolean);
}

function matchSection(content, sectionName) {
  const m = content.match(new RegExp(`^${sectionName}:\\s*$\\n([\\s\\S]*?)(?=^\\w|^---|$)`, 'm'));
  return m ? m[1] : null;
}

function extractCharacterMeta(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const get = (key) => {
    const m = content.match(new RegExp(`^\\s*${key}:\\s*"?([^\\n]*?)"?\\s*$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  return { name: get('name'), occupation: get('occupation') };
}

function resolveMoveset(occupation) {
  const occ = (occupation || '').toLowerCase();
  const regDir = path.resolve('scripts/asset-pipeline/registries');
  const movesetsPath = path.join(regDir, 'movesets.yaml');
  const posesPath = path.join(regDir, 'poses.yaml');
  if (!fs.existsSync(movesetsPath) || !fs.existsSync(posesPath)) {
    return { label: null, description: null, poses: [] };
  }
  const movesets = parseSimpleYaml(fs.readFileSync(movesetsPath, 'utf-8')).movesets || [];
  const posesYaml = parseMapYaml(fs.readFileSync(posesPath, 'utf-8'));
  const poseMap = {};
  for (const p of (posesYaml.poses || [])) {
    if (p.id) poseMap[p.id] = p;
  }
  const match = movesets.find(ms =>
    parseInlineArray(ms.occupation_tags).some(tag => occ.includes(tag.toLowerCase()))
  ) || movesets.find(ms => (ms.id || '').toLowerCase() === 'generic') || null;
  if (!match) return { label: null, description: null, poses: [] };
  const poses = parseInlineArray(match.signature_poses)
    .map(id => poseMap[id])
    .filter(Boolean)
    .map(p => ({ id: p.id, description: p.description || '', keywords: p.prompt_keywords || '' }));
  return { label: match.label, description: match.description, poses };
}

function extractLocationMeta(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const get = (key) => {
    const m = content.match(new RegExp(`^\\s*${key}:\\s*"?([^\\n]*?)"?\\s*$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const name = get('name');
  const importantPlaces = [];
  const ipSection = matchSection(content, 'important_places');
  if (ipSection) {
    for (const l of ipSection.split('\n')) {
      const m = l.match(/^\s*-\s*name:\s*"?([^"\n]+?)"?/);
      if (m) importantPlaces.push(m[1].trim());
    }
  }
  let map = null;
  const mapSection = matchSection(content, 'map');
  if (mapSection) {
    const grid = mapSection.match(/grid:\s*\{\s*cols:\s*(\d+),\s*rows:\s*(\d+)\s*\}/);
    const baseTile = (mapSection.match(/base_tile:\s*"?([^"\n]+?)"?/) || [])[1] || '';
    const maskMatch = mapSection.match(/walkable_mask:\s*\|?\s*\n((?:[#.\s]+\n)+)/);
    const walkableMask = maskMatch ? maskMatch[1].replace(/\n+$/, '') : '';
    const spawn = (mapSection.match(/spawn:\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)\s*\}/) || []);
    const waypoints = [];
    const wpSection = mapSection.match(/waypoints:\s*\n([\s\S]*?)(?=\n\w|\n\s*\w|$)/);
    if (wpSection) {
      for (const l of wpSection[1].split('\n')) {
        const m = l.match(/name:\s*"?([^"\n]+?)"?.*?x:\s*(\d+).*?y:\s*(\d+)/)
          || l.match(/x:\s*(\d+).*?y:\s*(\d+).*?name:\s*"?([^"\n]+?)"?/);
        if (m) waypoints.push({ name: (m[1] || m[3] || '').trim(), x: +(m[2] || m[1]), y: +(m[3] || m[2]) });
      }
    }
    map = {
      grid: grid ? { cols: +grid[1], rows: +grid[2] } : null,
      baseTile: baseTile.trim(),
      walkableMask: walkableMask.trim(),
      spawn: spawn[1] ? { x: +spawn[1], y: +spawn[2] } : null,
      waypoints,
    };
  }
  return { name, importantPlaces, map };
}

function readRegistryEntries(registryPath, type) {
  if (!fs.existsSync(registryPath)) {
    console.error(`Error: Registry not found: ${registryPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(registryPath, 'utf-8');
  const yaml = parseSimpleYaml(content);
  const entries = yaml.tiles || yaml.landmarks || yaml.backgrounds
    || yaml.app_icons || yaml.phone_wallpapers
    || yaml[Object.keys(yaml)[0]] || [];
  if (entries.length === 0) {
    console.error(`Error: No entries found in ${registryPath}`);
    process.exit(1);
  }
  return entries.map(entry => {
    switch (type) {
      case 'tile':
        return { name: entry.name || entry.id, terrainType: entry.id?.replace(/^tile_/, '').replace(/_/g, ' ') || 'terrain', description: entry.description || '', colors: entry.colors || '' };
      case 'overlay':
        return { name: entry.name || entry.id, description: entry.description || '' };
      case 'background':
        return { name: entry.name || entry.id, timeOfDay: entry.time_of_day || 'daytime', keyElements: entry.description || '', lighting: 'atmospheric', atmosphere: entry.mood || 'atmospheric', mood: entry.mood || 'atmospheric', contrast: '' };
      case 'phone-wallpaper':
        return { name: entry.name || entry.id, description: entry.description || '', timeOfDay: entry.time_of_day || 'night', mood: entry.mood || 'peaceful', colors: entry.colors || '' };
      case 'app-icon':
        return { name: entry.name || entry.id, description: entry.description || '', iconStyle: entry.icon_style || 'minimalist geometric icon' };
      default:
        return { name: entry.name || entry.id, ...entry };
    }
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type': opts.type = args[++i]; break;
      case '--source': opts.source = args[++i]; break;
      case '--batch': opts.batch = args[++i]; break;
      case '--registry': opts.registry = args[++i]; break;
      case '--output-dir': opts.outputDir = args[++i]; break;
      case '--force': opts.force = true; break;
      case '--help': case '-h': printHelp(); process.exit(0);
    }
  }
  if (!opts.type) { console.error('Error: --type is required'); console.error('Valid types: ' + PROMPT_TYPES.join(', ')); process.exit(1); }
  if (!PROMPT_TYPES.includes(opts.type)) { console.error(`Error: Invalid type "${opts.type}". Valid types: ${PROMPT_TYPES.join(', ')}`); process.exit(1); }
  if (!opts.source && !opts.batch && !opts.registry) { console.error('Error: One of --source, --batch, or --registry is required'); process.exit(1); }
  if (opts.registry && !opts.outputDir) { console.error('Error: --output-dir is required when using --registry'); process.exit(1); }
  return opts;
}

function printHelp() {
  console.log(`
generate-prompt.mjs — Generate AI asset prompts from lore files or registries

Usage (lore-based):
  node generate-prompt.mjs --type <type> --source content/<type>/<slug>/<slug>.md
  node generate-prompt.mjs --type <type> --batch content/<type>/
  node generate-prompt.mjs --type <type> --batch content/<type>/ --force

Usage (registry-based):
  node generate-prompt.mjs --type tile --registry scripts/asset-pipeline/registries/tiles.yaml --output-dir tiles/
  node generate-prompt.mjs --type overlay --registry scripts/asset-pipeline/registries/landmarks.yaml --output-dir overlays/

Types:
  ${PROMPT_TYPES.join(', ')}

Options:
  --type         Prompt type (required)
  --source       Single lore file to process
  --batch        Directory of lore files to process
  --registry     Registry YAML file to read asset entries from
  --output-dir   Output directory for registry-based generation
  --force        Overwrite existing .prompt.md files
  --help, -h     Show this help
`);
}

function readLoreFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const meta = {};
  const nameMatch = content.match(/^# (.+)$/m);
  meta.name = nameMatch ? nameMatch[1].trim() : path.basename(filePath, '.md');
  const tagsMatch = content.match(/> Tags: (.+)$/m);
  if (tagsMatch) meta.tags = tagsMatch[1].split('`').map(t => t.trim()).filter(Boolean);
  const ageMatch = content.match(/\*\*Age \(2077\):\*\* ~?(\d+)/);
  meta.age = ageMatch ? ageMatch[1] : 'young adult';
  const roleMatch = content.match(/\*\*Role:\*\* (.+)/);
  meta.role = roleMatch ? roleMatch[1].trim().split(',')[0] : 'resident';
  const districtMatch = content.match(/\*\*District:\*\* (.+)/);
  meta.district = districtMatch ? districtMatch[1].trim() : 'Las Flores';
  const heritageMatch = content.match(/\*\*Descendancy:\*\* (.+)/);
  meta.heritage = heritageMatch ? heritageMatch[1].trim() : '';
  const physicalSection = extractSection(content, 'Physical Description', 'Personality');
  if (physicalSection) {
    const bullets = physicalSection.split('\n').filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*\*{0,2}/, '').replace(/\*{0,2}:\s*/, ': ').replace(/\*{2}/g, '').trim()).filter(Boolean);
    meta.physical = bullets.join('. ') || 'Distinctive appearance';
  } else { meta.physical = 'Distinctive appearance'; }
  const colorMatch = content.match(/\*\*Color Palette:\*\* (.+)/);
  meta.colors = colorMatch ? colorMatch[1].trim() : '';
  const moodKeywords = ['tense', 'hopeful', 'melancholic', 'gritty', 'serene', 'peaceful', 'foreboding', 'oppressive', 'calm', 'mysterious', 'vibrant', 'dramatic'];
  meta.mood = moodKeywords.find(k => content.toLowerCase().includes(k)) || 'atmospheric';
  const districtLine = content.match(/\*\*District:\*\* (.+)/);
  meta.setting = districtLine ? districtLine[1].trim().substring(0, 100) : 'Las Flores cityscape';
  const lightingMap = { tense: 'dramatic, high contrast', hopeful: 'warm golden hour', melancholic: 'soft dim, cool tones', serene: 'soft natural light', foreboding: 'dim, shadowy', gritty: 'harsh practical light', vibrant: 'bright warm sunlight', dramatic: 'cinematic, high contrast' };
  meta.lighting = lightingMap[meta.mood] || 'atmospheric';
  meta.shadows = meta.lighting.includes('soft') ? 'soft shadows' : 'sharp shadows';
  meta.accessories = '';
  return meta;
}

function extractSection(content, sectionName, nextSection) {
  const startMatch = content.match(new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?:\\n## |$)`));
  if (!startMatch) return null;
  let section = startMatch[1].trim();
  if (nextSection) {
    const endIdx = section.indexOf(`\n## ${nextSection}`);
    if (endIdx !== -1) section = section.substring(0, endIdx).trim();
  }
  return section;
}

function extractBackgroundMeta(content) {
  const meta = {};
  meta.name = content.match(/^# (.+)$/m)?.[1]?.trim() || 'Unknown Location';
  const timeKeywords = ['dawn', 'dusk', 'night', 'midday', 'morning', 'afternoon', 'evening', 'sunset', 'sunrise'];
  meta.timeOfDay = timeKeywords.find(k => content.toLowerCase().includes(k)) || 'daytime';
  const moodKeywords = ['tense', 'hopeful', 'melancholic', 'gritty', 'serene', 'peaceful', 'foreboding', 'oppressive', 'calm', 'mysterious', 'vibrant'];
  meta.mood = moodKeywords.find(k => content.toLowerCase().includes(k)) || 'atmospheric';
  const descSection = extractSection(content, 'Overview', '') || content;
  const bulletPoints = descSection.split('\n').filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
  meta.keyElements = bulletPoints.slice(0, 3).join(', ') || 'Las Flores cityscape';
  const lightingKeywords = ['golden hour', 'warm', 'cold', 'dim', 'bright', 'moody', 'soft', 'harsh', 'natural', 'industrial'];
  meta.lighting = lightingKeywords.find(k => content.toLowerCase().includes(k)) || 'atmospheric';
  meta.atmosphere = meta.mood;
  return meta;
}

function extractEventMeta(content) {
  const meta = {};
  meta.name = content.match(/^# (.+)$/m)?.[1]?.trim() || 'Unknown Event';
  const moodKeywords = ['tense', 'hopeful', 'melancholic', 'gritty', 'serene', 'urgent', 'dramatic', 'peaceful', 'foreboding'];
  meta.mood = moodKeywords.find(k => content.toLowerCase().includes(k)) || 'dramatic';
  const firstPara = content.split('\n\n').find(p => p.length > 50 && !p.startsWith('#') && !p.startsWith('>'));
  meta.description = firstPara ? firstPara.replace(/\n/g, ' ').trim() : '';
  return meta;
}

function extractDistrictMeta(content) {
  const meta = {};
  meta.name = content.match(/^# (.+)$/m)?.[1]?.trim() || 'Unknown District';
  const moodKeywords = ['tense', 'hopeful', 'melancholic', 'gritty', 'serene', 'vibrant', 'oppressive', 'calm'];
  meta.mood = moodKeywords.find(k => content.toLowerCase().includes(k)) || 'atmospheric';
  const terrainKeywords = ['street', 'sidewalk', 'sand', 'water', 'grass', 'cobblestone', 'concrete', 'desert', 'asphalt', 'building'];
  meta.terrainType = terrainKeywords.find(k => content.toLowerCase().includes(k)) || 'urban';
  const firstPara = content.split('\n\n').find(p => p.length > 50 && !p.startsWith('#') && !p.startsWith('>'));
  meta.description = firstPara ? firstPara.replace(/\n/g, ' ').trim() : '';
  return meta;
}

function getOutputPath(sourcePath) {
  const dir = path.dirname(sourcePath);
  const basename = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(dir, `${basename}.prompt.md`);
}

function generatePrompt(type, meta) {
  const template = TEMPLATES[type];
  if (!template) { console.error(`Error: No template for type "${type}"`); return null; }
  try { return template(meta); }
  catch (err) { console.error(`Error generating ${type} prompt:`, err.message); return null; }
}

function processFile(filePath, type, force) {
  if (!fs.existsSync(filePath)) { console.error(`  ❌ File not found: ${filePath}`); return false; }
  const ext = path.extname(filePath);
  if (ext !== '.md' && ext !== '.yaml' && ext !== '.yml') { console.error(`  ⚠️  Skipping non-markdown/YAML file: ${filePath}`); return false; }

  // Special output routing for character- and location-derived sheets.
  let outputPath;
  if (type === 'biometric' || type === 'character-sheet') {
    const slug = path.basename(filePath, '.yaml').replace(/^char_/, '');
    const suffix = type === 'biometric' ? '.biometric' : '.character-sheet';
    const dir = path.resolve('content/characters', slug);
    outputPath = path.join(dir, `${slug}${suffix}.prompt.md`);
  } else if (type === 'location-map') {
    const slug = path.basename(filePath, '.yaml').replace(/^location_/, '');
    const dir = path.dirname(filePath);
    outputPath = path.join(dir, `${slug}.map.md`);
  } else {
    outputPath = getOutputPath(filePath);
  }

  if (fs.existsSync(outputPath) && !force) {
    console.log("  ⏭️  Skipping (exists, use --force to overwrite): " + path.basename(outputPath));
    return 'skipped';
  }

  let meta;
  const content = fs.readFileSync(filePath, 'utf-8');

  if (type === 'character-sheet') {
    meta = extractCharacterMeta(filePath);
    const ms = resolveMoveset(meta.occupation);
    meta.moveset_label = ms.label;
    meta.moveset_description = ms.description;
    meta.moveset_poses = ms.poses;
  } else if (type === 'location-map') {
    meta = extractLocationMeta(filePath);
  } else {
    switch (type) {
      case 'portrait': case 'music': meta = readLoreFile(filePath); break;
      case 'background': case 'ambient': meta = extractBackgroundMeta(content); break;
      case 'thematic': case 'sfx': meta = extractEventMeta(content); break;
      case 'tile': case 'overlay': case 'phone-wallpaper': case 'app-icon': meta = extractDistrictMeta(content); break;
      default: meta = { name: path.basename(filePath, ext) };
    }
  }

  meta.negatives = meta.negatives || '';
  meta.sourcePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

  const prompt = generatePrompt(type, meta);
  if (!prompt) return false;

  const finalContent = ensureFrontmatter(prompt, meta, type);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, finalContent, 'utf-8');
  console.log(`  ✅ Created: ${path.basename(outputPath)}`);
  return true;
}

/**
 * Ensure a generated .prompt.md carries YAML frontmatter (name/type/size/
 * consumer) as the single source of truth for metadata.
 *
 * Some templates already emit a frontmatter block; the rest emit body-only
 * metadata. This prepends frontmatter (backfilled from body `**Type:**` /
 * `**Dimensions:**` where needed) only when the content does not already
 * begin with a `---` block, so it never double-wraps an existing block.
 */
function ensureFrontmatter(prompt, meta, type) {
  if (/^---\n/.test(prompt)) return prompt;

  const name = meta.name || 'Untitled';
  const bodyTypeMatch = prompt.match(/\*\*Type:\*\*\s*(\S+)/);
  const assetType = (meta.typeOverride || bodyTypeMatch?.[1] || type || 'portrait').trim();
  const bodyDimMatch = prompt.match(/\*\*Dimensions:\*\*\s*(\d+)\s*[x×]\s*(\d+)/i);
  const sizeValue = meta.sizeValue || (bodyDimMatch ? `${bodyDimMatch[1]}x${bodyDimMatch[2]}` : '1024x1024');
  const consumer = meta.consumer || mapConsumer(assetType);

  const fm = `---\nname: ${name}\ntype: ${assetType}\nsize: ${sizeValue}\nconsumer: ${consumer}\n---\n`;
  return `${fm}${prompt}`;
}

function mapConsumer(type) {
  const map = {
    portrait: 'portrait',
    biometric: 'biometric',
    background: 'html-background',
    tile: 'tile',
    overlay: 'phaser-sprite',
    'app-icon': 'phaser-sprite',
    'phone-wallpaper': 'html-background',
    thematic: 'thematic',
    'outfit-pose': 'phaser-sprite',
    'character-sheet': 'biometric',
    expression: 'biometric',
    location: 'phaser-sprite',
  };
  return map[type] || type;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();
  console.log(`\n📝 Generating ${opts.type} prompts...\n`);

  if (opts.registry) {
    const entries = readRegistryEntries(opts.registry, opts.type);
    const outDir = path.resolve(opts.outputDir);
    fs.mkdirSync(outDir, { recursive: true });
    let success = 0, skipped = 0, failed = 0;
    for (const entry of entries) {
      const slug = slugify(entry.name);
      const outputPath = path.join(outDir, `${slug}.prompt.md`);
      if (fs.existsSync(outputPath) && !opts.force) { console.log(`  ⏭️  Skipping (exists): ${path.basename(outputPath)}`); skipped++; continue; }
      entry.negatives = '';
      const prompt = generatePrompt(opts.type, entry);
      if (!prompt) { failed++; continue; }
      const finalContent = ensureFrontmatter(prompt, entry, opts.type);
      fs.writeFileSync(outputPath, finalContent, 'utf-8');
      console.log(`  ✅ Created: ${path.basename(outputPath)}`);
      success++;
    }
    console.log(`\n📊 Results: ${success} created, ${skipped} skipped, ${failed} failed\n`);
    return;
  }

  if (opts.source) { processFile(opts.source, opts.type, opts.force); return; }

  if (opts.batch) {
    const dir = path.resolve(opts.batch);
    if (!fs.existsSync(dir)) { console.error(`Error: Directory not found: ${dir}`); process.exit(1); }
    const files = [];
    function walk(d) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.endsWith('.prompt.md')) files.push(full);
      }
    }
    walk(dir);
    files.sort();
    if (files.length === 0) { console.log(`  No markdown files found in ${dir}`); process.exit(0); }
    let success = 0, skipped = 0, failed = 0;
    for (const file of files) {
      const filePath = path.join(dir, file);
      const result = processFile(filePath, opts.type, opts.force);
      if (result === true) success++;
      else if (result === 'skipped') skipped++;
      else failed++;
    }
    console.log("\n📊 Results: " + success + " created, " + skipped + " skipped, " + failed + " failed\n");
  }
}

// Run main only when executed directly (not when imported)
const isMainModule = process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
   import.meta.url.endsWith(path.basename(process.argv[1])));
if (isMainModule) {
  main();
}

export { slugify };