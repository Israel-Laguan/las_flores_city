# Character Portrait Prompt Gotchas

**Version:** 1.0
**Last Updated:** 2026-08-05
**Purpose:** Document common mistakes and best practices when creating `.prompt.md` files for characters to prevent recurrence across the codebase.

---

## 🚨 Critical Gotchas

### 1. Ethnicity Mismatch

**Problem:** Character prompts sometimes describe wrong ethnicity due to copy-paste errors or outdated templates.

**Examples Found:**
- `aisha_al_sayed.prompt.md` described as "Chinese" when she is Middle Eastern Arab from Cairo
- `fatima_el_kholi.prompt.md` also had "Chinese" instead of Arab

**Fix:** Always cross-reference the prompt against the character's `.md` lore file. Verify:
- Ethnicity (Arab, Latino, Asian, etc.)
- National origin (Cairo, Tokyo, etc.)
- Physical traits match described heritage

**Prevention:**
- Add ethnicity-specific negative prompts (e.g., `no East Asian features, no Chinese aesthetics`)
- Maintain a checklist before generating assets

---

### 2. Character Names in Prompts

**Problem:** Including fictional character names in prompts wasted tokens and confused genAI models.

**Examples Fixed:**
- Removed "Aisha Al-Sayed" from Draft and main Prompt sections
- Removed "Adeyemi Ogunbiyi" from prompts
- Kept names only in YAML metadata and document titles

**Why:** GenAI models (various providers, FLUX, etc.) are not trained on fictional character names. Including them uses precious character budget without adding value.

**Rule:** Character names belong in metadata only. Never include in:
- `## Prompt (Draft)`
- `## Prompt`
- Expression Variant prompts

**Exception:** Names may appear in Variations section for human readability.

---

### 3. Draft Section Formatting

**Problem:** Draft prompts were either too verbose or incorrectly formatted.

**Correct Format:**
```markdown
## Prompt (Draft)
[Art style], [portrait type] of a [ethnicity] [gender] in her [age]. [Key traits comma-separated]. [Clothing/accessories]. [Art style continuations]. NO [negative elements]...
```

**Key Requirements:**
- ✅ Concise, comma-separated descriptions (not full sentences)
- ✅ No character names
- ✅ No trailing `...` (removed per user preference)
- ✅ All essential visual details preserved
- ✅ Ethnicity accurately stated

**Example (Aisha Al-Sayed):**
```text
Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a Middle Eastern Arab woman in her late 30s. Lean angular frame, deep amber-brown eyes sharp and focused, stern expression with steady bearing. Dark brown wavy hair in practical low bun, slight widow's peak, wire-rimmed glasses, sport earbud clipped to earlobe. Wears minimalist work clothing with high-visibility safety vest over blouse, warm olive complexion. hyper-detailed, grounded human anatomy with natural asymmetry, 8k. NO photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, East Asian features, Chinese aesthetics
```

---

### 4. Expression Variants Must Be Real Prompts

**Problem:** Expression Variants were initially just descriptive text like "Neutral / resting face (always required)" which genAI cannot use.

**Fix:** Each expression variant must be a complete, usable prompt.

**Template:**
```markdown
- **`__<expression>.png`**: Use the base portrait as reference. [Character description], [expression-specific details], looking at the camera, 3/4 take. [Key visual changes]. Keep the same art style as reference, same clothing and backdrop. [Style details].
```

**Key Requirements:**
- ✅ Starts with "Use the base portrait as reference"
- ✅ Specifies camera perspective: "looking at the camera, 3/4 take"
- ✅ Describes expression-specific facial features
- ✅ Mentions lighting changes if applicable
- ✅ Explicitly states: "Keep the same art style as reference, same clothing and backdrop"
- ✅ Ends with style details (Clean confident linework, etc.)
- ❌ No "(always required)" text

---

### 5. Expression Variants Must Be Visually Descriptive

**Problem:** Early expression variants were too sparse (e.g., "She is in thoughtful expression, looking at the camera, 3/4 take").

**Fix:** Add rich visual details to guide genAI effectively.

**Before (Too Sparse):**
```text
She is in thoughtful expression, looking at the camera, 3/4 take. Deep amber-brown eyes gazing into distance, calculating.
```

**After (Visually Rich):**
```text
She is in deep thought, looking thoughtfully at the camera with a 3/4 take. Deep amber-brown eyes gazing softly into middle distance, calculating and weighing options. Slight downward tilt to her head, wire-rimmed glasses resting naturally, mouth relaxed but thoughtful. Warm olive complexion glows under soft industrial facility lighting, creating gentle shadows.
```

**Visual Details to Include:**
- Eye state (wide open, narrowed, gazing into distance, etc.)
- Mouth position (thin line, slightly open, half-smile, etc.)
- Brow position (raised, furrowed, relaxed, etc.)
- Jaw/cheekbones emphasis
- Lighting effects and shadows
- Body language (tilt, lean, etc.)
- Clothing details relative to expression

---

### 6. Source Path Corrections

**Problem:** Some prompt files had incorrect source paths pointing to old `docs/lore/figures/` location.

**Correct Format:**
```yaml
---
name: Character Name
type: portrait
size: 1024x1024
source: content/characters/<slug>/<slug>.md
target: `portrait_urls[].url` in `content/characters/char_<slug>.yaml`
consumer: portrait
---
```

**Rule:** Source paths must point to `content/characters/<slug>/<slug>.md`, NOT `docs/lore/figures/...`

---

### 7. Negative Prompt Ethnic Exclusions

**Problem:** Characters with specific ethnicities generated wrong ethnic features without explicit exclusions.

**Fix:** Add ethnicity-specific negative prompts.

**Examples:**
- Middle Eastern Arab character: `no East Asian features, no Chinese aesthetics, no Japanese aesthetics`
- Latino character: `no East Asian features, no African features` (if specific Latino look desired)
- Specific ethnicity: Exclude other ethnicities that might cause confusion

**Where to Add:** Both in Draft NO clause and main Negative Prompt section.

---

## ✅ Pre-Flight Checklist

Before generating any character assets, verify:

### Content Accuracy
- [ ] Ethnicity in prompt matches lore file
- [ ] Age in prompt matches lore file
- [ ] Physical description (hair, eyes, build, skin tone) matches lore
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

---

## 📋 Quick Reference: Common Mistakes

| Mistake | Found In | Fix |
|---------|----------|-----|
| Wrong ethnicity | aisha_al_sayed, fatima_el_kholi | Cross-check lore file, add ethnicity exclusions |
| Character name in prompt | aisha_al_sayed, adeyemi_ogunbiyi | Remove from prompts, keep in metadata only |
| Sparse expression variants | aisha_al_sayed, adeyemi_ogunbiyi | Add visual details (eye state, lighting, body language) |
| Missing camera perspective | Expression variants | Add "looking at the camera, 3/4 take" |
| Descriptive text not prompts | Expression variants | Convert to real prompts with "Use base as reference" |
| Incorrect source path | aisha_al_sayed | Update to `content/characters/...` |
| "Always required" text | Expression variants | Remove, it's implied |

---

## 🎯 Best Practices

1. **Always read the lore first**: Before writing any prompt, read the character's `.md` file completely.

2. **Use the checklist**: Run through the Pre-Flight Checklist for every character.

3. **Copy from working examples**: Use `adeyemi_ogunbiyi.prompt.md` and `aisha_al_sayed.prompt.md` (post-fix) as templates.

4. **Test with one variant first**: Generate the `__default.png` first, verify it matches expectations before creating all variants.

5. **Document new gotchas**: When you find a new issue, add it to this document immediately.

---

## 📚 Related Documentation

- [ASSET_EXPRESSION_VOCABULARY.md](ASSET_EXPRESSION_VOCABULARY.md) - Expression tag conventions
- [PROMPT_AUTHORING_SPEC.md](PROMPT_AUTHORING_SPEC.md) - Canonical character prompt authoring spec (template, static map, AI contract, quality gate)
- [content/characters/adeyemi_ogunbiyi/adeyemi_ogunbiyi.prompt.md](../content/characters/adeyemi_ogunbiyi/adeyemi_ogunbiyi.prompt.md) - Reference implementation
- [content/characters/aisha_al_sayed/aisha_al_sayed.prompt.md](../content/characters/aisha_al_sayed/aisha_al_sayed.prompt.md) - Reference implementation
