# M1 — Prompt Template & Strategy Definition

**Milestone file:** `1786049707544-m1-template-and-strategy.md`
**Depends on:** master plan `1786049707544-prompt-production-master.md`
**Deliverables:** canonical spec + template + static map + AI contract +
quality gate + **one worked gold example** + conflicts note.
**Status:** executable. Run as its own chat; read the master plan first.

---

## Goal

Produce the single canonical prompt-authoring contract under `docs/` by
**reconciling the existing, fragmented prompt infrastructure** (listed below).
This contract is what Milestones 2–5 execute against. It must resolve the known
conflicts so future **automated** runs cannot reintroduce the "bad prompt"
quality problems that the earlier bulk generation produced.

## What to produce (outputs)

1. **`docs/PROMPT_AUTHORING_SPEC.md`** — the canonical authoring spec containing:
   - the locked art-style decision (graphic-novel realism only; see Master §2);
   - the finalized canonical template (section order + exact lock strings);
   - the static-extraction map (which source fields → which template slots);
   - the AI-pass contract (what the AI authors + the mandatory review step);
   - the quality gate (the `CHARACTER_PROMPT_GOTCHAS.md` Pre-Flight Checklist
     adopted as a hard pass/fail);
   - a "conflicts resolved" section (art-style lock, discarded NIM direction,
     length rules) so the drift cannot recur.
2. **A gold example** — upgrade `content/characters/carlos_lopez/carlos_lopez.prompt.md`
   (a ~1 KB Tier-3 stub) end-to-end to Tier-1, as the concrete definition of
   "good quality". Commit it so Milestones 2–3 have a reference to match.
3. **Update** `docs/CHARACTER_PROMPT_GOTCHAS.md` → *Related Documentation* to
   link the new spec (append only; do not rewrite the gotchas content).

## Inputs to reconcile (read all before writing)

- `content/characters/adeyemi_ogunbiyi/adeyemi_ogunbiyi.prompt.md` (gold ref 1)
- `content/characters/aisha_al_sayed/aisha_al_sayed.prompt.md` (gold ref 2)
- `docs/CHARACTER_PROMPT_GOTCHAS.md` (quality gate + checklist)
- `docs/ASSET_EXPRESSION_VOCABULARY.md` (expression tags, file naming)
- `docs/lore/guides/visual_style_translator/visual_style_translator.md`
  (RETAIN the 10 contrast axes, uniqueness/aging rules; DROP the photorealistic prefix)

---

## Canonical template (finalized prose to encode in the spec)

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
Authored expressions (each as `assets/<slug>__<tag>.png`, referenced in
`portrait_urls[]` with an `expression` tag — see docs/ASSET_EXPRESSION_VOCABULARY.md):

- **`__default.png`**: Use the base portrait as reference. <…, neutral resting
  expression, looking at the camera, 3/4 take…> Keep the same art style as
  reference, same clothing and backdrop.
- **`__<expr>.png`**: Use the base portrait as reference. <…expression-specific
  description…> Keep the same art style as reference.
```

Rules encoded in the spec:
- **No character name** in Draft/Prompt/Expression Variants (metadata/title only).
- **`__default` always first** / required; expressions chosen per character from
  the vocabulary (e.g., detective → default/vulnerable/shocked/calculating;
  warm NPC → default/happy/smirk; authority → default/determined/calculating).
- **`source:` must be `content/characters/<slug>/<slug>.md`** (never `docs/lore/figures/`).
- Every Expression Variant is a **usable prompt** starting "Use the base
  portrait as reference…" with "looking at the camera, 3/4 take" and "same art
  style as reference, same clothing and backdrop".

## Static-extraction map (into the spec)

| Template slot | Source (deterministic) |
|---|---|
| name / title | `char_<slug>.yaml` → `name`, `title` |
| ethnicity / origin / heritage | `<slug>.md` (cross-check; if empty, infer from name + lore) |
| age | `<slug>.md` (or audit json) |
| role / faction / profession | `char_<slug>.yaml` → `metadata.role`, `metadata.faction`, `title` |
| face/jaw/cheekbones/nose/eyes/brow/lips | `character_prompt_audit.json` (if present) else assign from VST contrast axes, never duplicating another character's face+jaw+nose+eye |
| build / skin / hair texture | `<slug>.md` else VST axes |
| ≥1 asymmetric/imperfect feature | VST rule (mandatory) |
| clothing / accessories | `<slug>.md` role-driven, functional; earbud convention for 2077 |
| source path | always `content/characters/<slug>/<slug>.md` |

If the `.md` has **no physical description** (audit json flags it critical):
the AI pass must **invent grounded, unique anatomy** from the VST contrast
axes using the reference matrix for collision-avoidance — and the spec must say
so explicitly (this is the static fallback rule).

## AI-pass contract (into the spec)

The AI pass authors, per character:
1. the refined `## Prompt` prose (graphic-novel lock, grounded anatomy from the
   static map + VST axes);
2. the `## Negative Prompt` (base set + character-specific ethnicity exclusions);
3. the `## Variations` checklist;
4. the `## Expression Variants` (each a usable prompt, art-style-locked).

Then it **reviews its own output** against the quality gate and only then
finalizes. It must NOT degrade a batch to keep speed.

## Quality gate (adopt the gotchas Pre-Flight Checklist verbatim)

Reference `docs/CHARACTER_PROMPT_GOTCHAS.md` "✅ Pre-Flight Checklist". A prompt
is **done only when every box is checked**. The spec reproduces it (Content
Accuracy / Technical Formatting / Expression Variants / Negative Prompts).

## Gold-example spec (`carlos_lopez`)

Upgrade `content/characters/carlos_lopez/carlos_lopez.prompt.md` from its stub
(has NO frontmatter, uses deprecated auto-gen boilerplate) to the canonical
template above, grounded in `carlos_lopez.md` + `char_carlos_lopez.yaml`.
Commit it as the reference for M2/M3.

## Acceptance criteria (M1)

- [ ] `docs/PROMPT_AUTHORING_SPEC.md` exists with all 6 required sections.
- [ ] Spec resolves art style (graphic-novel only) and states the discarded NIM path.
- [ ] Spec includes the static-extraction map + the no-physical-description fallback.
- [ ] Spec includes the AI-pass contract + adopts the gotchas checklist as the gate.
- [ ] Gold example `carlos_lopez.prompt.md` passes `node scripts/content-audit.mjs`
      (no new errors) and passes the gotchas checklist.
- [ ] Gotchas *Related Documentation* links the new spec.

## Verification

```bash
node scripts/content-audit.mjs
grep -rl 'docs/lore/figures/' content/characters/carlos_lopez/ || echo "clean"
```

> Note: `node scripts/content-audit.mjs` is a **presence gate** (checks
> YAML/`.md`/`.prompt.md` exist). It does not validate `source:` paths or
> `## Expression Variants` coverage — use the greps in the Master doc §7 for
> those (see Master §5 rule #4 caveat).

- `docs/lore/guides/character_prompt_audit.json` (biometric fallback for
  characters with zero physical description)
- `docs/lore/guides/templates/templates.md` (Prompt Templates section, QC checklists)
- `content/characters/carlos_lopez/carlos_lopez.prompt.md` + `char_carlos_lopez.yaml`
  + `carlos_lopez.md` (the gold-example subject)
