---
name: Los Andes Heights
type: background
size: 1280x768
source: los_andes.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/los_andes/scene_los_andes.yaml
consumer: background
---

# Prompt: Los Andes Heights

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide view of the elevated Los Andes Heights in Las Flores 2077, wealthy neighborhoods overlooking the city. Sweeping valley-view terraces, pristine modernist residences, clean architecture, clear bright mountain light, the glittering city spread far below. Exclusive, pristine atmosphere. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
The elevated heights of Los Andes in Las Flores 2077: a sweeping terrace overlooking the city far below. Pristine modernist residences with clean angular architecture, clear mountain air, bright daylight, the glittering valley stretching to the coast. Exclusive and serene. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] los_andes__night.png — City lights below
- [ ] los_andes__sunset.png — Golden valley view

## Environment Variants
<!-- Environment variants staged as `assets/los_andes__<tag>.png` and wired into
     `background_urls[]` (scenes) with a `variant` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the heights as a night scene: the residential terraces softly lit, the entire city below glittering with neon and streetlights, a wide starry mountain sky above. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.
- **`__sunset.png`**: Use the base scene as reference. Re-light the heights with a golden-hour sunset: warm amber washing over the modernist residences and the valley below, long mountain shadows, the city catching the last light. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.