---
name: Universidad del Valle
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/universidad_del_valle/universidad_del_valle.md
target: `scene.background_url` in `content/locations/location_universidad_del_valle.yaml`
consumer: html-background
---


# Prompt: Universidad del Valle

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/universidad_del_valle.md
**Target field:** `scene.background_url` in `content/locations/location_universidad_del_valle.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Universidad del Valle in Las Flores, daytime, urban Latin American setting. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back ...

## Prompt
Universidad del Valle in Las Flores, daytime, urban Latin American setting. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `universidad_del_valle__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Transform to nighttime with soft moonlight illuminating the lush green campus grounds and the modern library facade glowing warmly from within. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Add steady rain falling across the tranquil Northeast campus, droplets pooling on the green walkways near the modern library. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Expand to a wide panoramic view showing the full lush green campus of the humanities university set against the forested Northeast District backdrop with its modern library and dormitories. Keep face identical. Same graphic novel style.

