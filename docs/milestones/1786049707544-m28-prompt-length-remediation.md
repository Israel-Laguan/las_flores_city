# M28 — Prompt-Length Linter Remediation

**Milestone file:** `1786049707544-m28-prompt-length-remediation.md`
**Depends on:** M1.
**Status:** ✅ MET (verified 2026-08-16) — linter exits 0.

---

## Verified status (2026-08-16)

Run: `node scripts/asset-pipeline/scripts/check-prompt-lengths.mjs`

- `Files scanned: 398`, `Prompt variants: 446`, `Over limit (> section cap): 0`, **exit code 0**.
- `Approaching (≥700): 198` — warnings only, non-blocking (the linter exits 0 unless something is over its section cap).
- Over-limit by type: none.

### Prior state (2026-08-09)

- `Over limit: 22`, exit 1 — `portrait` 21, `story-illustration` 1.

## Work completed

1. **Compressed shared style boilerplate in 22 over-limit portrait bodies.** **DONE 2026-08-16.**
   - 20 files used a verbose narrative form (`He exhibits a deeply unique, un-idealized facial anatomy with realistic eye sizes…`, `The backdrop is a weathered urban Latin American building under intense vertical tropical sunlight, creating soft volumetric depth.`, `Clean confident linework with vector-like cleanliness … zero conventional beauty templates`). Measured boilerplate accounted for **417–546 chars** per file — roughly half the prompt — so compressing boilerplate alone cleared the cap without touching physical or story descriptors.
   - These 20 were converted to the compact comma-delimited **house style already used by the passing files** (`alejandro_garcia`, `laura_silva`, `carlos_rodriguez`): subject phrase, build, facial descriptors, expression/bearing, hair, wardrobe, earbud, backdrop, then the canonical trailing style suffix. Results landed at **519–693 chars**.
   - Both the `## Prompt (Draft)` body and the duplicated `## Prompt` body were rewritten together so the two stay in sync. `alberto_santiago` and `alisha_morales` have a separately-authored richer `## Prompt` section; those were left untouched by design (draft only).
   - Two files did **not** use the verbose boilerplate and were hand-edited instead:
     - `alisha_morales` (964) — already house style; length was genuine descriptors that triple-stated the malnutrition trait. Consolidated the redundancy and trimmed the style tail, preserving every distinct physical trait and the deliberate `anatomy showing nutritional deficiency` cue. Now under cap.
     - `sofia_mendoza` (898) — a `## Prompt — Base` **named** variant, so its negative prompt counts toward the 800 cap (723 prompt + 170 negative). Trimmed redundant negative terms (`no low quality`, `no cartoon`, merged the two ethnicity exclusions) and tightened the scene text. Now under cap.
2. Decide + implement story-illustration cap policy (recommended B: exempt `story-illustration` from 800 in linter + generator). **DONE 2026-08-10** — 800 is NVIDIA NIM's hard limit for ALL NIM-bound sections; `story-illustration` Base Scene is NIM-bound and NOT exempt. Documented in `check-prompt-lengths.mjs` header. Trimmed `evidence_transport.prompt.md` Base Scene to ≤ 800. Re-run linter: `story-illustration` over-limit = 0.
3. Replace blind `substring()` truncation in `generate-drafts-unified.mjs:377-382` with sentence-boundary-aware trim. **DONE 2026-08-10** — cuts at last `. ` or `, ` before the cap, falls back to the last whitespace boundary (never mid-word), then to a hard trim only for a single oversized token.
4. Fix `DATA_INTAKE.md:137` locations path → `content/districts/*/locations/*/`. **DONE 2026-08-10** (M30 closeout) — corrected to `content/districts/*/locations/*/*.yaml`, with the `content/` tree and Path B step list fixed alongside.

## Verification

- `node scripts/asset-pipeline/scripts/check-prompt-lengths.mjs` → `Over limit: 0`, **exit 0**.
- Diff scope: **22 files changed, 42 insertions(+), 42 deletions(-)** under `content/` — 19 files at 2 lines (draft + synced `## Prompt`), 3 at 1 line (`alberto_santiago`, `alisha_morales`, `sofia_mendoza`).
- Section headers intact in all 22 files; `sofia_mendoza` header structure re-verified byte-identical to `HEAD` (`## Prompt — Base`, `## Negative Prompt`, `## Expression Variants`).
- All 21 remaining `## Prompt (Draft)` bodies re-parse with the generator's own draft regex and measure ≤ 800. `sofia_mendoza` has no draft section (named-variant path) and is covered by the linter.

## Acceptance criteria (M28)

- [x] `check-prompt-lengths.mjs` → `Over limit: 0`, exit 0.
- [x] Portrait over-limit bodies compressed under 800 (22 total: 20 boilerplate-compressed + `alisha_morales` + `sofia_mendoza`).
- [x] Story-illustration policy implemented (linter + generator aligned).
- [x] Generator no longer truncates mid-sentence.
- [x] `DATA_INTAKE.md` locations path corrected.

## Notes / follow-ups

- The 198 `Approaching (≥700)` warnings are non-blocking. A large share are drafts sitting at exactly `800/800`, which is the fingerprint of the **old** blind 800-char truncation in `generate-drafts-unified.mjs`. Those bodies were cut by the pre-fix generator and may end mid-sentence; regenerating them now would produce clean sentence-boundary trims. Tracked in the M40 backlog rather than M28, since they are within cap and do not fail the linter.
- Compression preserved descriptors but did flatten some prose into comma lists (e.g. `dark brown, sharp and watchful eyes`). This matches the established house style of the passing files and is intentional.
