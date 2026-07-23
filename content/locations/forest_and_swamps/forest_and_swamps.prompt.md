---
name: Forest and Swamps
type: background
size: 1280x768
source: docs/lore/districts/forest_and_swamps/forest_and_swamps.md
target: `scene.background_url` in `content/locations/location_forest_and_swamps.yaml`
consumer: html-background
---


# Prompt: Forest and Swamps

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/forest_and_swamps.md
**Target field:** `scene.background_url` in `content/locations/location_forest_and_swamps.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Forest and Swamps in Las Flores, daytime, near water, dense forest surroundings. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, ...

## Prompt
Forest and Swamps in Las Flores, daytime, near water, dense forest surroundings. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `forest_and_swamps__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Dense tropical rainforest canopy at night, bioluminescent fungi glowing on fallen hardwood logs, moonlight filtering through layered canopy onto slow-moving peat swamp waters. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Heavy tropical downpour hammering the mangrove canopy, muddy river tributaries swelling through the floodplain forest, mist rising from limestone cave mouths near Huachipaeri thatched dwellings. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Panoramic aerial view of interconnected waterways winding through multi-layered tropical rainforest, peat swamps stretching toward distant limestone waterfalls, traditional Huachipaeri thatched dwellings along riverbanks. Keep face identical. Same graphic novel style.

