---
name: The Governor Offices
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/the_governor_offices/the_governor_offices.md
target: `scene.background_url` in `content/locations/location_the_governor_offices.yaml`
consumer: html-background
---


# Prompt: The Governor Offices

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/the_governor_offices.md
**Target field:** `scene.background_url` in `content/locations/location_the_governor_offices.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
The civic leader Offices in Las Flores, daytime, contemporary with glass and steel architecture. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetic...

## Prompt
The Governor Offices in Las Flores, daytime, contemporary with glass and steel architecture. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `the_governor_offices__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Place this person in: Night version of the glass and steel Governor Offices, interior lights glowing through the transparent facade, the maintained gardens and entrance plaza lit by soft bollard lights near the Plaza de la Constitución. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Place this person in: Rainy version with rain pouring over the Governor Offices glass facade, water streaming down steel panels, the entrance plaza and maintained gardens glistening under overcast skies. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Place this person in: Wide shot of the entire Governor Offices building, contemporary glass and steel architecture rising above the entrance plaza, flanked by maintained gardens, with the City Council Palace and Plaza de la Constitución visible nearby. Keep face identical. Same graphic novel style.

