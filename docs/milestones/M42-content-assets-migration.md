# M42 — Content Assets Migration

> **Status:** In progress — variant conversion remains (blocked on generated environment assets)  
> **Owner:** story-engine effort

## Completed (record)

- File-database contract complete and green; intake-worker `migrateContent()` verified.
- 20 scene + 75 location default backgrounds published to MinIO; 11 legacy junk
  URLs removed from scene YAML.
- Wen Zhao's 14 portrait assets (default + 13 expressions) published and
  expression-tagged in `char_wen_zhao.yaml` `portrait_urls[]`.
- 75 location YAMLs carry top-level `background_url`; all 75 location rows updated in DB.
- All verifications green: `content:audit` 0 errors/warnings, `validate:content`
  pass, prompt lengths 0 over-limit, `verify-assets.mjs` `Visual expr: 0` /
  `Missing: 0`.
- M36 and M40 closed: 74 location + 50 character generic `## Variations` bullets
  replaced with lore-specific scene variants.

## Remaining operations

1. **Scene variant generation + publication** (blocked on image generation)
   - All 20 scene prompts already carry canonical `## Expression Variants`
     environment edit-prompts (`night`/`sunset`/`day`); no retired
     `## Variants (image-to-image)` sections remain.
   - Generation queue: `scripts/asset-pipeline/output/scene_background_variants.csv`
     (45 rows; columns `path,slug,variant,base_local,base_s3,prompt,nim_safe_prompt,ratio,done`;
     regenerate with `node scripts/asset-pipeline/scripts/gen-scene-variant-csv.mjs`).
     Each row names the published default background as the image-to-image base
     (`base_s3`) and the edit prompt for the variant.
   - After generation: publish each `<slug>__<tag>.png` to
     `s3://las-flores/backgrounds/<slug>/` and wire tagged entries into scene
     YAML `background_urls[]`, then re-run `verify-assets.mjs`.

2. **Optional follow-up** (from shipped M44)
   - Focused tests for generator output and validator behavior.

## Verification

```bash
npm run content:audit
npm run validate:content
node scripts/asset-pipeline/scripts/check-prompt-lengths.mjs
node scripts/asset-pipeline/scripts/verify-assets.mjs
```

## Commands Used (reproducible)

```bash
./start-stack.sh
podman exec -e SLUG_ONLY=wen_zhao -e FORCE=1 las-flores-intake-worker \
  sh -c "cd /app/server && /app/node_modules/.bin/tsx scripts/publish-all-portraits.ts"
npx tsx server/scripts/publish-location-backgrounds.ts
```
