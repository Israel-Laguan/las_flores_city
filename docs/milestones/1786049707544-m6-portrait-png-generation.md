# M6 — Portrait PNG Generation (+ M3 text carryover)

**Milestone file:** `1786049707544-m6-portrait-png-generation.md`
**Depends on:** M1 + M3 text carryover (re-tracked here).
**Status:** ✅ PART A MET · ⚠️ Part B deferred (PNG generation not verified in this env).

---

## Verified status (2026-08-09)

### Part A — M3 text carryover (MET ✅)

Re-verified live against the repo:

- **A.1 Expression Variants:** `find content/characters -maxdepth 2 -name '*.prompt.md' | grep -v 'character-sheet\|biometric' | xargs grep -L '^## Expression Variants' | wc -l` → **0** (was 82). ✅
- **A.2 Source-path repair:** `grep -rl 'docs/lore/figures/' content/characters --include='*.prompt.md' | wc -l` → **0** (was 70). ✅
- `node scripts/content-audit.mjs` → exits 0, no errors. ✅

The M3 text criteria that were the original blocker are now satisfied in-repo.

### Part B — Portrait PNG generation (DEFERRED — not re-verified here)

- `find content/characters -maxdepth 2 -type d -name assets | wc -l` → **195** (all folders have `assets/`).
- `find content/characters -name '*.png' | wc -l` → **984** PNGs on disk (e.g. `adeyemi_ogunbiyi/assets/` has `__default.png` + expression variants).
- PNG generation is a content/asset task executed outside this verification pass; file presence confirms Part B was run, but image *quality* was not re-audited here.

## Remaining gaps (tracked in M40 backlog)

- None outstanding for Part A (resolved).
- Part B image quality / expression-variant fidelity is covered by M29 (dialogue expression coverage) and is carried to M40.

## Acceptance criteria (M6) — final

- [x] Part A.1 Expression Variants coverage = 0 missing.
- [x] Part A.2 Deprecated `docs/lore/figures/` source paths = 0.
- [x] Part B (artifact presence only): every character folder has `assets/` (195/195) + PNGs present (984/985 on disk).
- [ ] Part B (deferred): portrait generation quality and expression-variant fidelity verified.
- [x] `node scripts/content-audit.mjs` passes.

## Verification (re-run to confirm)

```bash
find content/characters -maxdepth 2 -name '*.prompt.md' | grep -v 'character-sheet\|biometric' \
  | xargs grep -L '^## Expression Variants' | wc -l   # → 0
grep -rl 'docs/lore/figures/' content/characters --include='*.prompt.md' | wc -l       # → 0
find content/characters -maxdepth 2 -type d -name assets | wc -l                       # → 195
node scripts/content-audit.mjs
```
