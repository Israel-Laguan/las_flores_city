---
name: Río de las Flores
type: background
size: 1280x768
source: docs/lore/districts/rio_de_las_flores/rio_de_las_flores.md
target: `scene.background_url` in `content/locations/location_r_o_de_las_flores.yaml`
consumer: html-background
---


# Prompt: Río de las Flores

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/r_o_de_las_flores.md
**Target field:** `scene.background_url` in `content/locations/location_r_o_de_las_flores.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Río de las Flores in Las Flores, daytime, narrow densely packed streets, mountainous terrain, near water. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, c...

## Prompt
Río de las Flores in Las Flores, daytime, narrow densely packed streets, mountainous terrain, near water. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `rio_de_las_flores__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Mountain headwaters of Río de las Flores under a moonlit sky, crystalline streams cascading over granite boulders, reflections of stars in the widening river as it descends toward the agricultural valley. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Rain-swollen Río de las Flores surging through the agricultural valley, irrigation channels overflowing alongside fertile farmlands, mist rising from the river's surface near trade-route docks. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Panoramic view of Río de las Flores from Andean headwaters through the fertile agricultural valley to the distant Pacific delta, irrigation channels branching across farmland, fishing boats clustered at the river mouth. Keep face identical. Same graphic novel style.

