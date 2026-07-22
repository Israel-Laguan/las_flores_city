---
name: Puerto de Las Flores
type: background
size: 1280x768
source: docs/lore/districts/port/landmarks/puerto_de_las_flores/puerto_de_las_flores.md
target: `scene.background_url` in `content/locations/location_puerto_de_las_flores.yaml`
consumer: html-background
---


# Prompt: Puerto de Las Flores

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/districts/puerto_de_las_flores.md
**Target field:** `scene.background_url` in `content/locations/location_puerto_de_las_flores.yaml`
**Tool:** NIM (draft) → Flux/Seedance (refine)
**Pipeline stage:** draft → refine

## Prompt (Draft)
Puerto de Las Flores in Las Flores, daytime, street vendor stalls, coastal port setting. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.. photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo...

## Prompt
Puerto de Las Flores in Las Flores, daytime, street vendor stalls, coastal port setting. Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k. Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything. No people, no text, no logos.

## Negative Prompt
photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches

## Variants (image-to-image)
> Base image required. Run each with:
> `akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait`
> Output saved as `puerto_de_las_flores__<variant_slug>.png`

### `variant_1` — Night version: same scene at night with different lighting
**Scale:** 16:9
**Edit prompt:**
Light the port at night with massive container ship floodlights illuminating the lithium ore loading piers, Jade Dragon Ports terminal glowing with operational activity, police patrol boat lights sweeping the harbor waters, and Neptunes Haven's dedicated pier visible across the dock. Keep face identical. Same graphic novel style.

### `variant_2` — Rainy version: same scene with rain and mood effects
**Scale:** 16:9
**Edit prompt:**
Show rain hammering the container cranes and loading equipment at Puerto de Las Flores, wet dock surfaces reflecting the industrial lights of Jade Dragon and Neptunes Haven terminals, cargo ships moored in the driving rain, customs inspection areas glistening under covered canopies. Keep face identical. Same graphic novel style.

### `variant_3` — Wide shot: broader view of the location
**Scale:** 16:9
**Edit prompt:**
Pull back to reveal the full port complex of Puerto de Las Flores, massive container ships at multiple piers, the Jade Dragon Ports and Neptunes Haven terminals flanking the harbor, lithium ore stockpiles awaiting export, customs buildings, police patrols along the waterfront, and cruise ship berths stretching toward the Pacific horizon. Keep face identical. Same graphic novel style.

