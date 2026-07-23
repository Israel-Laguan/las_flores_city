---
name: Van der Meer Group Southern Mine
type: background
size: 1280x768
source: docs/lore/districts/south/landmarks/van_der_meer_southern_mine/van_der_meer_southern_mine.md
target: `scene.background_url` in `content/locations/location_van_der_meer_group_southern_mine.yaml`
consumer: html-background
---


# Prompt: Van der Meer Group Southern Mine

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/van_der_meer_group_southern_mine.md
**Target field:** `scene.background_url` in `content/locations/location_van_der_meer_group_southern_mine.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Van der Meer Group Southern Mine in Las Flores, daytime, mining extraction site, near water, industrial infrastructure. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clo...

## Prompt
Van der Meer Group Southern Mine in Las Flores, daytime, mining extraction site, near water, industrial infrastructure. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `van_der_meer_southern_mine__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Transform this modern mining complex to nighttime, with the sleek extraction facilities lit by industrial lights, the vibrant company town glowing with storefronts and activity, and the aquatic park reflecting in the darkness near the river. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Add heavy rain to this modern mine site, with water cascading off the state-of-the-art extraction facilities, rain-soaked streets of the bustling company town, and the aquatic park's waters merging with the downpour near the river. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Pull back to a wide shot showing the modern Van der Meer Southern Mine complex, the busy company town with stores and vehicles, the aquatic park nearby, and the river visible just a kilometer away with major roads connecting the site. Keep face identical. Same graphic novel style.

