---
name: Old Town Café
type: background
size: 1280x768
source: cafe.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/cafe/scene_cafe.yaml
consumer: background
---

# Prompt: Old Town Café

[CONSUMER: background]
**Type:** background
**Source:** cafe.md
**Target field:** `background_urls[].url` / `asset_paths.background` in .../scene_cafe.yaml
**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Interior of a warm, worn coffee shop in the historic district of Las Flores 2077. Exposed brick, a wooden counter, an espresso machine venting steam, soft warm lighting, cozy seating. Smell of roasted beans and damp brick. Intimate, inviting mood. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
A cozy, slightly worn coffee shop interior in the Old Town district of Las Flores 2077. Exposed brick walls, a worn wooden counter, an espresso machine venting steam, warm lamplight over small tables. Slow ambient mood, damp-brick character. Premium graphic novel realism, crisp rendering, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variants (image-to-image)

### `night` — Evening café glow
**Scale:** 5:3
**Edit prompt:**
Re-light the café as an evening scene: dim the room, warm golden overhead lamps, neon streetlight glowing through the front window, deeper shadows on the brick. Same layout, same graphic novel style, no people.

### `sunset` — Golden hour café
**Scale:** 5:3
**Edit prompt:**
Re-light the café with golden-hour sun through the window: warm amber washes over the brick and counter, soft highlights on the espresso machine. Same layout, same graphic novel style, no people.
