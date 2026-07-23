---
name: Aeropuerto Internacional de Las Flores
type: background
size: 1280x768
source: docs/lore/districts/southeast/landmarks/aeropuerto_internacional_de_las_flores/aeropuerto_internacional_de_las_flores.md
target: `scene.background_url` in `content/locations/location_aeropuerto_internacional_de_las_flores.yaml`
consumer: html-background
---


# Prompt: Aeropuerto Internacional de Las Flores

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/aeropuerto_internacional_de_las_flores.md
**Target field:** `scene.background_url` in `content/locations/location_aeropuerto_internacional_de_las_flores.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Aeropuerto Internacional de Las Flores in Las Flores, daytime, near water. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back p...

## Prompt
Aeropuerto Internacional de Las Flores in Las Flores, daytime, near water. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `aeropuerto_internacional_de_las_flores__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Light the airport terminal under a night sky with runway guidance lights cutting across the tarmac, the LW Logistics cargo terminal illuminated with operational floodlights, and Plaza de la Libertad glowing with vendor lights and streetlamps below. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Render rain streaking across the airport terminal windows and pooling on the single runway tarmac, cargo trucks from the LW Logistics terminal moving through the downpour, and the train line tracks glistening wet toward central station. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Reveal the full airport layout with the single runway stretching into the distance, the passenger terminal and LW Logistics cargo facilities side by side, the train line running toward central station, and Plaza de la Libertad serving as the bustling transportation hub. Keep face identical. Same graphic novel style.

