---
name: Teatro Nacional
type: background
size: 1280x768
source: docs/lore/districts/city/landmarks/teatro_nacional/teatro_nacional.md
target: `scene.background_url` in `content/locations/location_teatro_nacional.yaml`
consumer: html-background
---


# Prompt: Teatro Nacional

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/teatro_nacional.md
**Target field:** `scene.background_url` in `content/locations/location_teatro_nacional.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Teatro Nacional in Las Flores, daytime, grand historical design with high ceilings and ornate details architecture. Bright high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothin...

## Prompt
Teatro Nacional in Las Flores, daytime, grand historical design with high ceilings and ornate details architecture. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `teatro_nacional__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Place this person in: Night version of the grand historical theater, ornate chandeliers casting warm golden light through tall windows, the high vaulted ceiling visible, the Juan Pablo Ramos collection and mining heritage exhibition halls softly illuminated inside. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Place this person in: Rainy version with rain falling on the ornate theater facade, wet stone reflecting the intricate carvings, the adjacent La Casa de la Música visible through the downpour, moody overcast atmosphere. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Place this person in: Wide shot of the entire Teatro Nacional exterior, the grand historical facade with ornate details and high ceilings, standing adjacent to La Casa de la Música, with the History Exhibition Hall entrance visible along the street. Keep face identical. Same graphic novel style.

