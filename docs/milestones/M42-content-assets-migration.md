# M42 — Content Assets Migration

> **Status:** Closed  
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

1. **Scene variant generation + publication** — ✅ COMPLETE
   - All 20 scene prompts already carry canonical `## Expression Variants`
     environment edit-prompts (`night`/`sunset`/`day`/`rain`); no retired
     `## Variants (image-to-image)` sections remain.
   - Generation queue: `scripts/asset-pipeline/output/scene_background_variants.csv`
     (46 rows; columns
     `path,slug,variant,base_local,base_s3,prompt,nim_safe_prompt,t2i_prompt,ratio,done`;
     regenerate with `node scripts/asset-pipeline/scripts/gen-scene-variant-csv.mjs`).
     Each row names the published default background as the image-to-image base
     (`base_s3`) and the edit prompt for the variant.
   - **Provider tally:** 2 NIM / 43 Akool / 0 Pollinations. NIM's guardrails
     rejected most prompts stochastically; no regeneration was attempted — the
     46 generated variants were published as-is.
   - **Format conversion:** Akool returned JPEG-content payloads; all 46 variant
     files were converted to true PNG via `sharp` before staging/upload.
   - **Publication:** `server/scripts/publish-scene-backgrounds.ts` uploaded each
     `<slug>__<variant>.png` to `s3://las-flores/backgrounds/<slug>/`, merged
     variant-tagged entries into each scene YAML's `background_urls[]` (default
     entry preserved untagged first; variants carry `variant: night|sunset|day|rain`),
     and mirrored the array into the DB `scenes.background_urls` column (the
     runtime serves the JSONB array, not the YAML). Then `verify-assets.mjs`
     reported `Missing: 0`.

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
# Publish the 46 scene background variants (MinIO + YAML + DB):
podman cp server/scripts/publish-scene-backgrounds.ts las-flores-intake-worker:/app/server/scripts/publish-scene-backgrounds.ts
podman cp scripts/asset-pipeline/output/scene_background_variants.csv las-flores-intake-worker:/tmp/scene_background_variants.csv
podman exec -e SCENE_VARIANT_CSV=/tmp/scene_background_variants.csv las-flores-intake-worker \
  sh -c "cd /app/server && /app/node_modules/.bin/tsx scripts/publish-scene-backgrounds.ts"
```
