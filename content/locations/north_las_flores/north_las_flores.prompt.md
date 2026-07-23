---
name: North Las Flores
type: background
size: 1280x768
source: docs/lore/districts/north/landmarks/north_las_flores/north_las_flores.md
target: `scene.background_url` in `content/locations/location_north_las_flores.yaml`
consumer: html-background
---


# Prompt: North Las Flores

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/north_las_flores.md
**Target field:** `scene.background_url` in `content/locations/location_north_las_flores.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
North Las Flores in Las Flores, daytime, luxury rural mansions, modern eco-design, upscale residential architecture, near water, dense forest surroundings. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appea...

## Prompt
North Las Flores in Las Flores, daytime, luxury rural mansions, modern eco-design, upscale residential architecture, near water, dense forest surroundings. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `north_las_flores__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Set the luxury rural mansions against a moonlit forest backdrop with warm estate lights filtering through dense canopy, the wetland areas below catching silver reflections and distant EV charging pylons casting neon glow across the low-lying terrain. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Show a downpour over the forest-adjacent luxury mansions with rain pooling on the flood-prone low ground, wetland marshes swelling with runoff, and misty sheets sweeping between the tree-lined estate driveways. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Pan out to reveal the full district with luxury rural mansions scattered through dense forest and wetland preserves, the Electric Vehicle Zone visible on the low-lying terrain, and curving estate roads winding between the lush canopy and marshland. Keep face identical. Same graphic novel style.

