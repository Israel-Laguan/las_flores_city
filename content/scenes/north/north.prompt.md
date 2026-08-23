---
name: Northern District
type: background
size: 1280x768
source: north.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/north/scene_north.yaml
consumer: background
---

# Prompt: Northern District

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide residential street in the Northern District of Las Flores 2077, a mixed-use area of residential blocks and small commercial zones. A wide avenue lined with modest storefronts, small parks, mid-rise housing, even daylight. Ordinary, familiar, comfortable atmosphere. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
A residential avenue in the Northern District of Las Flores 2077: mixed-use blocks of mid-rise housing and small commercial storefronts. A wide street with modest signage, a neighborhood park, and warm detail in the façades. Even daylight, familiar and comfortable. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Warm evening storefronts
- [ ] sunset — Golden hour avenue

## Environment Variants
<!-- Environment variants staged as `assets/north__<tag>.png` and wired into
     `background_urls[]` (scenes) with a `variant` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the avenue as an evening scene: storefront windows glowing warm, neat streetlights, a few neon accents, the residential windows lit, calm night palette. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.
- **`__sunset.png`**: Use the base scene as reference. Re-light the avenue with golden-hour sun: long warm shadows, amber light on the building façades, the street glowing in the last daylight. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.