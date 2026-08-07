---
name: Diego
type: portrait
size: 1024x1024
source: content/characters/diego/diego.md
target: `asset_paths.portrait` in `content/characters/diego/char_diego.yaml`
consumer: portrait
---

# Prompt: Diego

[CONSUMER: portrait]
**Type:** portrait
**Source:** content/characters/diego/diego.md
**Target field:** `asset_paths.portrait` in `content/characters/diego/char_diego.yaml`
**Tool:** MidJourney --v 6 --ar 3:4 --style raw

## Prompt (Draft)

Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a young-20s Latino male. Dark brown short tousled dusty hair, warm brown alert resourceful eyes, medium height lean agile build, sun-browned weathered skin, thin scar across left eyebrow from cave-in, calloused palms, worn headlamp around neck, weathered outdoor gear with utility belt, Mina Escondida tunnel backdrop, no European features

## Prompt

Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a young local guide for extreme adventure tourists at Mina Escondida, the abandoned copper/silver mine across the Río de las Flores. Dark brown hair, short and tousled, perpetually dusty from the mine. Warm brown eyes, alert and resourceful. Medium height, lean and agile from climbing through labyrinthine tunnels. Sun-browned, weathered skin. A thin scar across his left eyebrow from the cave-in that made him local — and reluctant — hero. Strong hands with calloused palms from years of gripping rock. A worn headlamp always around his neck. He wears weathered outdoor gear — a canvas jacket, durable pants, a utility belt with mine gear. His expression is alert readiness tinged with wariness — the look of someone who has seen the inside of a cave-in and knows the difference between curiosity and danger. The backdrop is a Mina Escondida tunnel interior. Rough rock walls, wooden support beams, faint light from the entrance behind him, the smell of old dust. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.

## Negative Prompt

--no neon, no androids, no clean backgrounds, no anime, no cartoon, no text, no watermarks, no blurry, no low quality, no European features

## Variations

- [ ] Diego at the mouth of Mina Escondida, headlamp around his neck, briefing a new group of adventure tourists with practiced caution
- [ ] Diego deep in the mine, navigating a narrow passage, flashlight beam cutting through dust, the guide at work
- [ ] Diego at the riverside below the mine at dusk, headlamp off, the reluctant hero who knows the silver story will bring trouble

## Expression Variants

Authored expressions (each as `assets/diego__<tag>.png`, referenced in `portrait_urls[]` with an `expression` tag — see [docs/ASSET_EXPRESSION_VOCABULARY.md](../../../docs/ASSET_EXPRESSION_VOCABULARY.md)):

- **`__default.png`**: Use the base portrait as reference. Young local mine guide, neutral alert cautious expression, looking at the camera, 3/4 take. Dark brown short tousled dusty hair, warm brown alert resourceful eyes, medium height lean agile build, sun-browned weathered skin, thin scar across left eyebrow, calloused palms, worn headlamp around neck, weathered canvas jacket and durable pants, utility belt with mine gear. Mina Escondida tunnel backdrop, rough rock walls and wooden support beams. Keep the same art style as reference: premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait. Clean confident linework, painterly soft shading, muted natural palette, zero conventional beauty templates.

- **`__vigilant.png`**: Use the base portrait as reference. He is in sharp alertness, looking directly at the camera, 3/4 take. Warm brown eyes narrowed with guide's vigilance, scanning the tunnel mouth behind him. Dark brown short tousled hair, thin scar across left eyebrow catching light. Calloused hands resting on his utility belt. Worn headlamp prominent. Weathered canvas jacket. Mina Escondida tunnel backdrop under directional flashlight beam. Keep the same art style as reference, same canvas jacket and headlamp. Clean confident linework, painterly soft shading, muted natural palette.

- **`__determined.png`**: Use the base portrait as reference. He has a resolute, firm expression, looking unflinchingly at the camera, 3/4 take. Warm brown eyes steady with the resolve of a survivor, jaw squared. Thin scar across left eyebrow prominent. Dark brown short tousled hair, worn headlamp around neck. Lean agile build squared, weathered canvas jacket. Utility belt with mine gear. Mina Escondida tunnel backdrop with strong directional light. Keep the same art style as reference, same outdoor gear. Clean confident linework, painterly soft shading, muted natural palette.

- **`__cautious.png`**: Use the base portrait as reference. He has a wary, careful expression, looking at the camera, 3/4 take. Warm brown eyes watchful, the guide who knows the risk. Dark brown short tousled hair, thin scar across left eyebrow. Calloused palms visible at his sides, worn headlamp around neck. Weathered canvas jacket open. Mina Escondida tunnel backdrop, shadows deep behind him. Keep the same art style as reference, same canvas jacket and headlamp. Clean confident linework, painterly soft shading, muted natural palette.

- **`__tired.png`**: Use the base portrait as reference. He has a quietly burdened expression, looking gently at the camera, 3/4 take. Warm brown eyes open with the weight of what he survived, the reluctant hero tired of the attention. Dark brown short tousled hair slightly disheveled, thin scar across left eyebrow faint. Calloused hands resting on his utility belt. Worn headlamp hanging low. Weathered canvas jacket open at the collar. Mina Escondida tunnel backdrop under dimmer light. Keep the same art style as reference, same outdoor gear and headlamp. Clean confident linework, painterly soft shading, muted natural palette.
