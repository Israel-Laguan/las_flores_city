# M4: Asset Generation Pipeline

> Status: **Pending** | Effort: 2-3 hours | Risk: Low

## Goal

Update asset generation scripts to work with the current `content/<type>/<slug>/` layout instead of stale `docs/lore/` paths.

## Tasks

### M4.1 — Update `generate-drafts.sh` PROMPT_ROOTS

**Problem**: `generate-drafts.sh` scans 4 prompt roots but misses `content/overlays`, `content/missions`, `content/stories`.

**Action**: Add missing roots to the `PROMPT_ROOTS` array in `scripts/asset-pipeline/scripts/generate-drafts.sh:9-14`:
```bash
PROMPT_ROOTS=(
  "$ROOT/content/characters"
  "$ROOT/content/locations"
  "$ROOT/content/scenes"
  "$ROOT/content/overlays"
  "$ROOT/content/missions"
  "$ROOT/content/stories"
  "$ROOT/content/lore/shared"
)
```

**Files**:
- `scripts/asset-pipeline/scripts/generate-drafts.sh`

**Verification**:
```bash
bash scripts/asset-pipeline/scripts/generate-drafts.sh init
# Should now find prompt files from overlays/missions/stories
```

---

### M4.2 — Fix stale `docs/lore/` paths in unified/pollinations generators

**Problem**: `generate-drafts-unified.mjs` (lines 23-37) and `generate-pollinations-drafts.mjs` (lines 26-42) still scan stale `docs/lore/` paths instead of the current `content/<type>/<slug>/` layout.

**Action**: Update both scripts to scan `content/<type>/<slug>/` directories. The scan should:
1. Walk `content/{characters,scenes,locations,overlays,missions,stories}/*/`
2. Find `*.prompt.md` files in each folder
3. Drop all `docs/lore/` references

**Files**:
- `scripts/asset-pipeline/scripts/generate-drafts-unified.mjs`
- `scripts/asset-pipeline/scripts/generate-pollinations-drafts.mjs`

**Verification**:
```bash
node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --dry-run
# Prompts should only be found under content/
```

---

### M4.3 — Fix orphaned prompt check in `verify-assets.mjs`

**Problem**: `verify-assets.mjs` line 274 still scans `docs/lore` for orphaned prompts, producing false warnings.

**Action**: Update the orphaned prompt scan to use `content/` roots instead of `docs/lore`.

**Files**:
- `scripts/asset-pipeline/scripts/verify-assets.mjs`

**Verification**:
```bash
node scripts/asset-pipeline/scripts/verify-assets.mjs
# No false "orphaned prompt" warnings
```

## Execution Order

M4.1 → M4.2 → M4.3 (shell wrapper first, then JS generators, then verification)

## Done When

- [ ] `generate-drafts.sh` scans all 6 content types + lore/shared
- [ ] `generate-drafts-unified.mjs` uses `content/` paths, not `docs/lore/`
- [ ] `generate-pollinations-drafts.mjs` uses `content/` paths, not `docs/lore/`
- [ ] `verify-assets.mjs` checks `content/` for orphaned prompts
- [ ] All scripts produce correct output with `--dry-run`
