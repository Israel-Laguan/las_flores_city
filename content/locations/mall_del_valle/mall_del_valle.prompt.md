---
name: Mall del Valle
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/mall_del_valle/mall_del_valle.md
target: `scene.background_url` in `content/locations/location_mall_del_valle.yaml`
consumer: html-background
---


# Prompt: Mall del Valle

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/mall_del_valle.md
**Target field:** `scene.background_url` in `content/locations/location_mall_del_valle.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Mall del Valle in Las Flores, daytime, modern commercial, luxury retail design architecture, urban city center, near water. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing...

## Prompt
Mall del Valle in Las Flores, daytime, modern commercial, luxury retail design architecture, urban city center, near water. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `mall_del_valle__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Place this person in: Night version of the premium shopping center—luxury facade glowing against the dark sky, amusement park rides lit with colorful neon in the distance, sea views shimmering with reflected city lights, panoramic lookout points silhouetted against moonlit water. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Place this person in: Rainy version of the premium shopping center—rain pelting the luxury retail glass, sea views obscured by misty curtain of rain, lookout points wet and deserted, amusement park rides dimmed and glistening, puddles reflecting the mall's glowing storefronts. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Place this person in: Wide shot of the premium shopping center on the western edge—luxury retail complex with high-end storefronts, sea panorama stretching behind the building, small zoo enclosure visible to one side, amusement park rides rising above the roofline, panoramic lookout points along the waterfront. Keep face identical. Same graphic novel style.

