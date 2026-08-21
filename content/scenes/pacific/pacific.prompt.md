---
name: Pacific Coast
type: background
size: 1280x768
source: pacific.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/pacific/scene_pacific.yaml
consumer: background
---

# Prompt: Pacific Coast

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide view of the Pacific Coast of Las Flores 2077, where the city meets the ocean. Fishing boats moored in a busy harbour, seafood market stalls along the waterfront, salt-worn docks, the tide coming in under a misty coastal sky. Maritime, salt-worn atmosphere with harbour lights beginning to glow. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
The Pacific edge of Las Flores 2077: fishing boats moored in a working harbour, seafood market stalls along the waterfront, salt-worn docks and coiled ropes. The tide is rising beneath a misty coastal sky as harbour lights begin to glow. Maritime and salt-worn. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Harbour lights on the water
- [ ] sunset — Golden waves and masts

## Expression Variants
<!-- Environment variants staged as `assets/pacific__<tag>.png` and wired into
     `background_urls[]` (scenes) with an `expression` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the coast as a night scene: the harbour lit by mooring lamps and neon from the market stalls, reflections shimmering on the dark water, the fishing fleet at rest. Same layout, same graphic novel style, no people.
- **`__sunset.png`**: Use the base scene as reference. Re-light the coast with a golden-hour sunset: warm amber over the water and boat hulls, long shadows on the docks, the market stalls catching the last light. Same layout, same graphic novel style, no people.
