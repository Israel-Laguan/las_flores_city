---
name: The Apartment
type: background
size: 1280x768
source: the_apartment.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/the_apartment/the_apartment.yaml
consumer: background
---

# Prompt: The Apartment

[CONSUMER: background]
**Type:** background
**Source:** the_apartment.md
**Target field:** `background_urls[].url` / `asset_paths.background` in .../the_apartment.yaml
**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Interior of a small sterile apartment in a residential block in Las Flores 2077. White walls, minimal furniture, a single window looking out over neon-lit streets, rain streaking the glass casting shifting neon patterns. Tense, cold, watchful mood under cool white light. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
A small, sterile apartment in the N&M LTD residential block of Las Flores 2077. White walls, minimal furniture, one window onto the neon streets below. Rain streaks the glass, casting shifting neon light across the room, cool and tense. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variants (image-to-image)

### `night` — Deep neon night
**Scale:** 16:9
**Edit prompt:**
Re-light the apartment as a deep night scene: the room darker, neon streetlight through the rain-streaked window much brighter and cooler, sharp shadows on the white walls. Same layout, same graphic novel style, no people.

### `sunset` — Golden hour on the white walls
**Scale:** 16:9
**Edit prompt:**
Re-light the apartment with golden-hour light through the window: warm amber washes across the white walls and minimal furniture, the rain catching afternoon light. Same layout, same graphic novel style, no people.

### `day` — Clear dry daylight interior
**Scale:** 16:9
**Edit prompt:**
Re-light the apartment as a clear dry day: bright natural daylight through the window, no rain on the glass, muted white interior with crisp shadows. Same layout, same graphic novel style, no people.
