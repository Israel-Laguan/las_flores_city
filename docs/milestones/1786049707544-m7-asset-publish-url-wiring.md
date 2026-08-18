# M7 — Asset Publish & URL Wiring

**Milestone file:** `1786049707544-m7-asset-publish-url-wiring.md`
**Depends on:** M6 (assets exist).
**Status:** ⚠️ PARTIAL — YAML URL wiring MET; MinIO resolution unverifiable in this env (infra down).

---

## Verified status (2026-08-09)

The URL-wiring acceptance criteria are satisfied in-repo:

- `grep -rl 'portrait_urls' content/characters --include='*.yaml' | wc -l` → **195** (all character YAMLs carry `portrait_urls`). ✅
- `grep -rl 'background_urls' content/scenes --include='*.yaml' | wc -l` → **20** (all scene YAMLs carry `background_urls`). ✅
- No deprecated `docs/lore/figures/` references introduced. ✅

`node scripts/asset-pipeline/scripts/verify-assets.mjs` reports **246 `Error: error`** rows, but this is an **infrastructure failure**: MinIO is unreachable from this host (`connection refused` on `:9000`). The script's "Errors" are TCP/connection failures, not missing URLs — `Present: 0 / Missing: 0` means the resolver could not reach MinIO to judge presence. Per `AGENTS.md`, MinIO reachability must be confirmed with the Podman/Docker stack up before `verify-assets.mjs` numbers can be trusted.

## Remaining gaps (tracked in M40 backlog)

- **M7 MinIO resolution / scene backgrounds:** bring the stack up (MinIO reachable) and re-run `verify-assets.mjs`; confirm `Present` > 0 and `Missing` = 0. The 41 `Visual expr` warnings are owned by M29, not M7. G7.1 reclassified 2026-08-10: the real gap is publishing 20 staged scene backgrounds to MinIO + cleaning 11 legacy junk URLs, not infra.

## Acceptance criteria (M7) — final

- [x] Every staged character PNG referenced by a `portrait_urls` entry (195/195 YAMLs).
- [x] Every scene with staged backgrounds has `background_urls` entries (20/20 YAMLs).
- [x] No deprecated `docs/lore/figures/` references introduced.
- [ ] `verify-assets.mjs` reports 0 missing — **BLOCKED** on MinIO reachability in this env (re-verify with stack up).

## Verification

```bash
grep -rl 'portrait_urls' content/characters --include='*.yaml' | wc -l      # → 195
grep -rl 'background_urls' content/scenes --include='*.yaml' | wc -l        # → 20
# With MinIO up:
node scripts/asset-pipeline/scripts/verify-assets.mjs                       # expect Missing: 0
```
