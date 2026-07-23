---
name: Far South
type: background
size: 1280x768
source: docs/lore/districts/far_south/landmarks/far_south/far_south.md
target: `scene.background_url` in `content/locations/location_far_south.yaml`
consumer: html-background
---


# Prompt: Far South

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/far_south.md
**Target field:** `scene.background_url` in `content/locations/location_far_south.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Far South in Las Flores, daytime, near water. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky lugg...

## Prompt
Far South in Las Flores, daytime, near water. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `far_south__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Illuminate the arid desert plateau under a moonlit sky, the Río de las Flores glinting silver through the canyon, unique rock formations casting long shadows, and distant police helicopter airport floodlights sweeping the border terrain. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Show heavy rain falling on the sparse desert vegetation and unique rock formations of the Far South, the Río de las Flores swelling and muddy, water streaming down into the arid canyon from the fishing village of San Pedro de los Pescadores, police patrol boats cutting through rain-slicked river waters. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Pull back to reveal the vast expanse of the Far South desert plateau, the Río de las Flores carving a ribbon of life through the arid landscape, San Pedro de los Pescadores fishing village clustered on the riverbank, unique rock formations stretching toward the international border, sparse desert vegetation and police outposts dotting the terrain. Keep face identical. Same graphic novel style.

