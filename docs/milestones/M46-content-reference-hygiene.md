# M46 — Content-Reference Hygiene (Proposed)

> **Status:** Proposed · **Owner:** story-engine effort
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

- [ ] No `Invalid asset reference` lines emitted by `verify-assets.mjs` for in-repo content (after decisions above are applied).
- [ ] Dialogue stub folders either carry the expected files or are explicitly excluded from audit/validator expectations.
- [ ] `background_url` convention (bare filename vs `s3://`) is resolved consistently between content, schema, and validator.
- [ ] A short note records the deliberate decision to keep the MinIO 403 sweep out of CI gating.

## Verification

```bash
node scripts/asset-pipeline/scripts/verify-assets.mjs
# Expect: zero "Invalid asset reference" lines for committed content.
npm run content:audit
npm run validate:content
```
