---
name: World Trade Center Las Flores
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/world_trade_center/world_trade_center.md
target: `scene.background_url` in `content/locations/location_world_trade_center_las_flores.yaml`
consumer: html-background
---


# Prompt: World Trade Center Las Flores

**Type:** background
**Source:** docs/lore/districts/world_trade_center_las_flores.md
**Target field:** `scene.background_url` in `content/locations/location_world_trade_center_las_flores.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Eco-friendly urban development district at midday, ultra-modern, futuristic architecture, urban city center. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowi...

## Prompt
Eco-friendly urban development district at midday, ultra-modern, futuristic architecture, urban city center. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `world_trade_center__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Place this person in: Night version of the ultra-modern World Trade Center—expansive glass facades reflecting the city skyline, eco-friendly green walls softly lit, automated lighting systems casting precise illumination, luxury residences nearby glowing with warm interiors, diplomatic compound security lights visible. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Place this person in: Rainy version of the ultra-modern World Trade Center—rain streaming down sleek glass facades in rivulets, eco-friendly green walls glistening, automated climate control vents visible through the downpour, wet plaza reflecting the tower's futuristic silhouette, luxury residences in the misty background. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Place this person in: Wide shot of the ultra-modern World Trade Center—futuristic glass tower with sleek geometric lines and eco-friendly green walls, luxury residences flanking the base, diplomatic embassy buildings with security checkpoints nearby, manicured plaza with smart lighting, tropical vegetation contrasting the modern architecture. Keep face identical. Same graphic novel style.

