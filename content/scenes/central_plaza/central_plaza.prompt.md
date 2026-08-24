---
name: Central Plaza
type: background
size: 1280x768
source: central_plaza.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/central_plaza/scene_central_plaza.yaml
consumer: background
---

# Prompt: Central Plaza

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide view of the Central Plaza in Las Flores 2077, the bustling heart of the city. Old colonial architecture meets neon-lit modernity, a fountain at the center, street vendor stalls and holographic billboards sharing the sidewalks. Warm afternoon sun mixed with bright neon, vibrant and energetic. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
The Central Plaza of Las Flores 2077: a broad public square where colonial façades meet neon signage. A central fountain, street vendor stalls along the edges, flickering holographic billboards above the crowd. Warm afternoon sun blending with electric neon, vibrant and energetic. Premium graphic novel realism, crisp rendering, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Plaza bathed in neon
- [ ] sunset — Golden hour plaza

## Environment Variants
<!-- Environment variants staged as `assets/central_plaza__<tag>.png` and wired into
     `background_urls[]` (scenes) with a `variant` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the plaza as a night scene: the fountain glowing, neon signs and holographic billboards blazing brighter, colonial façades in shadow, wet reflective pavement, cooler blue and magenta palette. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.
- **`__sunset.png`**: Use the base scene as reference. Re-light the plaza with golden-hour sun: long warm shadows across the square, amber rays between the buildings, the fountain catching warm light, neon just beginning to glow. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.