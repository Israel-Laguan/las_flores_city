---
name: Colegio Chino-Latino
type: background
size: 1280x768
source: docs/lore/districts/northeast/landmarks/colegio_chino_latino/colegio_chino_latino.md
target: `scene.background_url` in `content/locations/location_colegio_chino_latino.yaml`
consumer: html-background
---


# Prompt: Colegio Chino-Latino

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/colegio_chino_latino.md
**Target field:** `scene.background_url` in `content/locations/location_colegio_chino_latino.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Colegio Chino-Latino in Las Flores, daytime, near water. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks,...

## Prompt
Colegio Chino-Latino in Las Flores, daytime, near water. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `colegio_chino_latino__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Transform to nighttime with the Cultural Pavilion softly illuminated, house banners for Confucius, Sor Juana, Bolívar, and Zheng He visible under warm lantern light. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Add rain falling across the Meadowbrook Estates campus, water streaming off the STEM lab rooftops and pooling near the Cultural Pavilion walkways. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Expand to a wide panoramic view showing the full 5-hectare bilingual campus with its science wing, arts center, sports complex, and the Cultural Pavilion set in the Meadowbrook Estates neighborhood. Keep face identical. Same graphic novel style.

