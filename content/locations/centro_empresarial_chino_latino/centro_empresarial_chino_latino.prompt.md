---
name: Centro Empresarial Chino-Latino
type: background
size: 1280x768
source: docs/lore/districts/port/landmarks/centro_empresarial_chino_latino/centro_empresarial_chino_latino.md
target: `scene.background_url` in `content/locations/location_centro_empresarial_chino_latino.yaml`
consumer: html-background
---


# Prompt: Centro Empresarial Chino-Latino

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/centro_empresarial_chino_latino.md
**Target field:** `scene.background_url` in `content/locations/location_centro_empresarial_chino_latino.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Centro Empresarial Chino-Latino in Las Flores, daytime, modern fusion of chinese and latin american design elements architecture, street vendor stalls, coastal port setting. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial fea...

## Prompt
Centro Empresarial Chino-Latino in Las Flores, daytime, modern fusion of chinese and latin american design elements architecture, street vendor stalls, coastal port setting. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `centro_empresarial_chino_latino__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Place this person in: Night version of the Centro Empresarial Chino-Latino—fusion architecture illuminated with warm lanterns and Latin American string lights, grand gateway glowing with cultural symbols, courtyard gardens softly lit, trade exhibition hall windows casting warm light, Port District shipping cranes visible in the dark background. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Place this person in: Rainy version of the Centro Empresarial Chino-Latino—rain falling on the Chinese garden courtyard and Latin American plaza, fusion architecture facade glistening, cultural artwork displays protected under awnings, trade exhibition hall entrance with umbrellas, Port District cranes fading into misty rain. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Place this person in: Wide shot of the Centro Empresarial Chino-Latino—fusion building blending Chinese motifs with Latin American colonial design, grand gateway with dual cultural symbols, open courtyard with Chinese garden elements, trade exhibition halls, Port District waterfront and shipping containers visible in the background. Keep face identical. Same graphic novel style.

