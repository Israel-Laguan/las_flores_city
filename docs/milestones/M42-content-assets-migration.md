# M42 — Asset Pipeline Test Follow-up

> **Status:** Open · **Owner:** story-engine effort

The content and asset migration work is complete. This small follow-up remains because
the generator and validator scripts do not have focused regression tests.

## Scope

- Add focused tests for `gen-scene-variant-csv.mjs` output shape and deterministic fields.
- Add focused tests for asset-validator behavior, including tagged scene variants and the
  untagged default fallback.

## Acceptance Criteria

- [ ] Generator tests cover required columns, variant naming, and safe prompt output.
- [ ] Validator tests cover valid `background_urls[].variant` entries and reject malformed
      or missing asset references.
- [ ] Tests run without changing `content/`, database state, or runtime behavior.

## Verification

```bash
npm run content:audit
npm run validate:content
node scripts/asset-pipeline/scripts/verify-assets.mjs
```
