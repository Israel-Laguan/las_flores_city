---
name: Parque de Atracciones — Midway
type: background
size: 1280x768
source: parque_atracciones.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/parque_atracciones/scene_parque_atracciones.yaml
consumer: background
---

# Prompt: Parque de Atracciones — Midway

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide midway of an amusement park in Las Flores 2077. Holographic ride-overlay projectors transform aging mechanical ride frames into immersive spectacle, bright carnival lights and fairground stalls line both sides, a central walkway crowded with attractions. Stimulating, saturated atmosphere. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
The central midway of the Parque de Atracciones in Las Flores 2077. Holographic overlays transform aged mechanical ride frames into vivid spectacle, bright carnival lights and sponsor kiosks line both sides of the walkway. Stimulating and saturated. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Carnival blazing at night
- [ ] sunset — Golden fairground dusk

## Expression Variants
<!-- Environment variants staged as `assets/parque_atracciones__<tag>.png` and wired into
     `background_urls[]` (scenes) with an `expression` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the midway as a night scene: carnival lights and holographic projections blazing bright against a dark sky, saturated neon, the ride frames glowing, deep shadows between stalls. Same layout, same graphic novel style, no people.
- **`__sunset.png`**: Use the base scene as reference. Re-light the midway with a warm dusk sky: golden light mixing with the first neon, soft amber over the stalls and projections, long evening shadows. Same layout, same graphic novel style, no people.
