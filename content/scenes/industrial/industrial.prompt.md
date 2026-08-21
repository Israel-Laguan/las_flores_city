---
name: Industrial District
type: background
size: 1280x768
source: industrial.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/industrial/scene_industrial.yaml
consumer: background
---

# Prompt: Industrial District

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide industrial district in Las Flores 2077, factories and warehouses lining the streets. Smokestacks against a hazy humid sky, steam venting over rain-slicked pavement, warehouse loading bays, humming machine halls. Gritty, hard-edged atmosphere under industrial lighting. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
The industrial backbone of Las Flores 2077: factories and warehouses line the streets, smokestacks mixing with humid air. Steam vents over rain-slicked asphalt, loading bays gape open, filtration systems hum in the haze. Gritty and hard-edged beneath industrial light. Premium graphic novel realism, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Factories lit in the dark
- [ ] sunset — Orange haze over the stacks

## Expression Variants
<!-- Environment variants staged as `assets/industrial__<tag>.png` and wired into
     `background_urls[]` (scenes) with an `expression` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the district as a night scene: dark sky, smokestacks silhouetted, warm industrial lamps and neon yard lights glowing, steam lit from below, cooler blue-black palette. Same layout, same graphic novel style, no people.
- **`__sunset.png`**: Use the base scene as reference. Re-light the district with a golden-orange sunset: the haze glowing amber around the smokestacks, long shadows across the loading bays, warm light on the wet pavement. Same layout, same graphic novel style, no people.
