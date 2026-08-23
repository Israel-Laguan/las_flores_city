---
name: Far South Outskirts
type: background
size: 1280x768
source: far_south.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/far_south/scene_far_south.yaml
consumer: background
---

# Prompt: Far South Outskirts

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide rural landscape on the far southern outskirts of Las Flores 2077, where the city gives way to agricultural land and scattered homesteads. Crop fields, a dusty unpaved road, homesteads with rooftop solar panels, clean open sky. Soft natural afternoon light, serene and isolated mood. No people, no text, no logos. Premium graphic novel realism, rural sci-fi.

## Prompt
The rural edge of Las Flores 2077: open farmland and scattered homesteads where the city yields to agricultural land. An unpaved dusty road winds past crop fields and rooftops fitted with solar panels, a distant haze marking the city. Soft natural afternoon light, serene and isolated. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Isolated night fields
- [ ] sunset — Golden hour crops

## Environment Variants
<!-- Environment variants staged as `assets/far_south__<tag>.png` and wired into
     `background_urls[]` (scenes) with a `variant` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the farmland as a night scene: dark fields under a wide starry sky, the city's glow on the horizon, homestead windows and a single security light dotting the dark. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.
- **`__sunset.png`**: Use the base scene as reference. Re-light the farmland with golden-hour sun: long warm shadows across the crops, amber sky, solar panels catching the last light. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.