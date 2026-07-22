---
name: Vista Del Sol
type: background
size: 1280x768
source: docs/lore/districts/northeast/landmarks/vista_del_sol/vista_del_sol.md
target: `scene.background_url` in `content/locations/location_vista_del_sol.yaml`
consumer: html-background
---


# Prompt: Vista Del Sol

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/vista_del_sol.md
**Target field:** `scene.background_url` in `content/locations/location_vista_del_sol.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Vista Del Sol in Las Flores, daytime, urban setting. Bright high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets,...

## Prompt
Vista Del Sol in Las Flores, daytime, urban setting. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Bright high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `vista_del_sol__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Illuminate the tree-lined streets of Vista Del Sol at night with warm porch lights from single-family homes and street lamps casting gentle pools of light, the quiet middle-class neighborhood glowing peacefully while the distant lights of Meadowbrook Estates glimmer on the horizon. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Show rain pattering on the rooftops of single-family homes along the tree-lined streets, water streaming down gutters into the impeccably maintained parks, the neighborhood emptying as residents seek shelter while distant affluent district lights blur through the downpour. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Pull back to show the full Vista Del Sol community with rows of charming single-family homes along tree-lined streets, well-kept parks and community facilities, the service streets where residents commute to nearby wealthy districts, and the contrast between this middle-class haven and affluent neighborhoods beyond. Keep face identical. Same graphic novel style.

