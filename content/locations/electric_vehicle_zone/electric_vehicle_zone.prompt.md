---
name: Electric Vehicle Zone
type: background
size: 1280x768
source: docs/lore/districts/north/landmarks/electric_vehicle_zone/electric_vehicle_zone.md
target: `scene.background_url` in `content/locations/location_electric_vehicle_zone.yaml`
consumer: html-background
---


# Prompt: Electric Vehicle Zone

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/electric_vehicle_zone.md
**Target field:** `scene.background_url` in `content/locations/location_electric_vehicle_zone.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Electric Vehicle Zone in Las Flores, daytime, modern eco-design, sustainable materials, futuristic aesthetic architecture, eco-friendly sustainable design, near water. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features,...

## Prompt
Electric Vehicle Zone in Las Flores, daytime, modern eco-design, sustainable materials, futuristic aesthetic architecture, eco-friendly sustainable design, near water. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `electric_vehicle_zone__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Light the EV Zone at night with solar-powered canopies casting ambient glow over the fast charging stations, the Autopia Motors flagship showroom illuminated with futuristic LED facade, and sleek electric vehicles parked under glowing charging pylons. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Show rain streaming off the solar-powered canopies over the charging stations, reflections of the Autopia Motors flagship showroom shimmering on wet pavement, and EVs sheltering under covered charging areas as mist settles over the eco-friendly landscape. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Reveal the full Electric Vehicle Zone with the Autopia Motors flagship showroom, rows of fast charging stations under solar-powered canopies, the eco-friendly green roof architecture, and the broader North District context with adjacent forest and residential areas. Keep face identical. Same graphic novel style.

