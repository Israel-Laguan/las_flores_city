---
name: Meadowbrook Estates
type: background
size: 1280x768
source: docs/lore/districts/northeast/landmarks/meadowbrook_estates/meadowbrook_estates.md
target: `scene.background_url` in `content/locations/location_meadowbrook_estates.yaml`
consumer: html-background
---


# Prompt: Meadowbrook Estates

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/meadowbrook_estates.md
**Target field:** `scene.background_url` in `content/locations/location_meadowbrook_estates.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Meadowbrook Estates in Las Flores, daytime, urban Latin American setting. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back po...

## Prompt
Meadowbrook Estates in Las Flores, daytime, urban Latin American setting. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `meadowbrook_estates__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Transform the sprawling estates into a moonlit night scene with warm lantern light glowing from manicured gardens and Chinese-style gated entrances, the solar-paneled mall roof reflecting starlight above the tree-lined streets. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Render the manicured gardens and tree-lined streets of Meadowbrook Estates slick with rain, water beading on the solar-paneled mall roof and reflecting the Colegio Chino signage, mist curling between the sprawling custom estates. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Pull back to show the full expanse of Meadowbrook Estates with sprawling custom-built homes, the solar-paneled community mall, Colegio Chino visible among the manicured gardens, and the gated entrance flanked by tree-lined avenues. Keep face identical. Same graphic novel style.

