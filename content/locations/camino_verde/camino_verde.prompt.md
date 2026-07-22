---
name: Camino Verde Neighborhood
type: background
size: 1280x768
source: docs/lore/districts/southeast/landmarks/camino_verde/camino_verde.md
target: `scene.background_url` in `content/locations/location_camino_verde_neighborhood.yaml`
consumer: html-background
---


# Prompt: Camino Verde Neighborhood

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/camino_verde_neighborhood.md
**Target field:** `scene.background_url` in `content/locations/location_camino_verde_neighborhood.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Camino Verde Neighborhood in Las Flores, daytime, winding mountain trail. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back po...

## Prompt
Camino Verde Neighborhood in Las Flores, daytime, winding mountain trail. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `camino_verde__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Transform the tree-lined streets and winding mountain trail of Camino Verde into a moonlit night scene, warm porch lights from airport worker homes casting amber pools on the sidewalks, the distant glow of Aeropuerto Internacional runway lights on the horizon. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Show rain falling on the winding mountain trail and tree-lined residential streets of Camino Verde, water streaming down sidewalks where airport and hospitality workers commute, puddles reflecting the warm glow of small cafés and bakeries along the pedestrian-friendly paths. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Pull back to reveal the full Camino Verde neighborhood spread across the hillside, a mix of single-family homes and small apartment buildings clustered near the Aeropuerto Internacional, tree-lined streets connecting to local markets and the Centro Cultural Las Flores, mountain trails winding through the residential zones. Keep face identical. Same graphic novel style.

