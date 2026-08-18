# M40 — Prompt Expression Asset Carryforward (M33 residuals)

**Milestone file:** `1786377431414-m40-prompt-expression-asset-carryforward.md`
**Created:** 2026-08-10 · **Purpose:** close the bulk content gaps M33 could not
finish (NIM generation, asset publishing, verifier cleanup).
**Predecessor:** M33 (retired 2026-08-10; all non-content gaps closed).

---

## Carried gaps

| Gap ID | Source | Description | Work type |
|---|---|---|---|
| **G-M40-1** | ← G28.1 | Compress 22 portrait `## Prompt (Draft)` bodies under 800 chars (keep physical/story descriptors; drop shared style boilerplate). Includes the uncommitted `alisha_morales` regression (+164). | Bulk non-deterministic copy edit |
| **G-M40-2** | ← G29.2 | Generate 9 Wen Zhao expression PNGs via NVIDIA NIM into `content/characters/wen_zhao/assets/` (prompts already authored in `wen_zhao.prompt.md` `## Expression Variants`: vulnerable/happy/afraid/angry/tender/sad/determined/contemplative/shocked). | NIM generation + human visual review |
| **G-M40-3** | ← G7.1 | Publish 20 staged scene backgrounds to MinIO (`s3://las-flores/backgrounds/<slug>/<slug>__default.png`); clean 11 legacy junk URLs from YAML `background_urls` entries. Re-run `verify-assets.mjs` expecting `Missing: 0` for backgrounds. (`AssetPublishService` supports `background_urls` at `server/src/services/AssetPublishService.ts:280`; or extend `publish-all-portraits.ts`/`sync_local_assets.ts`). | Asset publish |
| **G-M40-4** | ← G29.4 | `verify-assets.mjs` → `Visual expr: 0` (after G-M40-2). | Verifier re-run |
| **G-M40-5** | ← G6.1 (optional) | Per-character PNG fidelity re-audit — out of scope; covered per-character by M29 for Wen Zhao. | Optional |

---

## G-M40-1 — Portrait prompt compression

- **Count:** 22 portrait `## Prompt (Draft)` bodies over 800 chars.
- **Constraint:** keep physical/story descriptors; drop shared style boilerplate
  (e.g. "cinematic lighting", "highly detailed", "DC/Marvel-quality").
- **Linter:** `node scripts/asset-pipeline/scripts/check-prompt-lengths.mjs` —
  expect `Over limit: 0` for `portrait` after edit.
- **Note:** `content/characters/alisha_morales/alisha_morales.prompt.md` is an
  *uncommitted working-tree edit* that regressed to +164 over limit. It is NOT
  part of M33's code changes; the M40 owner must include it in the 22 portraits
  and must NOT revert it.

---

## G-M40-2 — Wen Zhao expression PNGs

- **Expressions:** vulnerable, happy, afraid, angry, tender, sad, determined,
  contemplative, shocked.
- **Source prompts:** `content/characters/wen_zao/wen_zhao.prompt.md`
  `## Expression Variants`.
- **Generation:** NVIDIA NIM (`generate-drafts-unified.mjs` or direct NIM POST).
- **Publish:** `SLUG_ONLY=wen_zhao FORCE=1 node server/scripts/publish-all-portraits.ts`
  (G29.3 fix landed in M33).
- **Review:** human visual review required (non-deterministic API output).

---

## G-M40-3 — Scene background publish

- **Count:** 20 scene backgrounds staged locally, absent from MinIO.
- **Tooling options:**
  1. Extend `publish-all-portraits.ts` with background support.
  2. Use/extend `sync_local_assets.ts` if it exists.
  3. Direct `AssetPublishService` call per scene.
- **Output:** `background_urls` entries written to YAML + DB; `verify-assets.mjs`
  reports `Missing: 0` for backgrounds.
- **Cleanup:** remove 11 legacy junk URLs (`http://minio:9000/.../neutral.png`,
  `https://cdn.lasflores2077.com/...`) from scene YAML `background_urls`.

---

## G-M40-4 — Verifier re-run

- After G-M40-2: `node scripts/asset-pipeline/scripts/verify-assets.mjs`
  expect `Visual expr: 0`.
- After G-M40-3: expect `Missing: 0` for backgrounds.

---

## G-M40-5 — Optional PNG fidelity re-audit

- Out of scope for this milestone.
- Covered per-character by M29 for Wen Zhao.

---

## Acceptance criteria

- [ ] G-M40-1: `check-prompt-lengths.mjs` → `portrait` over-limit = 0.
- [ ] G-M40-2: 9 Wen Zhao expression PNGs present in `content/characters/wen_zhao/assets/` + MinIO.
- [ ] G-M40-2: `verify-assets.mjs` → `Visual expr: 0`.
- [ ] G-M40-3: 20 scene backgrounds in MinIO + `Missing: 0` for backgrounds.
- [ ] G-M40-3: 11 legacy junk URLs removed from scene YAML.

---

## Related

- M34: `1786292762037-m34-story-builder-test-coverage.md` (test coverage)
- M36: `1786292762037-m36-location-district-prompts.md` (depends on prompt-length work)
- M37: `1786292762037-m37-prompt-variant-tooling.md` (depends on prompt-length work)