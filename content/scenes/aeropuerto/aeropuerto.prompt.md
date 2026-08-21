---
name: Aeropuerto Internacional — Public Terminal
type: background
size: 1280x768
source: aeropuerto.md
target: `background_urls[]` / `asset_paths.background` in content/scenes/aeropuerto/scene_aeropuerto.yaml
consumer: background
---

# Prompt: Aeropuerto Internacional — Public Terminal

**Tool:** NIM (draft) → Flux/Seedance (refine)

## Prompt (Draft)
Wide concourse of a futuristic international airport terminal in Las Flores 2077. Biometric gate arrays and automated kiosks line a vast hall, a large holographic departures board cycles above, cool bright terminal lighting, glass walls showing distant runways. Transient, restless atmosphere. No people, no text, no logos. Cyberpunk, neon-lit urban environment.

## Prompt
The public arrivals and departures concourse of a Las Flores 2077 airport terminal. Vast, cool, bright hall with biometric gate arrays, automated ticketing kiosks, and a large holographic departures board cycling routes overhead. Glass walls look out over distant runways and morning light. Transient, restless mood, premium graphic novel realism, crisp rendering, no people, no text, no logos.

## Negative Prompt
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural

## Variations
- [ ] night — Terminal at night
- [ ] sunset — Golden hour departures

## Expression Variants
<!-- Environment variants staged as `assets/aeropuerto__<tag>.png` and wired into
     `background_urls[]` (scenes) with an `expression` tag — see
     docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__night.png`**: Use the base scene as reference. Re-light the terminal as a night scene: darken the concourse, brighten the holographic departures board and neon accents, glass walls glow with runway lights and distant city lights, cooler blue palette. Same layout, same graphic novel style, no people.
- **`__sunset.png`**: Use the base scene as reference. Re-light the terminal with warm golden-hour sun pouring through the glass walls: amber highlights on the floor and kiosks, softer cool ceiling light, long sunbeams across the concourse. Same layout, same graphic novel style, no people.
