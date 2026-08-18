# M35 — Content Completeness & Lore Consistency

**Milestone file:** `M35-content-completeness.md`
**Depends on:** none.
**Source plans:** `.mimocode/plans/1784726774082-happy-mountain.md` (M3 manual unify),
`.mimocode/plans/1784717646603-jolly-star.md` (M3.1 unify-content.mjs),
`.mimocode/plans/1784826468738-clever-island.md` (expand FILL_TARGETS),
`.mimocode/plans/1784807610858-mighty-falcon.md`, `1784808791927-glowing-star.md`,
`1784810720835-shiny-lagoon.md`, `1784813397478-proud-lagoon.md`, `1784823946657-gentle-planet.md`
(duplicate marges)
**Status:** executable. The dedup merges all succeeded; the content-completeness tail did not.
**Notes:** `scripts/unify-content.mjs` (M3.1) was superseded by the manual unification and will not
be written.

---

## Goal

Close the content-completeness and audit-blind-spot gaps left by the M3 / dedup work, and finish
the one unfinished `FILL_TARGETS` change. Distinguish genuine missing files from benign layout
drift (locations moved to `content/districts/*/locations/`).

## Current state (verified 2026-08-09 via `npm run content:audit` + glob)

`content-audit` exit 0, "No errors", but it masks files because `missions` and `story_beats`
use `expectMd: false` (`scripts/content-audit.mjs:27,29`) and because non-prefixed YAML is
treated as "no YAML" (`:91,104,121`).

**Genuine gaps (not flagged by the audit):**
1. `content/missions/great_lithium_leak/great_lithium_leak.md` — **MISSING** (only `.prompt.md`,
   `mission_*.yaml`, `assets/`). `missions` `expectMd:false` hides this.
2. **5 story-beat folders** (`content/story_beats/beat_sofia_*`) — each has only `assets/` +
   YAML, **no `.md` and no `.prompt.md`**. `story_beats expectMd:false` hides this.
   => 10 missing files total (5 `.md` + 5 `.prompt.md`).
3. **5 dialogue folders** have no `assets/` (`content-audit` warnings):
   `adeyemi_relationship`, `ana_villanueva_relationship`, `criticism_from_peers`,
   `layla_relationship`, `superhero_talk_between_classes`. (Related to M29 expression coverage.)
4. `stories/real_heroism_in_latam` has no `assets/` (warning only).

**FILL_TARGETS (clever-island):**
5. Change 1 (expand `FILL_TARGETS`) — **DONE**: `ContentFillService.ts:6-27` matches the plan
   byte-for-byte (faction/age/gender/occupation/mannerisms + `metadata.location` + location
   `conclusion`).
6. Change 2 — **MISSING**: `buildFillFieldsPrompt` in `LLMPrompts.ts:305-353` has **no per-type
   instruction map** (no `character:` key, no faction allow-list). Grep `Write a compelling
   character description` → 0 hits. So the 17 newly-auto-filled character fields are prompted with
   only generic rules; `metadata.faction` fills are unconstrained.

**Dedup merges — all verified DONE** (no work): `adeyemi_ogunbiyi` (merged, slug differs from the
plan's `chief_inspector_adeyemi` — accepted), `maria_hernandez`, `wei_zhang`, `sofia_garcia`
(one stale display-name ref at `sofia_rodriguez_krol/sofia_rodriguez_krol.md:87` —
"**Sofi Garcia**" not renamed to "Sofia Garcia"), `xiu_li_van_der_meer` (Xiu Mei fully eliminated;
cosmetic nit: `xiu_li_van_der_meer.md:9` says "Brother" vs "Half-brother" at `:59`). Carlos ×3
retained by design.

**Audit blind spots to fix (masks items 1–3 above):**
7. `content-audit.mjs` treats `*.yaml` not matching `<prefix><slug>.yaml` as `hasYaml=false`
   (`:91,104`) → folders skipped. Affected: `content/scenes/welcome_center/welcome_center.yaml`,
   `content/scenes/the_apartment/the_apartment.yaml`, `content/dialogues/{layla,adeyemi,
   ana_villanueva}_relationship/dialogue_*.yaml` (2 of 5 dialogue dirs have a prefixed YAML; the
   other 3 have none → those 3 are the missing-assets warnings).

## Steps

### 1. Author the missing mission + story-beat files
- Write `content/missions/great_lithium_leak/great_lithium_leak.md` (mission lore blurb).
- Write `.md` + `.prompt.md` for all 5 `content/story_beats/beat_sofia_*/` folders, following the
  shape of an existing beat (e.g. read a filled beat elsewhere for the template). Coordinate with
  M6 (PNG generation) — `.prompt.md` here is text only.

### 2. Add dialogue `assets/` dirs
- `mkdir` `assets/` under the 5 dialogue folders lacking one (and `stories/real_heroism_in_latam`).

### 3. Tighten `content-audit.mjs`
- Flip `missions` / `story_beats` `expectMd` to **true** (`:27,29`) so items 1–2 surface.
- Detect *any* `*.yaml` (not just `<prefix><slug>`) as `hasYaml` (`:91,104`) so folders like
  `welcome_center` / `the_apartment` / the dialogue folders are not silently skipped.

### 4. Finish `FILL_TARGETS` guidance
- Add a `character:` branch to the per-type prompt in `buildFillFieldsPrompt`
  (`LLMPrompts.ts:305-353`) enumerating the faction allow-list and field intent, mirroring the
  plan's proposed block.

### 5. Lore nits
- `sofia_rodriguez_krol.md:87`: "Sofi Garcia" → "Sofia Garcia".
- `xiu_li_van_der_meer.md:9`: "Brother" → "Half-brother".

## Acceptance criteria

- [ ] `great_lithium_leak.md` exists; all 5 beat folders have `.md` + `.prompt.md`.
- [ ] All 5 dialogue folders + the story have `assets/`.
- [ ] `npm run content:audit` reports the missions/story_beats as present (no silent skip).
- [ ] `buildFillFieldsPrompt` has a `character:` instruction with faction vocab.
- [ ] Two lore nits fixed.

## Verification

```bash
npm run content:audit     # after tightening, expect missions/story_beats counted
ls content/missions/great_lithium_leak/great_lithium_leak.md
ls content/story_beats/beat_sofia_intro/   # expect .md + .prompt.md
grep -n "Write a compelling character" server/src/services/LLMPrompts.ts
```
