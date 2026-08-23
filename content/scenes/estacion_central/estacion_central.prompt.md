---
name: Estación Central — Metro Platform
type: background
size: 1280x768
source: estacion_central.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/estacion_central/scene_estacion_central.yaml
consumer: background
---

# Prompt: Estación Central — Metro Platform

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide interchange platform of a metro station in Las Flores 2077 where three lines converge beneath the commercial district. Surveillance arrays line the ceiling, automated turnstiles and ticket kiosks along the edge, a holographic route map above. Cool harsh platform lighting, train arriving, platform wind. Tense, transient mood. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
The main interchange platform of Estación Central in Las Flores 2077, where multiple metro lines converge below the commercial district. Surveillance arrays crowd the ceiling, automated turnstiles and kiosks line the platform, a holographic route map glows overhead. Cool, harsh lighting with a train arriving and air stirring the platform. Tense and transient. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Late-night platform
- [ ] sunset — Golden hour above the tracks

## Environment Variants
<!-- Environment variants staged as `assets/estacion_central__<tag>.png` and wired into
     `background_urls[]` (scenes) with a `variant` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the platform as a late-night scene: the station dimmer, tunnel mouths glowing, neon signage brighter, track lights streaking in the dark, cooler blue palette. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.
- **`__sunset.png`**: Use the base scene as reference. Re-light the platform with warm golden-hour light slanting in from the street entrances: amber shafts across the platform, softer ceiling light, warm reflections on the rails. Same layout, same graphic novel style, no people. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette.