# M6 — Portrait PNG Generation (+ M3 text carryover)

**Milestone file:** `1786049707544-m6-portrait-png-generation.md`
**Depends on:** M1 (`…-m1-template-and-strategy.md`) + the **M3 text carryover**
re-tracked in Part A below.
**Deliverable:** (A) finish the M3 text work — Expression Variants + source-path
repair; (B) generate `__default.png` + expression-variant PNGs for every
character folder that lacks `assets/`.
**Status:** deferred — track this milestone; execute later. Read master + M1 docs
first.

---

## Goal

Pick up Master bucket D (PNG/asset generation, deferred out of the M1–M5
text-only series). Today **61 of 195** character folders have `assets/`; **134
do not** (448 character PNGs exist in the tree so far). This milestone also
re-tracks the **unfinished M3 text work** as a hard prerequisite, because the
expression-variant prompts drive the expression-variant PNGs.

## Part A — M3 text carryover (belongs to M3/Master, re-tracked here, address later)

These are NOT new work — they were M3 acceptance criteria that were never hit.
They are tracked here so the loop closes. Do them **before** Part B.

### A.1 Expression Variants — finish the missing sections

- Live state: **113 of 195** main portrait prompts have `## Expression Variants`.
- **82 main prompts still missing it** (+ 2 `character-sheet` / `biometric`
  variant prompt files, 84 files total via the audit grep).
- Enumerate live (authoritative — do not hard-code a stale list):
  ```bash
  find content/characters -maxdepth 2 -name '*.prompt.md' | \
    grep -v 'character-sheet\|biometric' | \
    xargs grep -L '^## Expression Variants'
  ```
- Target: **195 of 195** main prompts have the section, following the M1
  canonical template (`__default.png` described as base + expression blocks that
  start "Use the base portrait as reference…", include "looking at the camera,
  3/4 take", and end with "Keep the same art style as reference…").

### A.2 Source-path repair — kill the deprecated paths

- Live state: **70** character prompts still reference `docs/lore/figures/`
  (69 main + 1 variant).
- Enumerate live:
  ```bash
  grep -rl 'docs/lore/figures/' content/characters --include='*.prompt.md'
  ```
- Target: every `source:` = `content/characters/<slug>/<slug>.md`. → **0**.
- ⚠️ `node scripts/content-audit.mjs` will **not** catch these — it is a
  presence gate only. The greps above are authoritative (Master §5 rule #4).

### A.3 Gate

Part B (PNG generation) must NOT start until A.1 and A.2 are at target.
The variant prompts are the blueprint for the variant PNGs.

## Part B — Portrait PNG generation

### Scope

- Generate, per character folder, a **flat** `assets/` directory containing
  `<slug>__default.png` plus the expression variants named in the prompt's
  `## Expression Variants` section.
- Follow `docs/ASSET_EXPRESSION_VOCABULARY.md` naming and the expression tag
  convention (`<slug>__<expression>.png`). Assets/folders are flat — no
  sub-folders.
- Only the **134 folders without `assets/`** need generation; the 61 that have
  assets are verify-only (their drafts may be promoted to `<slug>__default.png`).

### Art-style lock (do not re-litigate — Master §2)

- `premium contemporary graphic novel realism, refined editorial line art illustration`
- MidJourney `--v 6 --ar 3:4 --style raw` for portraits.
- `photorealistic` is INCORRECT (including the NIM FLUX.2 Klein prefix).

### Safety

- Run `bash scripts/backup-content-assets.sh` **before** writing into any
  `assets/` dir.
- `content/**/assets/` is the **staging area**, not canonical. The publish step
  (upload → MinIO → `portrait_urls`) happens in M7.

### Do NOT

- Do not edit YAML (`portrait_urls` stays empty until M7) or DB.
- Do not touch the `adeyemi_ogunbiyi` / `aisha_al_sayed` gold references.
- Characters are the focus here; scene/overlay/mission PNGs are covered by the
  M6/M7 scope notes and M8's prompts.

## Acceptance criteria (M6)

- [ ] `find content/characters -maxdepth 2 -type d -name assets | wc -l` → **195**
- [ ] Every character folder has `assets/<slug>__default.png` (spot-check).
- [ ] Carryover A.1: `… | xargs grep -L '^## Expression Variants' | wc -l` → **0**
- [ ] Carryover A.2: `grep -rl 'docs/lore/figures/' content/characters --include='*.prompt.md' | wc -l` → **0**
- [ ] Expression PNG filenames match the prompt's expression tags
      (`<slug>__<expression>.png`) per `ASSET_EXPRESSION_VOCABULARY.md`.

## Verification

```bash
cd /home/anthony/code/las_flores_city
find content/characters -maxdepth 2 -type d -name assets | wc -l                       # → 195
find content/characters -maxdepth 2 -name '*.prompt.md' | grep -v 'character-sheet\|biometric' \
  | xargs grep -L '^## Expression Variants' | wc -l                                    # → 0
grep -rl 'docs/lore/figures/' content/characters --include='*.prompt.md' | wc -l       # → 0
node scripts/content-audit.mjs                          # presence gate only (Master §5 rule #4)
```

## Commit / batching

Process characters alphabetically; commit per batch so progress is reviewable
(Master §5 rule #7). Backup before touching `assets/`.
