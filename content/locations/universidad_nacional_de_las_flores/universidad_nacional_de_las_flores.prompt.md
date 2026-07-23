---
name: Universidad Nacional de Las Flores
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/universidad_nacional_de_las_flores/universidad_nacional_de_las_flores.md
target: `scene.background_url` in `content/locations/location_universidad_nacional_de_las_flores.yaml`
consumer: html-background
---


# Prompt: Universidad Nacional de Las Flores

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/universidad_nacional_de_las_flores.md
**Target field:** `scene.background_url` in `content/locations/location_universidad_nacional_de_las_flores.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Universidad Nacional de Las Flores in Las Flores, daytime, narrow densely packed streets, urban city center, near water. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing cl...

## Prompt
Universidad Nacional de Las Flores in Las Flores, daytime, narrow densely packed streets, urban city center, near water. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `universidad_nacional_de_las_flores__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Transform to nighttime with the stadium floodlights blazing and warm light from the comprehensive library and student hospital windows. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Add rain falling across the expansive public university campus near the industrial zone, wet pavement reflecting the stadium lights and green spaces glistening. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Expand to a wide panoramic view showing the vast campus with its prominent stadium, library, sports facilities, and green spaces stretching toward the nearby industrial zone. Keep face identical. Same graphic novel style.

