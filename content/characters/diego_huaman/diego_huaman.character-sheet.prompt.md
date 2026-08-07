# Character Sheet: Diego Huamán

[CONSUMER: biometric]
**Type:** character-sheet
**Source:** content/characters/diego_huaman/char_diego_huaman.yaml
**Target:** `asset_paths.portrait` in `content/characters/diego_huaman/char_diego_huaman.yaml`
**Pipeline stage:** reference
**Recommended tools:** Use biometric sheets (face + body) + moveset poses below

---

## 1. Face Reference
Use the horizontal and vertical face arcs from the biometric phase
(`content/characters/diego_huaman/diego_huaman.biometric.prompt.md`).
Ethnicity/face base and expressions are defined there.

## 2. Body Reference (minimal / plain clothes)
Use the 3-panel orthographic body sheet from the biometric phase
(front / side / rear, minimal black gym clothes, A-pose).
Body shape is defined in `docs/lore/assets/registries/body_shapes.yaml`.

## 3. Moveset — Office / Knowledge Worker
**Occupation:** University Student (Environmental Science Major)

Desk-bound motion: typing, gesturing at screens, presenting.

This character's unique movement vocabulary, distinct from generic NPCs.
Resolved from `docs/lore/assets/registries/movesets.yaml` by occupation.

### Pose 1: `pose_typing`
seated, hands on a keyboard, eyes on a screen, rapid finger motion

*Prompt keywords:* typing at keyboard, eyes on screen, rapid fingers

### Pose 2: `pose_pointing_screen`
standing beside a screen, one arm extended pointing at it, turning to address someone

*Prompt keywords:* pointing at screen, addressing someone, explanatory

### Pose 3: `pose_presenting`
standing upright, open palms toward audience, confident delivery posture

*Prompt keywords:* presenting, open palms to audience, confident delivery

---

## Assembly notes
- Face + body come from the biometric sheets (isolation rule: neutral expression,
  hair pulled back, no makeup, minimal gym clothes).
- The moveset poses above are layered on the body sheet for action/animation frames.
- Keep the same face base and body geometry across all sheets for consistency.

---

## Expression Variants

The character sheet is an assembly reference (neutral face + body geometry from the biometric sheets). It does not author expression portrait variants directly; expression variants are produced from the base portrait per `diego_huaman.prompt.md`'s `## Expression Variants` section (`__default`, `__happy`, `__focused`, `__vulnerable`, `__determined`). This sheet feeds those variants by locking:

- **Face base**: neutral, hair pulled back, no makeup/jewelry (from biometric Sheet 1/2).
- **Body base**: lean athletic build, minimal black gym clothes (from biometric Sheet 3).
- **Consistency rule**: every expression variant must reuse this exact face + body geometry.
