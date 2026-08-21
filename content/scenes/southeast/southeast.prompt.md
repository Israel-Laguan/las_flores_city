---
name: Southeast Barrio
type: background
size: 1280x768
source: southeast.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/southeast/scene_southeast.yaml
consumer: background
---

# Prompt: Southeast Barrio

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide residential street in the Southeast Barrio of Las Flores 2077, a vibrant working-class neighborhood. Vivid murals cover every wall telling stories of resistance and hope, laundry lines overhead, community park, colorful painted façades under warm afternoon sun. Resilient, expressive atmosphere. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
A vibrant residential street in the Southeast Barrio of Las Flores 2077. Murals cover every wall, stories of resistance and hope in vivid paint, laundry lines stretch overhead, a small community park opens between the colorful façades. Warm afternoon sun, resilient and expressive. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Murals under streetlights
- [ ] sunset — Golden hour on the murals

## Expression Variants
<!-- Environment variants staged as `assets/southeast__<tag>.png` and wired into
     `background_urls[]` (scenes) with an `expression` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the barrio as a night scene: warm streetlights and a few neon accents lighting the murals, the painted walls glowing in the dark, cool shadows on the street. Same layout, same graphic novel style, no people.
- **`__sunset.png`**: Use the base scene as reference. Re-light the barrio with a golden sunset: warm amber light raking across the murals, long shadows, the painted colors deepened and glowing. Same layout, same graphic novel style, no people.
