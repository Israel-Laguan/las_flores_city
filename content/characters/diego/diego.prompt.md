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

Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a young late-20s Latino male. Dark brown short tousled dusty hair, warm brown alert resourceful eyes, medium height lean agile build, sun-browned weathered skin, thin scar across left eyebrow from cave-in, strong calloused hands, worn headlamp around neck, rugged practical outdoor gear, Mina Escondida tunnel backdrop, no European features

## Prompt

Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a young local from Old Las Flores who became a guide at the abandoned Mina Escondida — and a reluctant hero after a cave-in. Dark brown, short and tousled hair, perpetually dusty. Warm brown, alert and resourceful eyes. Medium height, lean and agile from climbing through mine tunnels. Sun-browned, weathered skin from outdoor work. A thin scar across his left eyebrow from the cave-in. Strong, calloused hands. A worn headlamp always around his neck. He wears rugged practical outdoor gear — a canvas jacket, cargo pants, sturdy boots, weathered by years of guiding tourists into the old mine. His expression is alert humility — the look of someone who does not seek heroism but has it thrust upon him, who now urges caution even as treasure hunters ignore him. The backdrop is the entrance of Mina Escondida, across the Río de las Flores in Old Las Flores. Weathered timber supports, old tracks leading into darkness, the abandoned copper/silver mine that changed his life. Late afternoon light filtering into the tunnel mouth. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.

## Negative Prompt

--no neon, no androids, no clean backgrounds, no anime, no cartoon, no text, no watermarks, no blurry, no low quality, no European features

## Variations
n
- [ ] Diego at the mine entrance, headlamp around his neck, checking gear before a guided tour, the reluctant professional
- [ ] Diego in a deep tunnel passage, flashlight cutting darkness, pointing out silver glimmers in the wall, the discovery moment
- [ ] Diego sitting on a rock by the river outside the mine, headlamp loose around his neck, urging a group of treasure hunters to turn back

## Expression Variants

Authored expressions (each as `assets/diego__<tag>.png`, referenced in `portrait_urls[]` with an `expression` tag — see [docs/ASSET_EXPRESSION_VOCABULARY.md](../../../docs/ASSET_EXPRESSION_VOCABULARY.md)):

- **`__default.png`**: Use the base portrait as reference. Young Mina Escondida guide, neutral alert composed expression, looking at the camera, 3/4 take. Dark brown short tousled dusty hair, warm brown alert resourceful eyes, medium height lean agile build, sun-browned weathered skin, thin scar across left eyebrow from cave-in, strong calloused hands, worn headlamp around neck, rugged practical outdoor gear. Mina Escondida tunnel entrance backdrop, weathered timber and old tracks. Keep the same art style as reference: premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait. Clean confident linework, painterly soft shading, muted natural palette, zero conventional beauty templates.

- **`__determined.png`**: Use the base portrait as reference. He has a resolved, firm expression, looking unflinchingly at the camera, 3/4 take. Warm brown eyes steady with guide's resolve, jaw squared. Thin scar across left eyebrow prominent, dark brown short tousled hair. Strong calloused hands fisted lightly, worn headlamp around neck. Rugged practical outdoor gear. Mina Escondida backdrop under strong directional light. Keep the same art style as reference, same canvas jacket and cargo pants. Clean confident linework, painterly soft shading, muted natural palette.

- **`__vigilant.png`**: Use the base portrait as reference. He is in sharp alertness, looking directly at the camera, 3/4 take. Warm brown eyes narrowed with guide's vigilance, brow slightly furrowed. Dark brown short tousled dusty hair, thin scar across left eyebrow. Strong calloused hands, worn headlamp around neck. Rugged practical outdoor gear. Mina Escondida backdrop, tunnel darkness behind him. Keep the same art style as reference, same headlamp. Clean confident linework, painterly soft shading, muted natural palette.

- **`__vulnerable.png`**: Use the base portrait as reference. He has a quietly burdened expression, looking gently at the camera, 3/4 take. Warm brown eyes open with survivor's weight, mouth slightly parted. Thin scar across left eyebrow catching light, dark brown hair falling forward. Strong calloused hands open, worn headlamp hanging loose. Rugged practical outdoor gear. Mina Escondida backdrop under softer, quieter light. Keep the same art style as reference, same canvas jacket. Clean confident linework, painterly soft shading, muted natural palette.

- **`__smirk.png`**: Use the base portrait as reference. He wears a faint, knowing half-smile, looking at the camera, 3/4 take. Warm brown eyes glinting with dry humor, one corner of his mouth pulled up. Thin scar across left eyebrow, dark brown short tousled hair. Strong calloused hands resting on hips, worn headlamp around neck. Rugged practical outdoor gear. Mina Escondida backdrop under warm golden light. Keep the same art style as reference, same cargo pants and boots. Clean confident linework, painterly soft shading, muted natural palette.
