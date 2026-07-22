---
name: Financial District
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/financial_district/financial_district.md
target: `scene.background_url` in `content/locations/location_financial_district.yaml`
consumer: html-background
---


# Prompt: Financial District

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/financial_district.md
**Target field:** `scene.background_url` in `content/locations/location_financial_district.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Financial District in Las Flores, daytime, urban Latin American setting. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back poc...

## Prompt
Financial District in Las Flores, daytime, urban Latin American setting. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `financial_district__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Place this person in: Night version of the financial district—Banco Central tower illuminated with golden light, World Trade Center glass facade reflecting neon, Bolsa de Valores trading floor glowing from within, embassy flags lit by spotlights, polished streets mirroring the skyline. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Place this person in: Rainy version of the financial district—rain hammering the glass towers of Banco Central and the stock exchange, embassy row flags drooping in the downpour, wet streets reflecting the glowing bank logos, storm clouds brooding over the financial skyline. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Place this person in: Wide shot of the financial district—cluster of glass and steel towers including Banco Central, World Trade Center, and Bolsa de Valores, embassy buildings with flag-lined entrances at the edges, manicured boulevards between the institutions, city skyline visible beyond. Keep face identical. Same graphic novel style.

