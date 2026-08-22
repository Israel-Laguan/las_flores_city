# Character Portrait Prompt Authoring Spec

**Status:** REVISED (v2) — Milestone canonical contract. Frontmatter is the single source of truth for metadata; the legacy body metadata block is removed.
**Applies to:** Every `.prompt.md` under `content/characters/<slug>/`.
**Master plan:** retired (2026-08-09). The durable art-style lock, static-extraction
map, AI-pass contract, quality gate, and conflicts-resolved sections below are the
long-term home of that guidance; the per-step milestone tracking files (M1–M8,
M28–M32) are captured in the [M42 content-assets milestone](milestones/M42-content-assets-migration.md).

> **Note:** This project does not use MidJourney. All generation is handled by
> the configured AI image generation pipeline (NIM / Pollinations / Akool / etc.).
> Aspect ratio and pixel dimensions are recorded in frontmatter (`aspect_ratio:`,
> `size:`) only — never hard-coded into prompt prose or body metadata.

---

## 1. Art-Style Lock (LOCKED — do not re-litigate)

Character portrait `.prompt.md` files use **graphic novel realism only**.

### Lock string

```
premium contemporary graphic novel realism, refined editorial line art illustration
```

Every `## Prompt` and every `## Expression Variants` prompt MUST begin with or
re-state this lock string. Aspect ratio is recorded in frontmatter `aspect_ratio:`
and must not be hard-coded into generation prompts.

### Length

There is **no hard character cap** on the combined prompt + negative prompt for
character portraits. The only length guard is the negative-prompt rule below
(<200 chars). Earlier "800-character" / "600–750 recommended" constraints come
from `docs/lore/PROMPT_GUIDELINES.md`, which was written for NVIDIA NIM
FLUX.2 Klein and **does not apply** to character portraits. Do not apply it.

### Discarded direction

`docs/lore/PROMPT_GUIDELINES.md` (NVIDIA NIM FLUX.2 Klein) is **discarded** for
character `.prompt.md` files. Its rules ("no graphic novel", 800-char cap,
emotional-language scrub) conflict with the locked graphic-novel style and are
retained only for non-character prompts (e.g. scene/location prompts when those
types are addressed in a future pass).

Similarly, `docs/lore/guides/templates/templates.md` **TEMPLATE 3** ("Character
Portrait Template") opens with `Photorealistic portrait of …` — this is
**superseded** for character `.prompt.md` files by this spec. It may remain in
`templates.md` for non-character use cases but must not be used for characters.

---

## 2. Canonical Template

Every character `.prompt.md` MUST follow this exact section order and lock
strings. Replace `<Full Name>` and `<slug>` per-character.

```markdown
---
name: <Full Name>
type: portrait
size: 1024x1024
aspect_ratio: 3:4
source: content/characters/<slug>/<slug>.md
target: `asset_paths.portrait` in `content/characters/<slug>/char_<slug>.yaml`
consumer: portrait
---

# Prompt: <Full Name>

## Prompt (Draft)
<concise, comma-separated, NO character name>

## Prompt
<premium contemporary graphic novel realism, refined editorial line art
illustration, waist-up portrait of … grounded anatomy, natural asymmetry,
art-style lock, backdrop, 8k>

## Negative Prompt
--no <neon, androids, clean backgrounds, anime, cartoon, text, watermarks,
blurry, low quality, ethnicity exclusions, …> (<200 chars)

## Variations
- [ ] <scene variation 1>
- [ ] <scene variation 2>
- [ ] <scene variation 3>

## Expression Variants
<!-- Variants are staged as `assets/<slug>__<tag>.png` and wired into
     `portrait_urls[]` (characters) / `background_urls[]` (scenes) with an
     `expression` tag — see docs/ASSET_EXPRESSION_VOCABULARY.md. -->

- **`__default.png`**: Use the base portrait as reference. <…, neutral resting
  expression, looking at the camera, 3/4 take…> Keep the same art style as
  reference, same clothing and backdrop.
- **`__<expr>.png`**: Use the base portrait as reference. <…expression-specific
  description…> Keep the same art style as reference, same clothing and backdrop.
```

---

## 3. Metadata Location (v2)

All machine-readable metadata lives in the YAML frontmatter block at the top
of the file. The legacy body metadata block (`[CONSUMER: ...]`, `**Type:**`,
`**Source:**`, `**Target field:**`, `**Dimensions:**`) is removed from the
canonical template. These fields remain in frontmatter only:

| Field | Example |
|---|---|
| `name` | `Carlos Lopez` |
| `type` | `portrait` |
| `size` | `1024x1024` |
| `aspect_ratio` | `3:4` |
| `source` | `content/characters/<slug>/<slug>.md` |
| `target` | `` `asset_paths.portrait` in `content/characters/<slug>/char_<slug>.yaml` `` |
| `consumer` | `portrait` |

All machine-readable metadata lives in frontmatter. The body must not restate
`[CONSUMER:]`, `**Type:**`, `**Source:**`, `**Target field:**`, or
`**Dimensions:**`.

---

## 4. Expression Variants

Expression variants are **not** moved to frontmatter. They remain in the
`## Expression Variants` body section because:

1. A character can have multiple expressions (default, happy, sad, angry, …).
2. They are managed via `portrait_urls[]` with `expression` tags in the entity YAML.
3. Each variant is a full usable prompt, not a single metadata value.

See `docs/ASSET_EXPRESSION_VOCABULARY.md` for the expression vocabulary and
file-naming convention (`assets/<slug>__<tag>.png`).

---

## 5. Quality Checklist

Before marking a character `.prompt.md` complete, verify:

### Frontmatter
- [ ] `name:` matches the entity name
- [ ] `type: portrait`
- [ ] `size: 1024x1024`
- [ ] `aspect_ratio: 3:4`
- [ ] `source:` points to `content/characters/<slug>/<slug>.md`
- [ ] `target:` points to the entity YAML `asset_paths.portrait` field
- [ ] `consumer: portrait`
- [ ] No legacy body metadata block (`[CONSUMER:]`, `**Type:**`, `**Source:**`, `**Target field:**`, `**Dimensions:**`, `**Tool:**`)

### Body
- [ ] `## Prompt (Draft)` is concise, comma-separated, NO character name
- [ ] `## Prompt` restates the graphic-novel lock string
- [ ] `## Negative Prompt` includes ethnicity exclusions and is <200 chars
- [ ] `## Variations` has 3 scene ideas
- [ ] `## Expression Variants` has 5 usable prompts (`__default` + 4 expressions)
- [ ] Each variant starts with "Use the base portrait as reference"
- [ ] Each variant specifies "looking at the camera, 3/4 take"
- [ ] Each variant has rich visual descriptions
- [ ] Each variant explicitly keeps "same art style as reference, same clothing and backdrop"
- [ ] `__default.png` exists and is described as the base

### Negative Prompts
- [ ] Includes ethnicity exclusions where applicable
- [ ] Under 200 characters
- [ ] Contains: no neon, no androids, no clean backgrounds, no anime, no cartoon, no text, no watermarks, no blurry, no low quality

Any failed box is a **hard block**. Fix and re-check before proceeding.

### Hard rules

- **No character name** in `## Prompt (Draft)`, `## Prompt`, or any Expression
  Variant block. Names may appear only in frontmatter `name:`, the document
  title, and the `## Variations` list (for human readability).
- `__default` is **always first and required**. Additional expressions are
  chosen from the core vocabulary in `docs/ASSET_EXPRESSION_VOCABULARY.md`.
- `source:` MUST be `content/characters/<slug>/<slug>.md`. The legacy
  `docs/lore/figures/<slug>/<slug>.md` path is deprecated and must not be used.
- Every Expression Variant is a **usable prompt**. It MUST start with
  "Use the base portrait as reference…", include "looking at the camera, 3/4
  take", and end with "same art style as reference, same clothing and backdrop"
  plus the art-style lock string details.
- The `## Prompt` refined prose MUST begin with the lock string and MUST
  describe a **waist-up portrait** with grounded human anatomy, natural
  asymmetry, a specific backdrop, and `8k`.

---

## 3. Static-Extraction Map

Deterministic source fields for each template slot. The AI pass MUST ground
every Prompt and Expression Variant in these sources before composing prose.

| Template slot | Source (deterministic) |
|---|---|
| `name` / title | `char_<slug>.yaml` → `name`, `title` |
| Ethnicity / origin / heritage | `<slug>.md` (cross-check; if empty, infer from name + lore + district) |
| Age | `<slug>.md` (or `docs/lore/guides/character_prompt_audit.json`); if still unclear, infer from career/role |
| Role / faction / profession | `char_<slug>.yaml` → `metadata.role`, `metadata.faction`, `title` |
| Face shape / jaw / cheekbones / nose / eyes / brow / lips | `character_prompt_audit.json` (if present for this character) else assign from the VST contrast axes below; **never duplicate** another character's face + jaw + nose + eye combo |
| Build / skin / hair texture | `<slug>.md` else VST axes |
| ≥1 asymmetric / imperfect feature | VST rule (mandatory) |
| Clothing / accessories | `<slug>.md` role-driven, functional; earbud convention for 2077 |
| Source path | always `content/characters/<slug>/<slug>.md` |

### VST contrast axes (retained from `visual_style_translator.md`)

These 10 axes are **style-agnostic** and are ported verbatim into graphic-novel
prose. They replace the VST's photorealistic prefix with the graphic-novel lock
string above.

1. **Face shape:** square / round / heart / oval / angular / long
2. **Jaw:** strong / soft / receding / prominent / asymmetric
3. **Cheekbones:** high / low / pronounced / subtle
4. **Nose:** straight / curved / wide / narrow / pointed / flat bridge
5. **Eyes:** almond / round / hooded / wide-set / narrow / deep-set
6. **Brow:** thick / thin / arched / flat / asymmetric
7. **Lips:** thin / full / wide / narrow / asymmetrical
8. **Build:** broad-heavy / lean-wiry / soft-rounded / athletic-compact / tall-skinny / stocky
9. **Skin texture:** weathered / smooth / freckled / scarred / sun-damaged / clear
10. **Hair texture:** curly / straight / wavy / coily / thin / thick

### Uniqueness & aging rules (retained from `visual_style_translator.md`)

- **NO TWO characters may share the same combination of:** face shape + jaw + nose + eye shape.
- **Every character MUST have at least ONE asymmetric or imperfect facial feature.**
- Characters over 40 get visible aging cues:
  - Men over 40: receding hairline, gray streaks, thicker brows, or skin texture changes.
  - Women over 40: subtle lines around eyes, slight brow droop, or skin texture changes.
- Zero flawless runway models. Every face must feel lived-in and specific.

### Collision-avoidance reference

`docs/lore/guides/character_prompt_audit.json` contains the existing
reference-matrix combos and duplicate checks. New characters MUST be assigned
biometrics that do not collide with any combo already in that file or in the
lore of an existing content character.

### No-physical-description fallback

If `<slug>.md` contains **no usable physical description** (garbled lines,
blank sections, or entirely absent biometric detail), the AI pass MUST **invent
grounded, unique anatomy** from the VST contrast axes above, using
`character_prompt_audit.json` as the collision reference. The spec requires this
explicitly so no prompt is shipped with blank or copied biometrics. The AI pass
MUST document in the prompt prose that the anatomy is inferred from lore context
and the VST axes.

---

## 4. AI-Pass Contract

The AI pass authors the following per character, then **reviews its own output**
against the quality gate (§5) before finalizing. It must NOT degrade a batch to
keep speed.

1. **`## Prompt (Draft)`** — concise, comma-separated prose, no character name,
   all key visual slots filled from the static-extraction map.
2. **`## Prompt`** — refined final prose: lock string lead, waist-up portrait,
   grounded anatomy from the static map + VST axes, specific backdrop, `8k`.
3. **`## Negative Prompt`** — base set (`neon, androids, clean backgrounds,
   anime, cartoon, text, watermarks, blurry, low quality`) PLUS character-specific
   ethnicity exclusions to prevent wrong-ethnicity rendering. MUST be <200 chars.
4. **`## Variations`** — at least three scene-context checklist items grounded
   in the character's role/faction/district.
5. **`## Expression Variants`** — one block per expression, each a **complete,
   usable prompt** starting "Use the base portrait as reference…", with
   "looking at the camera, 3/4 take", expression-specific facial/lighting
   details, and the closing "same art style as reference, same clothing and
   backdrop" lock.

The mandatory self-review step:
- Re-read the drafted file end-to-end.
- Run the Pre-Flight Checklist (§5) item by item.
- Fix any failure before the file is considered done.
- If a source field is empty or ambiguous, **do not ship a blank slot** — infer
  from adjacent sources or escalate as a blocker.

---

## 5. Quality Gate (Hard Pass/Fail)

A prompt is **done only when every box is checked**. Adopted verbatim from
`docs/CHARACTER_PROMPT_GOTCHAS.md` "✅ Pre-Flight Checklist".

### Content Accuracy
- [ ] Ethnicity in prompt matches lore file
- [ ] Age in prompt matches lore file
- [ ] Physical description (hair, eyes, build, skin tone) matches lore or inferred VST axes
- [ ] Clothing/accessories match lore (safety vest, glasses, etc.)
- [ ] Profession/context matches (Mineria Estrella engineer, etc.)

### Technical Formatting
- [ ] No character name in Draft or main Prompt
- [ ] Draft is concise with comma-separated details
- [ ] No trailing `...` in Draft
- [ ] Source path is correct (`content/characters/...`)

### Expression Variants
- [ ] `__default.png` exists and is described as the base
- [ ] Each variant starts with "Use the base portrait as reference"
- [ ] Each variant specifies "looking at the camera, 3/4 take"
- [ ] Each variant has rich visual descriptions
- [ ] Each variant explicitly keeps "same art style as reference, same clothing and backdrop"

### Negative Prompts
- [ ] Includes ethnicity exclusions where applicable
- [ ] Under 200 characters
- [ ] Contains: no neon, no androids, no clean backgrounds, no anime, no cartoon, no text, no watermarks, no blurry, no low quality

Any failed box is a **hard block**. Fix and re-check before proceeding.

---

## 6. Conflicts Resolved

| Conflict | Resolution |
|---|---|
| **Art style** | Graphic-novel realism **LOCKED**. Photorealistic prefix is **INCORRECT** for character `.prompt.md`. See §1. |
| **Discarded NIM direction** | `docs/lore/PROMPT_GUIDELINES.md` (NVIDIA NIM FLUX.2 Klein) applies to non-character prompts only. Its 800-char cap, "no graphic novel" rule, and `Photorealistic portrait, hyper-detailed…` prefix are **discarded** for characters. |
| **Length rules** | No hard prompt cap for character portraits. Negative prompt MUST remain <200 chars. |
| **VST retention** | Retain the 10 contrast axes, uniqueness rule ("no two characters share face+jaw+nose+eye"), ≥1 asymmetric/imperfect feature rule, aging rules, and `character_prompt_audit.json` reference matrix. Drop the VST's photorealistic prefix and replace with the graphic-novel lock string. |
| **VST output format** | The VST produces JSON `{face_reference_prompt, body_reference_prompt}`. This is **retained as a style-agnostic guide** for biometric assignment, not as the output format. Character `.prompt.md` files use the markdown template in §2. |
| **`templates.md` TEMPLATE 3** | Superseded for character portraits by this spec. Retain in `templates.md` only for non-character use. |
| **Source path** | MUST be `content/characters/<slug>/<slug>.md`. `docs/lore/figures/...` is deprecated. |
| **Expression variants format** | Must be **real usable prompts**, not descriptive text. Must start "Use the base portrait as reference…" and include camera + art-style lock. |
| **Character names** | Names belong in metadata and titles only. Never in Draft, Prompt, or Expression Variant prose. |
| **Body metadata block** | v2 moves `type`, `size`, `source`, `target`, `consumer` to frontmatter. Body block (`[CONSUMER:]`, `**Type:**`, `**Source:**`, `**Target field:**`, `**Dimensions:**`) is removed from the canonical template. `**Tool:**` and pipeline notes remain in body. |


---

## Reference: Core Expression Vocabulary

From `docs/ASSET_EXPRESSION_VOCABULARY.md`. Characters need not use all — choose
per character from role and lore context.

| Tag | Meaning |
|---|---|
| `default` | Neutral / resting face (always required) |
| `happy` | Warm, open smile |
| `sad` | Downcast, grief |
| `angry` | Confrontational |
| `surprised` / `shocked` | Sudden revelation |
| `calculating` | Cold focus, thinking |
| `vulnerable` | Guard down, soft |
| `tender` | Intimate warmth |
| `smirk` | Sardonic, knowing |
| `afraid` | Fear, threat |
| `disgusted` | Moral rejection |
| `determined` | Resolve |

---

## Gold Example

The reference Tier-1 implementation is
`content/characters/carlos_lopez/carlos_lopez.prompt.md`. It demonstrates:
- the canonical template with frontmatter and section order;
- the graphic-novel lock string with no photorealistic tail;
- invented grounded anatomy from VST axes (the lore provides no physical
  description), with documented collision avoidance against the reference matrix;
- five real usable expression variants (`__default`, `__calculating`,
  `__determined`, `__smirk`, `__shocked`);
- a negative prompt with ethnicity exclusions under 200 chars;
- no character name inside Draft, Prompt, or Expression Variant prose.
