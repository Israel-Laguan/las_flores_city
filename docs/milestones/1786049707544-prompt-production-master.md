# Prompt Production — Master Plan (Las Flores 2077)

**Status:** DEFINED — executable by a separate agent chat per milestone.
**Created:** 2026-08-06 · **Branch:** main
**Companion docs:** `.kilo/plans/1786049707544-m1-template-and-strategy.md` … `-m5-*.md`

---

## 1. Goal

Bring every `.prompt.md` under `content/` up to the **Adeyemi/Aisha "graphic
novel realism"** quality standard, and close the prompt gaps for the media
platforms and lore-story reference images. Each milestone below is executed as
its own agent chat (the Runner), which reads this master doc **and** the
specific milestone doc first.

This series is **text-only** (create/upgrade `.prompt.md` files). Actual image
(`.png`) generation is **out of scope** for M1–M5 and deferred to a later asset
pass — now tracked as **M6** (PNG generation) and **M7** (publish & URL wiring).

---

## 2. Canonical art-style decision (LOCKED — do not re-litigate)

- Character portraits/expressions use **graphic novel realism only**, with the
  Adeyemi/Aisha lock string:
  `premium contemporary graphic novel realism, refined editorial line art illustration`
  Aspect ratio is recorded in frontmatter `aspect_ratio:`. **No hard character cap.**
- **`photorealistic` is INCORRECT** for character `.prompt.md` files — including
  the NVIDIA NIM FLUX.2 Klein prefix (`Photorealistic portrait, hyper-detailed...`)
  and the Visual Style Translator's photorealistic directives. Do **not** apply
  `docs/lore/PROMPT_GUIDELINES.md` (its 800-char cap, its "no graphic novel"
  rule) to character portraits.
- **RETAIN from the VST (style-agnostic, port to graphic-novel prose):**
  - the 10 biometric contrast axes (face shape, jaw, cheekbones, nose, eyes,
    brow, lips, build, skin texture, hair texture);
  - the uniqueness rule *"no two characters share face+jaw+nose+eye"*;
  - *"every character needs ≥1 asymmetric/imperfect feature"*;
  - aging rules (characters over 40 get specific visible cues);
  - the reference matrix in `docs/lore/guides/character_prompt_audit.json`
    (used to avoid duplicate anatomy).
  Sources:
  `docs/lore/guides/visual_style_translator/visual_style_translator.md`,
  `docs/lore/guides/character_prompt_audit.json`.

---

## 3. Scope snapshot (2026-08-06 audit · counts re-verified 2026-08-07)

| # | Area | Count | Ready? |
|---|------|-------|--------|
| A | Character `.prompt.md` needing `## Expression Variants` | **82 of 195 main prompts still missing** (113 have it; +2 `character-sheet`/`biometric` variant files = 84 files via the audit grep) | ❌ → carryover in M6 |
| A1 | …of which Tier-3 auto-generated stubs (M2) | 0 remaining | ✅ M2 |
| A2 | …of which Tier-2 mid-tier (M3) | 127 target — **NOT met** | ❌ → carryover in M6 |
| A3 | Deprecated `source:` → `docs/lore/figures/` | **70** prompts still reference it (69 main + 1 variant) | ❌ → carryover in M6 |
| B | Social-media platform logo prompts (linkpulse, playnetix, shenshou, vitrina, voxstream) | 5 of 5 exist | ✅ M4 |
| C | Lore-story reference-image prompts (`content/lore/stories/*/`) | 41 of 41 exist | ✅ M5 |
| D | Character PNG/asset generation (134 of 195 char folders lack `assets/`; 448 char PNGs exist) | — | **deferred** → M6 |
| E | Asset publish & URL wiring (`portrait_urls`/`background_urls` → MinIO + YAML/DB) | 0 wired via pipeline | **deferred** → M7 |
| F | Scene backgrounds | 20 `.prompt.md`; only 1 scene YAML has `background_urls` | **deferred** → M6/M7 |
| G | Overlay prompts | only `great_lithium_leak` has a prompt | **deferred** → M8 |
| H | Mission prompts | `content/missions/great_lithium_leak/` exists, 0 prompts | **deferred** → M8 |
| I | Locations | 75 `.prompt.md` under `content/districts/*/locations/` | ✅ covered (not a gap) |

---

## 4. Milestones

| Ms | File | Deliverable | Standalone chat |
|----|------|-------------|-----------------|
| M1 | `…-m1-template-and-strategy.md` | Canonical spec + template + static map + AI contract + quality gate + gold example + conflicts note | ✅ |
| M2 | `…-m2-stub-rewrites.md` | 65 Tier-3 stub rewrites to Tier-1 | ✅ |
| M3 | `…-m3-mid-tier-upgrades.md` | 127 Tier-2 upgrades (add Expression Variants) | ❌ **NOT met** — 82 main prompts + 70 deprecated `source:` paths → carryover in M6 |
| M4 | `…-m4-media-logos.md` | 5 platform logo `.prompt.md` | ✅ |
| M5 | `…-m5-lore-story-prompts.md` | 41 lore-story reference-image `.prompt.md` | ✅ |
| M6 | `…-m6-portrait-png-generation.md` | M3 text carryover (Expression Variants + source-path repair) + generate PNGs for 134 asset-less char folders | ☐ deferred (address later) |
| M7 | `…-m7-asset-publish-url-wiring.md` | Upload assets to MinIO, write `portrait_urls`/`background_urls` to YAML+DB, verify with verify-assets.mjs | ☐ deferred (address later) |
| M8 | `…-m8-consumer-type-prompts.md` | Remaining consumer-type prompts (overlays, missions; verify scenes) | ☐ deferred (address later) |

**Ordering:** M1 first (all later milestones depend on its template/spec).
M2 and M3 may run in parallel after M1. M4/M5 are independent of M2/M3 and can
run after M1. M6 depends on M1 + the M3 text carryover it re-tracks (and M2's
template compliance). M7 depends on M6 (assets must exist before they can be
published). M8 is independent and may run after M1.

---

## 5. Cross-milestone rules (apply to every milestone)

1. **Read the lore first.** Before writing any prompt, read the entity's `.md`
   (and YAML) end-to-end. Never prompt from the YAML description alone.
2. **Quality gate = `docs/CHARACTER_PROMPT_GOTCHAS.md` Pre-Flight Checklist.**
   Every produced/upgraded prompt must pass it. Reject-and-fix if any item
   fails: ethnicity match, no character name in Draft/Prompt, `__default.png`
   described as base, real (usable) expression prompts, `source:` path =
   `content/characters/<slug>/<slug>.md` (**not** deprecated
   `docs/lore/figures/...`), negative prompt <200 chars where applicable.
3. **Every prompt follows the M1 canonical template** (structure below).
4. **Source-path repair:** any prompt whose `source:` frontmatter points at
   `docs/lore/figures/` must be rewritten to `content/characters/<slug>/<slug>.md`.
   > **Gate caveat (2026-08-07):** `node scripts/content-audit.mjs` only checks
   > file **presence** (YAML / `.md` / `.prompt.md` exist). It does NOT validate
   > `source:` content, `## Expression Variants` coverage, or Negative-prompt
   > length — it exits 0 even with 70 deprecated source paths present. The
   > **greps in §7 are the authoritative gates** for the source-path rule and
   > M3's Expression-Variants acceptance; never treat a passing audit as proof
   > a milestone is done.
5. **No PNG generation / no DB changes / no server rebuild** in the **M1–M5**
   series. M6 (PNG generation) and M7 (MinIO publish + YAML/DB URL wiring)
   intentionally lift this for assets only; no game-behavior code changes.
6. **Do NOT touch the already-correct references** `adeyemi_ogunbiyi` and
   `aisha_al_sayed` (they are the gold references).
7. **Batching:** process in alphabetical order within a milestone; commit per
   batch so progress is reviewable.

---

## 6. Canonical template structure (M1 will finalize exact prose)

```markdown
---
name: <Full Name>
type: portrait
size: 1024x1024
source: content/characters/<slug>/<slug>.md
target: `asset_paths.portrait` in `content/characters/<slug>/char_<slug>.yaml`
consumer: portrait
---

# Prompt: <Full Name>

[CONSUMER: portrait]
**Type / Source / Target field / Tool**

## Prompt (Draft)          ← concise, comma-separated, no character name
## Prompt                  ← refined final, graphic-novel realism, grounded anatomy
## Negative Prompt         ← --no ... ; ethnicity exclusions; <200 chars
## Variations              ← [ ] scene-variation checklist
## Expression Variants     ← one block per __<expr>.png, "Use the base portrait
                             as reference… keep the same art style…"
```

---

## 7. Verification (run after each milestone)

```bash
cd /home/anthony/code/las_flores_city
# M2: no stubs remain ✅
grep -rl 'Auto-generated from character YAML' content/characters/ | wc -l   # → 0
# M3 (carryover → M6): Expression Variants coverage — live 113 of 195 main prompts
find content/characters -maxdepth 2 -name '*.prompt.md' | grep -v 'character-sheet\|biometric' \
  | xargs grep -l '^## Expression Variants' | wc -l                        # → 113 today, target 195
# M3 (carryover → M6): no deprecated source paths remain
grep -rl 'docs/lore/figures/' content/characters --include='*.prompt.md' | wc -l  # → 70 today, target 0
# Content audit parses — PRESENCE GATE ONLY (see §5 rule #4 caveat)
node scripts/content-audit.mjs
# M6: every character folder has assets/
find content/characters -maxdepth 2 -type d -name assets | wc -l           # → 61 today, target 195
# M7: every referenced asset resolves in MinIO (0 missing)
node scripts/asset-pipeline/scripts/verify-assets.mjs
```

---

## 8. Safety / rollback

- Content-only edits; `git` is the safety net. Commit per batch.
- Only run `bash scripts/backup-content-assets.sh` before a milestone that
  touches `assets/` (M4/M5 may create `assets/` dirs).
- If a prompt seems wrong, **stop that batch** and report a blocker rather than
  lowering the quality bar.
