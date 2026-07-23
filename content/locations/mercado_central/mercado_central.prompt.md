---
name: Mercado Central
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/mercado_central/mercado_central.md
target: `scene.background_url` in `content/locations/location_mercado_central.yaml`
consumer: html-background
---


# Prompt: Mercado Central

**Type:** background
**Source:** docs/lore/districts/mercado_central.md
**Target field:** `scene.background_url` in `content/locations/location_mercado_central.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Morning market in shared street vendor district, dawn, modern commercial with eco-friendly materials, functional logistics design architecture, street vendor stalls, urban city center, working-class neighborhood. Soft golden dawn light filtering through morning mist, long gentle shadows stretching eastward, pale pink and amber sky. Sun-faded 2010s sedans parked along weathered sidewalks, silent electric motorcycles, boxy automated utility vans wrapped in vibrant colorful advertisements. Newly built modern plain minimalist architecture punctuated by weathered 2020s artifacts—rusted trash bins, outdated semaphores, cracked concrete. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality,...

## Prompt
Morning market in shared street vendor district, dawn, modern commercial with eco-friendly materials, functional logistics design architecture, street vendor stalls, urban city center, working-class neighborhood. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Soft golden dawn light filtering through morning mist, long gentle shadows stretching eastward, pale pink and amber sky. Sun-faded 2010s sedans parked along weathered sidewalks, silent electric motorcycles, boxy automated utility vans wrapped in vibrant colorful advertisements. Newly built modern plain minimalist architecture punctuated by weathered 2020s artifacts—rusted trash bins, outdated semaphores, cracked concrete planters. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `mercado_central__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Place this person in: Night version of the dual-sided marketplace—glass and steel facade glowing with warm market lights, colorful vendor stalls illuminated under hanging bulbs, back logistics lanes with parked delivery trucks and loading docks under harsh industrial fluorescents, metro entrance sign casting blue light. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Place this person in: Rainy version of the dual-sided marketplace—rain streaking down the modern glass facade, colorful vendor stalls glistening with wet reflections, back lanes slick with rain and puddles reflecting truck headlights, pedestrians huddling under awnings. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Place this person in: Wide shot of the dual-sided marketplace—front view showing the modern glass and steel facade with colorful stalls visible through open-air sections, back lanes stretching behind with trucks and loading docks, metro entrance at street level, wide pedestrian paths filled with stalls. Keep face identical. Same graphic novel style.

