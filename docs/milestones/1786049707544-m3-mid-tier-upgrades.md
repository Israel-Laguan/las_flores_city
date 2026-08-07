# M3 — Mid-Tier Upgrades (127 Tier-2 characters)

**Milestone file:** `1786049707544-m3-mid-tier-upgrades.md`
**Depends on:** M1 — MUST be done first. Run after (or parallel with) M2.
**Deliverable:** every remaining character `.prompt.md` (non-stub, lacking
`## Expression Variants`) upgraded to Tier-1.
**Status:** executable. Run as its own chat; read master + M1 docs first.

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

## Acceptance criteria (M3)

- [ ] `grep -l '^## Expression Variants' content/characters/*/*.prompt.md | wc -l`
      grows to **≥ 192** (i.e. all but the 2 gold refs have it — they already do,
      so target = all 194 having the section).
- [ ] Every file has a grounded (non-generic) `## Prompt` and an ethnicity-tuned
      `## Negative Prompt`.
- [ ] No `source:` points to `docs/lore/figures/`.
- [ ] `node scripts/content-audit.mjs` passes (no new errors).

## Verification (after each batch; commit per batch)

```bash
grep -l '^## Expression Variants' content/characters/*/*.prompt.md | wc -l
grep -rl 'docs/lore/figures/' content/characters/*/*.prompt.md | wc -l
node scripts/content-audit.mjs
```

## Do NOT

- Do not touch `adeyemi` / `aisha` gold references (they already pass).
- Do not edit YAML, generate PNGs, or alter dialogue/scene files.
- Do not batch past a point where quality drops — stop and report a blocker.
