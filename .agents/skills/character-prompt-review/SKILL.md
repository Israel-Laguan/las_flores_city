---
name: character-prompt-review
description: "Review a character's *.prompt.md file against the character prompt quality checklist: metadata, prompt structure, variations, expression variants, dialogue coverage, and quality metrics. Produces a filled-out review and actionable items."
---

# Character Prompt Quality Review

Workflow for auditing a single character's `*.prompt.md` file in the Las Flores 2077 `content/` folder. The agent acts as a rigorous Art Director / Content Editor, inspecting the character folder against a fixed checklist and reporting gaps with concrete action items.

## When to use

- A user asks to "review a character prompt", "audit character art prompts", or "run the character prompt quality review".
- You need to verify a `.prompt.md` file is complete and consistent before asset generation or DB migration.
- You want a structured per-character report covering metadata, prompt structure, variations, expressions, and dialogue coverage.

## Inputs

The user should provide a character slug (e.g., `layla`), or a full folder path like `content/characters/layla/`. If neither is given, ask for the character slug before proceeding.

## Core Principles

- The `content/characters/<slug>/<slug>.prompt.md` file is the artifact under review. YAML lives in `content/characters/<slug>/<slug>.yaml`; assets live in `content/characters/<slug>/assets/`.
- Reviews are non-destructive: report and list action items, do NOT modify files unless the user explicitly asks to fix them.
- Reference the actual files on disk. Do not guess field names — read the YAML frontmatter and `prompt.md` end-to-end before marking an item complete or missing.
- Follow the established asset expression vocabulary and `portrait_urls[]` / `background_urls[]` `expression` tag convention (see AGENTS.md and docs/ASSET_EXPRESSION_VOCABULARY.md).

---

## Steps

### Phase 1: Locate the character

1. Resolve the slug to a folder under `content/characters/<slug>/`.
2. Confirm these files exist (read them):
   - `<slug>.yaml` (metadata source of truth)
   - `<slug>.prompt.md` (the review target)
   - `assets/` directory (list its contents)
3. If the folder or files are missing, stop and report the path problem rather than inventing a review.

### Phase 2: Metadata Checklist

4. Verify `<slug>.prompt.md` frontmatter is complete: `name`, `type`, `size`, `source`, `target`, `consumer`.
5. Verify the `target` field references a real YAML field, e.g. `portrait_urls[].url`.
6. Cross-check `name` against `<slug>.yaml` so they are consistent.

### Phase 3: Narrative Critique (Writer's Lens)

Read the character's lore file at `content/characters/<slug>/<slug>.md` (and any narrative referenced from the YAML) end-to-end, then produce a writer's critique using the structure below. This is a prose section, not a checkbox pass — assess the writing and design, not file completeness. Adopt the persona of a literary writer / narrative designer for the Las Flores 2077 cyberpunk-solarpunk VN.

7. **Critique the Current Backstory** — be rigorous:
   - **Strengths**: What is already working? Vivid, specific, or emotionally resonant material.
   - **Weaknesses & Opportunities**: Where it is too generic, too perfect, or disconnected from the world. Look for: missing flaws or internal contradictions; vague antagonists or "corpo evil" threats lacking logistical grounding; disconnects from existing Las Flores factions (Van Der Meer Mining, Chinese-backed politicians, cartels, etc.); tone mismatches with the city's cynicism and moral complexity.
   - Give a short verdict (strong / workable / weak) with 2-4 concrete revision suggestions.

8. **Player Interaction Dynamics** — think from the player's perspective inside the VN:
   - **The Meet**: How/where the player most naturally encounters the character; what the character is doing that reveals personality immediately.
   - **The Dynamic**: Role in the player's journey (moral compass, rival, mentor, informant, love interest, foil).
   - **The Gameplay Loop**: Quests / decision points this character generates; what the player must *do* or *sacrifice* to advance the relationship.
   - **The Subversion**: What player expectation this character defies; what makes them surprising or uncomfortable.
   - Verify scene placement against `content/scenes/*.yaml` (not double-booked; scenes exist) and tie dynamics to tracked flags (e.g., `trust_level`, `romanced_status`).

9. **Possible Relationship Endings** — draft at least FIVE distinct endings based on player choices. For each specify: the name + emotional register (e.g., "Lover — The Mended Bond", "Enemy — The Radicalization"); how to reach it (choices/flags); and a final-scene beat (1-2 sentences, the emotional image that closes the ending). Cover the spectrum: 💖 Lover, 🤝 Friend, 💔 Ex / Tragic, 🔥 Enemy / Antagonist, 🌫️ Distant / Forgotten.

10. **Apply these craft tips** when writing the critique (they sharpen the analysis):
    - Tie any threat to something *logistical*, not abstract. "A corporation wants their land" is weak; "a corporation needs their coastline to build a lithium export mega-port" is specific and grounded.
    - Give the character one flaw that makes them *difficult to love*, not just sympathetic (single-mindedness, manipulation, cowardice, pride).
    - The best VN characters *subvert the player's expectation of their role* (a love-interest who treats the player as a tool; an antagonist with a heartbreaking justification).
    - The betrayal path should feel *earned*, not sudden — plant the seed in a separate scene so the player sits with the decision.
    - The Lover ending should require the player to *fix something*, not just be kind; the character's core flaw should be directly confronted and partially healed.

11. **Do not write or modify any files** after the analysis — wait for the user's feedback before editing lore or YAML.

### Phase 4: Prompt Structure Checklist

10. **Base Prompts** — confirm the prompt.md contains:
   - A draft prompt (initial generation)
   - A final prompt (refined version)
   - A negative prompt using `--no` formatting
   - The mandated art style string: `Premium contemporary graphic novel realism, refined editorial line art illustration`
   - Technical specs: `waist-up portrait`, `8k`, `clean confident linework`, `painterly soft shading`, `muted natural palette`
   - Avoided negatives: no photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality
   - Ethnicity-specific negatives where applicable (e.g., `no East Asian features` for Layla)
8. **Variations Section** — confirm a `## Variations` heading exists with at least 4-6 contextual variants for main characters:
   - University/Work setting
   - Home/Private setting
   - Performance/Role-specific setting
   - Emotional/Private moment
   - CG/Group scenes (where relevant)
   Each variant must specify context, setting/backdrop, clothing adjustments, emotional state, a reference to the base portrait, and an art-style consistency note.
 9. **Expression Variants Section** — confirm a `## Expression Variants` heading exists and covers:
    - `__default.png` (required)
    - `__happy.png`, `__vulnerable.png`, `__tender.png`, `__afraid.png`, `__determined.png`, `__sad.png`, `__shocked.png`, `__angry.png`, `__calculating.png`, `__surprised.png`
    Each expression must describe facial features (eyes, mouth, brows), body language, emotional context, clothing consistency, and an art-style consistency note.
 10. Correlate required expressions against actual `assets/` files: list which `__<expression>.png` files exist and which are missing.
 11. The `assets/` folder is a flat staging area that may contain ANY image filename — including drafts, alternate takes, and non-default-named files. Do NOT flag or recommend deleting images simply because their names differ from the `__<expression>.png` convention. Only report which convention-named expressions are present/missing; treat other files as allowed, valid assets.

### Phase 5: Dialogue Coverage Check

12. Search `content/dialogues/` for files referencing this character.
13. Confirm every emotion used in dialogue is represented by a corresponding expression variant.
14. Enumerate missing expressions explicitly.

### Phase 6: Quality Metrics

15. Score each criterion 1-5 (⬜ placeholder for 1-5) with short notes:
    - Prompt clarity
    - Art style consistency
    - Emotional range coverage
    - Contextual variation
    - Dialogue alignment
    - Negative prompt completeness

### Phase 7: Report & Action Items

16. Produce the filled-out review document (see template below), preserving the user's original checklist structure with each box marked `[x]` (complete) or `[ ]` (missing) and notes inline.
17. Append a concrete **Action Items** list: add missing contextual variants, update YAML with `portrait_urls[]` entries, create scene backgrounds. NOTE: Do NOT recommend cleaning up or deleting images in the `assets/` folder solely for having non-default names — any filename is allowed there. For generating missing expression/variant art, do NOT hand-generate images; instead point the user to the existing pipeline: `node scripts/asset-pipeline/scripts/generate-pollinations-drafts.mjs --filter expression,portrait,outfit-pose` (run from repo root; it reads each character's `.prompt.md` and writes drafts into the character's `assets/` folder).
18. End with the character path: `content/characters/<slug>/`.

---

## Review Output Template

Produce the review in this shape (mark each item and add notes):

```
---
name: <CHARACTER NAME>
type: review
size: N/A
source: REVIEW TEMPLATE
target: N/A
consumer: content_audit
---

# Character Prompt Quality Review — <slug>

## Metadata Checklist
- [x/ ] File exists at content/characters/<slug>/<slug>.prompt.md
- [x/ ] Frontmatter complete
- [x/ ] Target field references correct YAML field

## Narrative Critique (Writer's Lens)
### 1. Backstory Critique
<verdict: strong / workable / weak>
- Strengths: <vivid/specific/resonant material>
- Weaknesses & Opportunities: <missing flaws/contradictions, vague antagonists, faction disconnects (Van Der Meer Mining, Chinese-backed politicians, cartels), tone mismatches>
- Revision suggestions: <2-4 concrete>

### 2. Player Interaction Dynamics
- The Meet: <encounter + immediate personality reveal>
- The Dynamic: <role: moral compass/rival/mentor/informant/love interest/foil>
- The Gameplay Loop: <quests/decisions + what player sacrifices>
- The Subversion: <defied expectation, what makes them uncomfortable>

### 3. Possible Relationship Endings (≥5)
- 💖 Lover — <name>: <how to reach + final-scene beat>
- 🤝 Friend — <name>: <...>
- 💔 Ex / Tragic — <name>: <...>
- 🔥 Enemy / Antagonist — <name>: <...>
- 🌫️ Distant / Forgotten — <name>: <...>

### Craft Notes Applied
<logistical threat, flaw-that's-hard-to-love, role subversion, earned betrayal seed, lover-ending-requires-fixing-something>

## Prompt Structure Checklist
### Base Prompts
- [x/ ] Draft prompt
- [x/ ] Final prompt
- [x/ ] Negative prompt (--no)
- [x/ ] Art style consistent
- [x/ ] Technical specs
- [x/ ] Avoids negatives
- [x/ ] Ethnicity-specific negatives (if applicable)

### Variations Section
- [x/ ] Section exists
- [x/ ] Contextual variants (list which are present/missing)

### Expression Variants Section
- [x/ ] Section exists
- [x/ ] Expressions present: default, happy, vulnerable, tender, afraid, determined, sad, shocked, angry, calculating, surprised
- [x/ ] Each expression detailed

## Dialogue Coverage Check
- [x/ ] Has dialogue files
- [x/ ] Expressions covered
- [x/ ] Missing expressions: <list or "none">

## Quality Metrics
| Criterion | Score (1-5) | Notes |
|-----------|-------------|-------|
| Prompt clarity | <n> | |
| Art style consistency | <n> | |
| Emotional range coverage | <n> | |
| Contextual variation | <n> | |
| Dialogue alignment | <n> | |
| Negative prompt completeness | <n> | |

## Action Items
- [ ] <specific missing items, e.g. add missing contextual variants, update YAML portrait_urls[]>
- NOTE: Do NOT clean up or delete images in the `assets/` folder solely for having non-default names — any filename is allowed there.
- NOTE: For missing expression/variant art, do NOT hand-generate images. Use the existing pipeline: `node scripts/asset-pipeline/scripts/generate-pollinations-drafts.mjs --filter expression,portrait,outfit-pose` (run from repo root; writes drafts into the character's `assets/`).

## Character Path
path: content/characters/<slug>/
```

## M48 Posture → Expression Coverage

When reviewing a character with relationship arcs, check that the character's expression
vocabulary covers the eight postures (`WARM`, `CURIOUS`, `GUARDED`, `VOLATILE_ROMANCE`,
`DISTANT`, `CONFRONTATIONAL`, `RECONCILIATORY`, `BROKEN` — see
`shared/src/relationshipPostures.ts`) **without per-axis duplication**: one expression tag may
serve several postures (e.g. `tender` covers WARM and RECONCILIATORY; `guarded`/`calculating`
cover GUARDED and DISTANT). Flag postures with NO covering expression as gaps; do not require a
1:1 posture-to-expression mapping.

## Notes

- Keep the report faithful to the on-disk state; never mark an item complete without reading the file.
- If the user asks to remediate, switch into edit mode only after presenting the review and getting approval.
