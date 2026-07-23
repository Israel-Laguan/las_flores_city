---
name: Agricultural Valley
type: background
size: 1280x768
source: docs/lore/districts/south/landmarks/agricultural_valley/agricultural_valley.md
target: `scene.background_url` in `content/locations/location_agricultural_valley.yaml`
consumer: html-background
---


# Prompt: Agricultural Valley

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/agricultural_valley.md
**Target field:** `scene.background_url` in `content/locations/location_agricultural_valley.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Agricultural Valley in Las Flores, daytime, narrow densely packed streets, near water. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo p...

## Prompt
Agricultural Valley in Las Flores, daytime, narrow densely packed streets, near water. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `agricultural_valley__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Rolling farmland hills under a starlit sky, irrigation channels from Río de las Flores reflecting moonlight, distant lights of mining towns on the horizon, traditional adobe farmhouses dotting the valley. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Heavy rain falling on fertile crop rows and vegetable patches, Río de las Flores irrigation channels overflowing through the agricultural valley, farmers' shelters dotting the misty rolling hills. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Sweeping panoramic view of the Agricultural Valley, patchwork of fertile farmland and rolling hills bisected by Río de las Flores, traditional farming villages and mining towns scattered across the landscape toward distant mountains. Keep face identical. Same graphic novel style.

