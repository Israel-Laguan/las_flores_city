---
name: Northeast Quarter
type: background
size: 1280x768
source: northeast.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/northeast/scene_northeast.yaml
consumer: background
---

# Prompt: Northeast Quarter

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide street in the rapidly developing Northeast Quarter of Las Flores 2077. New construction towers rise beside aging buildings, scaffolding and cranes line the skyline, raw concrete and glass clash with old façades. Transitional, uneven atmosphere under bright daylight. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
A street in the rapidly developing Northeast Quarter of Las Flores 2077. New towers rise beside aging buildings, scaffolding and construction cranes dominate the skyline, raw concrete and fresh glass clash with weathered façades. Bright, transitional, uneven. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Construction site lights
- [ ] sunset — Golden rise of glass

## Expression Variants
<!-- Environment variants staged as `assets/northeast__<tag>.png` and wired into
     `background_urls[]` (scenes) with an `expression` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the quarter as a night scene: cranes silhouetted against a dark sky, work-site floodlights and glowing new façades, the older buildings in shadow, cooler blue palette. Same layout, same graphic novel style, no people.
- **`__sunset.png`**: Use the base scene as reference. Re-light the quarter with a golden sunset: amber light reflecting off the new glass towers, long shadows from the scaffolding, warm glow on the raw concrete. Same layout, same graphic novel style, no people.
