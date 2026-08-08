# M3 — Mid-Tier Upgrades (127 Tier-2 characters)

**Milestone file:** `1786049707544-m3-mid-tier-upgrades.md`
**Depends on:** M1 — MUST be done first. Run after (or parallel with) M2.
**Deliverable:** every remaining character `.prompt.md` (non-stub, lacking
`## Expression Variants`) upgraded to Tier-1.
**Status:** ❌ **NOT met** (re-audited 2026-08-07). The remaining work is
re-tracked as **carryover in M6** (`…-m6-portrait-png-generation.md`), to be
addressed later. Do not treat this milestone as done.

---

## Goal

Upgrade the ~127 "mid-tier" character `.prompt.md` files: they already have
frontmatter + Draft + Prompt + Negative + Variations, but are **missing the
`## Expression Variants` section**, often have generic prose ("practical
clothing suited to their environment"), weak Negative prompts, and stale
`source:` paths. Bring them all to the Adeyemi/Aisha standard.

## Scope — detect (excludes stubs done in M2, plus the 2 gold refs)

```bash
cd /home/anthony/code/las_flores_city
# All char prompts lacking the Expression Variants section:
grep -L '^## Expression Variants' content/characters/*/*.prompt.md \
  | sed 's|.*/characters/||; s|/.*||' | sort
# Then EXCLUDE the 65 stubs (M2) and adeyemi_ogunbiyi, aisha_al_sayed.
```

Process **alphabetically**; live grep output + M2's completed set is the
authoritative scope (target ≈ 127).

## Per-character steps

1. Read `<slug>.md` (lore first) + `char_<slug>.yaml`.
2. Apply the **static-extraction map** (M1 spec); fix any generic/anatomy-lacking
   prose using the VST contrast axes + `character_prompt_audit.json` collision ref.
3. Bring the file to the **canonical template** (M1): overwrite `## Prompt` with
   a refined, grounded graphic-novel version where the existing is generic;
   tune `## Negative Prompt` (add ethnicity exclusions, keep <200 chars);
   **add the full `## Expression Variants` section** (default + chosen tags).
4. Fix `source:` → `content/characters/<slug>/<slug>.md` if it points at
   `docs/lore/figures/`.
5. Pass the **quality gate** (gotchas Pre-Flight Checklist).

## Acceptance criteria (M3) — re-audited 2026-08-07

**NOT met.** Verified live counts (main portrait prompts = `.prompt.md` excluding
`character-sheet`/`biometric` variant files):

- [ ] ❌ `## Expression Variants` coverage: **113 of 195** main prompts have it
      (target: all 195). **82 main prompts still missing the section** (+2
      `character-sheet`/`biometric` variant files = 84 files via the audit grep).
      ```bash
      find content/characters -maxdepth 2 -name '*.prompt.md' | \
        grep -v 'character-sheet\|biometric' | \
        xargs grep -L '^## Expression Variants' | wc -l   # → 82
      ```
- [ ] ❌ No `source:` points to `docs/lore/figures/`: **70 prompts still do**
      (69 main + 1 variant). Target 0.
      ```bash
      grep -rl 'docs/lore/figures/' content/characters --include='*.prompt.md' | wc -l  # → 70
      ```
- [ ] ⚠️ `node scripts/content-audit.mjs` passes (exits 0) — but it is a
      **presence-only gate** (checks YAML/`.md`/`.prompt.md` exist). It does NOT
      validate `source:` content or Expression-Variants coverage, so a passing
      audit does NOT mean M3 is done. The greps above are authoritative.
- [ ] Grounded (non-generic) `## Prompt` and ethnicity-tuned `## Negative Prompt`
      in every file — not re-verified in this pass; part of the M6 carryover gate.

## Carryover → tracked in M6

The pending M3 work is re-tracked (not re-numbered) in
`docs/milestones/1786049707544-m6-portrait-png-generation.md` under its
**Part A — M3 text carryover** section, marked "belongs to M3/Master, re-tracked
here, address later."

## Verification (after each batch; commit per batch)

```bash
find content/characters -maxdepth 2 -name '*.prompt.md' | grep -v 'character-sheet\|biometric' \
  | xargs grep -L '^## Expression Variants' | wc -l   # → 82 today, target 0
grep -rl 'docs/lore/figures/' content/characters --include='*.prompt.md' | wc -l  # → 70 today, target 0
node scripts/content-audit.mjs                        # presence gate only — see Master §5 rule #4
```

## Do NOT

- Do not touch `adeyemi` / `aisha` gold references (they already pass).
- Do not edit YAML, generate PNGs, or alter dialogue/scene files.
- Do not batch past a point where quality drops — stop and report a blocker.
