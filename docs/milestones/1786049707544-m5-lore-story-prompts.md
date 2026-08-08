# M5 — Lore-Story Reference-Image Prompts (41)

**Milestone file:** `1786049707544-m5-lore-story-prompts.md`
**Depends on:** M1. Independent of M2/M3.
**Deliverable:** a `<slug>.prompt.md` (story illustration) for each folder in
`content/lore/stories/`.
**Status:** executable. Run as its own chat; read master + M1 docs first.

---

## Goal

Give every lore-story under `content/lore/stories/` a reference-image prompt so
its key scene can be illustrated. Today **0 of 41** folders have a `.prompt.md`
(each has only `<slug>.md`). Reference model:
`content/stories/real_heroism_in_latam/real_heroism_in_latam.prompt.md`
(already good — use as the shape, do not modify it).

## Scope (41 — enumerate live)

```bash
cd /home/anthony/code/las_flores_city
ls -d content/lore/stories/*/ | sed 's|.*/stories/||; s|/||'
```

## Per-story steps

1. Read `content/lore/stories/<slug>/<slug>.md` and identify the **one key
   scene** (or, if the story warrants it, up to 2–3 beats).
2. Create `content/lore/stories/<slug>/<slug>.prompt.md` with this **story-illustration template**:

```markdown
---
name: <Story Title>
type: story-illustration
size: 1920x1080
source: content/lore/stories/<slug>/<slug>.md
target: `assets/<slug>__default.png`
consumer: html-background
---

# Prompt: <Story Title> — reference image

[CONSUMER: html-background]
**Type:** story illustration
**Dimensions:** 1920x1080

## Prompt — Base Scene
<cinematic comic-book panel, modern colorful graphic novel style. Concrete
visual description of the key scene: setting, characters on screen, lighting,
composition, mood rendered through light/color not emotional adjectives.
Character-consistent with the project cast. DC/Marvel-quality illustration,
vibrant colors with grounded realism, cinematic lighting, highly detailed.>

## Negative Prompt
--no <photorealistic photo, anime, cartoon, text overlay, watermarks, neon,
android/cyber-monsters, futuristic sci-fi, extreme violence, blood, gore, guns>

## Variations
- [ ] <alternate framing/beat 1>
- [ ] <alternate framing/beat 2>
```

3. Follow the **graphic-novel realism** lock (no photorealistic; `PROMPT_GUIDELINES.md`
   word-replacements like "governor→civic" still help avoid content filters —
   prefer concrete visual language).
4. Create an `assets/` folder (empty; PNG generated in the deferred asset pass).
   Run `bash scripts/backup-content-assets.sh` first if you place any file there.

## Acceptance criteria (M5)

- [ ] All **41** lore-story folders have a `<slug>.prompt.md` with the story-illustration template.
- [ ] Each prompt's key scene is grounded in its `<slug>.md` (no generic copy-paste).
- [ ] Each has an `assets/` folder.
- [ ] Project graphic-novel/editorial style applied; no photorealistic/anime.

## Verification

```bash
ls content/lore/stories/*/*.prompt.md | wc -l   # → 41
```
