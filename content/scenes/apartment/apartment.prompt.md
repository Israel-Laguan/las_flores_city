---
name: Suburban Apartment
type: background
size: 1280x768
source: apartment.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/apartment/scene_apartment.yaml
consumer: background
---

# Prompt: Suburban Apartment

[CONSUMER: background]
**Type:** background
**Source:** apartment.md
**Target field:** `background_urls[].url` / `asset_paths.background` in .../scene_apartment.yaml
**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Interior of a cramped, low-rent suburban apartment in Las Flores 2077. Minimal sterile furnishings, a charging port and terminal uplink, a single rain-streaked window. Warm lamplight cuts through dim gloom, neon street glow bleeds through the glass. Cozy, intimate mood. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
A small, sterile apartment interior in the Old Town suburbs of Las Flores 2077. Minimal furnishings, a charging port and terminal uplink, a functional bed, and a single window streaked with rain. Warm lamplight against cool neon bleeding through the glass, cozy and intimate. Premium graphic novel realism, crisp rendering, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variants (image-to-image)

### `night` — Deep night interior
**Scale:** 16:9
**Edit prompt:**
Re-light the apartment as a deep night scene: the room darker, neon street glow brighter through the rain-streaked window, cooler blue palette, warm lamp the only interior light. Same layout, same graphic novel style, no people.

### `sunset` — Golden hour through the window
**Scale:** 16:9
**Edit prompt:**
Re-light the apartment with warm golden-hour light through the window: amber tones across the walls and floor, softer interior, the rain on the glass catching golden light. Same layout, same graphic novel style, no people.

### `day` — Clear dry daylight
**Scale:** 16:9
**Edit prompt:**
Re-light the apartment as a clear dry day: bright natural daylight floods through the window, no rain on the glass, muted cool interior, crisp shadows. Same layout, same graphic novel style, no people.
