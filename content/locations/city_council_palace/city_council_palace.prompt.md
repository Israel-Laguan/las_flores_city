---
name: City Council Palace
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/city_council_palace/city_council_palace.md
target: `scene.background_url` in `content/locations/location_city_council_palace.yaml`
consumer: html-background
---


# Prompt: City Council Palace

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/city_council_palace.md
**Target field:** `scene.background_url` in `content/locations/location_city_council_palace.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
City Council Palace in Las Flores, daytime, modernism mixed with ultramodern, democratic symbolism architecture, urban city center. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. Sun-faded 2010s sedans parked along weathered sidewalks, silent electric motorcycles, boxy automated utility vans wrapped in vibrant colorful advertisements. Newly built modern plain minimalist architecture punctuated by weathered 2020s artifacts—rusted trash bins, outdated semaphores, cracked concrete planters. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic...

## Prompt
City Council Palace in Las Flores, daytime, modernism mixed with ultramodern, democratic symbolism architecture, urban city center. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. Sun-faded 2010s sedans parked along weathered sidewalks, silent electric motorcycles, boxy automated utility vans wrapped in vibrant colorful advertisements. Newly built modern plain minimalist architecture punctuated by weathered 2020s artifacts—rusted trash bins, outdated semaphores, cracked concrete planters. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `city_council_palace__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Place this person in: Night version of the semicircular council chamber under warm artificial lighting, the ceremonial gong glinting in shadow, statues of justice liberty and democracy silhouetted against the moonlit Plaza de la Constitución beyond the windows. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Place this person in: Rainy version with rain streaming across the palace plaza, wet stone reflecting the three statues of justice liberty and democracy, the semicircular council chamber visible through rain-streaked windows. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Place this person in: Wide shot of the entire City Council Palace exterior, the elegant plaza with statues of justice liberty and democracy in the foreground, the semicircular legislative wing visible, connected to the Plaza de la Constitución. Keep face identical. Same graphic novel style.

