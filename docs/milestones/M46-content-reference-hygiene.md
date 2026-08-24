# M46 — Content-Reference Hygiene

> **Status:** Completed · **Closed:** 2026-08-23 · **Owner:** story-engine effort
> **Source:** M42 (`verify-assets.mjs` malformed-reference detection), `scripts/asset-pipeline/scripts/verify-assets.mjs`
> **Preceded by:** M42 (asset pipeline test follow-up — closed 2026-08-23)

## Goal

The M42 validator hardening made `verify-assets.mjs` report malformed/empty asset
references as errors. A first pass over `content/` surfaced a small, bounded set of
references that the runtime cannot resolve to a published MinIO object. M46 clears
those so `verify-assets.mjs` can one day be wired into CI as a non-flaky gate
(decoupled from the unrelated MinIO-anonymous-HEAD 403 noise).

## Scope

Concrete findings from the M42 verification run:

- `content/scenes/the_apartment/the_apartment.yaml` → `ambient_sound_url: /assets/scenes/apartment/ambient.mp3`
  (relative path, not a published `s3://`/http(s) URL). Either publish the asset and
  point at `s3://las-flores/...` or drop the field if the ambient track is not produced.
- `content/scenes/welcome_center/welcome_center.yaml` → `ambient_sound_url: null`
  (literal `null` value; should be omitted rather than serialized as a string/null).
- 5 dialogue folders missing `.md` / `.prompt.md` / `assets/`:
  `dialogues/garcia_sisters`, `lin_sisters_encounter`, `lin_sisters_parents`,
  `lin_sisters_romance`, `lin_sisters_test` (plus `valentina_quan_relationship`
  orphaned `.prompt.md` with no `assets/`). Confirm these are intentionally
  unpublished stubs; if so, exclude dialogue stub folders from the audit/validator
  expectations rather than leaving dangling references.
- District location files using `background_url: <filename.png>` (relative
  shorthand) — e.g. `centro_empresarial`, `electric_vehicle_zone`,
  `colegio_chino_latino`, `centro_empresarial_chino_latino`. Decide one convention:
  either promote to `s3://las-flores/backgrounds/...` or document that
  `background_url` may be a bare filename resolved against the entity's `assets/`
  dir. The validator currently flags bare filenames as malformed; align the schema
  and validator if the shorthand is intentional.

Out of scope: the MinIO anonymous-HEAD 403 sweep (all `s3://` assets return 403
because the local dev bucket is not public). That is an environment/permission
concern, not a content defect, and must not block M46.

## Acceptance Criteria

- [x] No `Invalid asset reference` lines emitted by `verify-assets.mjs` for in-repo content (after decisions above are applied).
- [x] Dialogue stub folders either carry the expected files or are explicitly excluded from audit/validator expectations.
- [x] `background_url` convention (bare filename vs `s3://`) is resolved consistently between content, schema, and validator.
- [x] A short note records the deliberate decision to keep the MinIO 403 sweep out of CI gating.

## Decision Record

- **`ambient_sound_url`**: Removed from `the_apartment` (relative path) and
  `welcome_center` (literal null). No ambient track exists anywhere; the field is
  schema-optional and the scene upsert already defaults to NULL. Re-add only when a
  real track exists and is published as `s3://las-flores/...`.
- **`background_url` convention** — one convention: the top-level field must be a
  published URL (`s3://las-flores/backgrounds/<slug>/<slug>__default.png`). Bare
  filenames are staging references and live ONLY in `asset_paths.*`. The four
  district locations that carried a stale nested `scene:` shorthand block had it
  deleted; their existing top-level `s3://` line is canonical. No validator or
  schema relaxation — bare filenames remain flagged as malformed.
- **Dialogue stub folders** (`garcia_sisters`, `lin_sisters_*`,
  `valentina_quan_relationship`): confirmed intentionally unpublished as *image*
  entities — the folders hold complete playable dialogue trees; character visuals
  come from the character entities. Consequence: `content-audit.mjs` now treats
  dialogues as `expectMd: false` (.md/.prompt.md optional), and `verify-assets.mjs`
  skips dialogue folders in the orphaned-prompt sweep. The authored
  `valentina_quan_relationship.prompt.md` is kept for future image generation.
- **MinIO 403 sweep stays out of CI gating (deliberate):** every `s3://` HEAD check
  returns 403 against the non-public local dev bucket, so gating CI on the script's
  exit code would produce permanent false failures unrelated to content quality.
  CI may gate only on the zero-`Invalid asset reference` property (and, once a
  public bucket or signed-HEAD path exists, revisit full URL presence gating).

## Verification

```bash
node scripts/asset-pipeline/scripts/verify-assets.mjs
# Expect: zero "Invalid asset reference" lines for committed content.
npm run content:audit
npm run validate:content
```
