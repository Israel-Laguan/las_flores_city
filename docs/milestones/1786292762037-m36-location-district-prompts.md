# M36 — Location & District Prompt Quality

**Milestone file:** `M36-location-district-prompts.md`
**Depends on:** `1786049707544-m1-template-and-strategy.md` (canonical PROMPT_AUTHORING_SPEC.md).
**Source plans:** `.mimocode/plans/1784740439654-crisp-wolf.md` (Batch 2 C–e chars),
`1784742607844-clever-comet.md` (Batch 3 E–j chars), `1784753901772-proud-planet.md`
(Batch 5 M–r chars), `1784749938291-diffident-jellyfish.md` + `1784755191854-crisp-wolf.md`
(Batch 7 locations), `1784733929231-hidden-garden.md` (variants system)
**Status:** partially overlaps existing prompt-production work (M2/M3 character text, M5 lore,
M4 media). This milestone owns the **non-character** location/district prompt quality, which none
of M1–M8 covers.

---

## Goal

Bring the 75 `content/districts/*/locations/*` `.prompt.md` files (and any `content/locations`
leftovers) up to the lore-grounded quality standard, and remove the ~50 character files that still
carry generic placeholder `## Variations` bullets. Character-portrait text is already tracked by
M2/M3/M6; this milestone is the location + residual-character tail.

## Current state (verified 2026-08-09)

**Character generic-prompt tail (NOT covered by the old Batches 2/3/5):**
- 197 character `.prompt.md` files. **50** still contain literal generic `## Variations` bullets:
  - 30 files with the "professional environment" / "studying at a desk" family
    (`grep -rl 'at work in their professional environment\|studying intently at a desk' content/characters` = 50, but counting distinct families: 30 + 20).
  - 20 files with the "in a business meeting, collaborating" family.
  - Evidence: `content/characters/mei_xiang/mei_xiang.prompt.md:24-26`,
    `content/characters/pieter_van_der_meer/pieter_van_der_meer.prompt.md:24-26`,
    `content/characters/jan_van_der_meer/jan_van_der_meer.prompt.md:24-26`, etc.
- These are the **same defect** the deleted Batch-2/3/5 milestone files claimed to fix — but the
  old `**Edit prompt:**` rewrite format was superseded by `## Variations` + `## Expression
  Variants`. The leftover is now generic *Variations* bullets, not missing edit prompts.

**District / location generic prompts (Batch 7 — never done):**
- 75 district location `.prompt.md` files; **73** still carry the verbatim 3-bullet generic
  `## Variations`: "Night version: same scene at night", "Rainy version: same scene with rain",
  "Wide shot: broader view of the location" (`grep -rl 'Night version: same scene at night' content/districts` = 73).
- 0 of the 75 have `**Edit prompt:**` (the hidden-garden two-stage format was never applied here).
- 0 district files have `## Expression Variants` in the character sense; locations instead need
  environment/atmosphere variants per `docs/ASSET_EXPRESSION_VOCABULARY.md` (`night`/`rain`/`sunset`).

**Existing tooling (verify before authoring):**
- `scripts/rewrite-location-prompts.mjs` hard-coded `content/locations/*` (a directory that no
  longer exists — locations are under `content/districts/*/locations/*`) and therefore no-oped on
  the current layout. It was **deleted in M38**; location prompts are now authored by hand against
  the canonical `docs/PROMPT_AUTHORING_SPEC.md` template.

## Steps

### 1. Author against the canonical template
- There is no location-rewrite script to retarget (`scripts/rewrite-location-prompts.mjs` was
  deleted in M38). Author the district location `.prompt.md` files by hand against the M1 canonical
  `docs/PROMPT_AUTHORING_SPEC.md` template.

### 2. Author 73 district location `.prompt.md` files
- For each, replace the generic 3-bullet `## Variations` with lore-specific scene variants drawn
  from the location's `*.md` (history/role in the lithium-leak story), and add environment/atmosphere
  variants (`night`, `rain`, `sunset`) consistent with `docs/ASSET_EXPRESSION_VOCABULARY.md`.
- Keep `## Prompt (Draft)` / `## Prompt` / `## Negative` sections; follow the canonical
  `docs/PROMPT_AUTHORING_SPEC.md` section order.

### 3. Fix 50 character `.prompt.md` generic bullets
- Replace generic `## Variations` bullets with lore-specific scene ideas (per the now-superseded
  but still-useful Batch-2/3/5 design: action verb + lore-grounded scene + closing directive).
- Do **not** reintroduce the old `**Edit prompt:**` two-stage format — the canonical spec is
  `## Variations` + `## Expression Variants`.

### 4. Re-run prompt-length linter
- After edits, `node scripts/asset-pipeline/scripts/check-prompt-lengths.mjs` should stay green
  (no new over-limit). Fold any length regressions into M28.

## Acceptance criteria

- [ ] 0 district location files contain the literal generic 3-bullet `## Variations`.
- [ ] 0 character files contain the generic "professional environment" / "business meeting"
      placeholder bullets.
- [ ] Location prompts carry environment variants (`night`/`rain`/`sunset`) per the expression vocab.
- [ ] `check-prompt-lengths.mjs` reports no new over-limit files.

## Verification

```bash
grep -rl 'Night version: same scene at night' content/districts | wc -l   # expect 0
grep -rl 'at work in their professional environment' content/characters | wc -l  # expect 0
node scripts/asset-pipeline/scripts/check-prompt-lengths.mjs 2>&1 | grep "Over limit"
```

## Related

- M42: `M42-content-assets-migration.md` — executes the remaining prompt-length and expression-asset work carried forward from M40.
