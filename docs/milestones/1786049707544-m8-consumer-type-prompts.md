# M8 — Remaining Consumer-Type Prompts (overlays / missions; verify scenes)

**Milestone file:** `1786049707544-m8-consumer-type-prompts.md`
**Depends on:** M1 (`…-m1-template-and-strategy.md`). Independent of M2/M3/M6/M7.
**Deliverable:** a `.prompt.md` for every remaining overlay + mission folder so
the asset pipeline has prompts to generate against.
**Status:** deferred — track this milestone; execute later.

---

## Goal

Close the prompt gaps for the non-character consumer types so M6 (PNG
generation) and M7 (publish) have prompts to drive them.

## Scope

### 1. Overlays

- Live state: only `content/overlays/great_lithium_leak/` has a `.prompt.md`.
- Action: author a `.prompt.md` for each remaining overlay folder (mystery /
  dialogue overlays), using the M1 canonical template shape.

### 2. Missions

- Live state: `content/missions/great_lithium_leak/` exists with **0** prompts.
- Action: author mission prompt(s) for it (the M5 story-illustration shape is a
  good reference).

### 3. Scenes — verify only

- 20 scenes already have `.prompt.md`. Do not author new ones unless the audit
  flags a missing file. Scene background PNG generation and `background_urls`
  wiring are tracked in the M6/M7 scope notes.

## Out of scope (correction)

- **Locations are NOT a gap.** 75 `.prompt.md` already exist under
  `content/districts/*/locations/`. Do not re-open this.
- Characters are handled by M2/M3 (with carryover in M6). Lore-story prompts
  were completed in M5.

## Acceptance criteria (M8)

- [ ] Every overlay folder has a `.prompt.md` (count = folder count).
- [ ] Every mission folder has a `.prompt.md`.
- [ ] Every scene folder retains a `.prompt.md`
      (`find content/scenes -maxdepth 2 -name '*.prompt.md' | wc -l` unchanged).
- [ ] `node scripts/content-audit.mjs` passes (no new errors).

## Verification

```bash
cd /home/anthony/code/las_flores_city
find content/overlays -maxdepth 2 -name '*.prompt.md' | wc -l      # → grows to folder count
find content/missions -maxdepth 2 -name '*.prompt.md' | wc -l      # → ≥1
find content/scenes -maxdepth 2 -name '*.prompt.md' | wc -l        # → 20 (unchanged)
node scripts/content-audit.mjs
```
