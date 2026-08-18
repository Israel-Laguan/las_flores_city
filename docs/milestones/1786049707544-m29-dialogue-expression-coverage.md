# M29 — Dialogue Expression-Coverage Completion

**Milestone file:** `1786049707544-m29-dialogue-expression-coverage.md`
**Depends on:** M6, M7.
**Status:** ⚠️ PARTIAL — 41 `Visual expr` warnings remain (verified 2026-08-09).

---

## Verified status (2026-08-09)

`node scripts/asset-pipeline/scripts/verify-assets.mjs` → `Visual expr: 41 warning(s)`.
Root causes unchanged from the milestone's own analysis:

1. **`default` never matches verifier (4 warnings)** — `verify-assets.mjs` only registers tagged `expression:` entries; fix is verifier-side (implicit `default` when an untagged entry exists). Not done.
2. **Wen Zhao missing 9 expressions (37 warnings)** — `vulnerable, happy, afraid, angry, tender, sad, determined, contemplative, shocked`: no assets, no tags. Not done.
3. **Publisher skip blocks Wen publish** — `server/scripts/publish-all-portraits.ts:125` skips folders with untagged default; needs `FORCE`/`--republish` flag. Not done.

## Remaining gaps (carried to M40 backlog)

1. Verifier-side `default` fix (4 warnings). **DONE 2026-08-10** — `verify-assets.mjs` `parseCharacterExpressionMap` now tracks `hasUntaggedDefault` and adds `'default'` to the expression set.
2. Generate 9 Wen Zhao expression PNGs in `content/characters/wen_zhao/assets/`.
3. Add `FORCE=1`/`--republish` to `publish-all-portraits.ts`; publish Wen (`SLUG_ONLY=wen_zhao FORCE=1 ...`) with MinIO up. **DONE 2026-08-10** — `FORCE=1` env or `--republish` CLI arg bypasses the skip at line 125.
4. Re-verify: `Visual expr: 0`.

## Acceptance criteria (M29)

- [ ] `verify-assets.mjs` `Visual expr:` warnings = 0.
- [ ] `default` resolved via verifier-side map entry; YAML defaults stay untagged.
- [ ] 9 Wen Zhao expression PNGs on disk + tagged in `portrait_urls`.
- [ ] Publisher supports `FORCE`/`--republish`; Wen variants published.
