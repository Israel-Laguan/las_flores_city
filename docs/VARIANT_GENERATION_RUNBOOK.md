# Scene Background Variant Runbook

This runbook describes the current maintenance path for scene environment variants.
The canonical vocabulary and runtime selection rules are defined in
[`ASSET_EXPRESSION_VOCABULARY.md`](ASSET_EXPRESSION_VOCABULARY.md).

## Authoring Contract

Scene prompt files use `## Environment Variants`. Each variant prompt describes a
lighting, weather, or environment change while preserving the scene layout and style.
The retired `## Variants (image-to-image)` / `**Edit prompt:**` format is not a current
content contract.

Store staged files in the flat scene asset directory:

```text
content/scenes/<slug>/assets/<slug>__<variant>.png
```

Use environment tags such as `day`, `night`, `rain`, and `sunset`. Scene variants are
not character expressions: the published YAML field is `background_urls[].variant`.

## Publish

1. Generate or review the variant against `<slug>__default.png`. Keep `no people, no
   text, no logos` and the scene's established graphic-novel style constraints.
2. Publish through the existing `AssetPublishService`/intake-worker path. Do not write
   `scenes` rows directly from an ad hoc script.
3. Add the published object to the scene YAML's `background_urls[]` with its `variant`
   tag. Keep one untagged default entry as the fallback.
4. Run the normal content migration so the database `scenes.background_urls` array is
   reconciled from YAML.

Example:

```yaml
background_urls:
  - url: s3://las-flores/backgrounds/<slug>/<slug>__default.png
    label: dev
  - url: s3://las-flores/backgrounds/<slug>/<slug>__night.png
    label: dev
    variant: night
```

The legacy top-level `background_url` remains a runtime fallback for existing content;
do not remove it as part of variant maintenance.

## Verification

```bash
npm run content:audit
npm run validate:content
node scripts/asset-pipeline/scripts/verify-assets.mjs
```

For a running stack, verify the intake-worker and game-server from inside their
containers with `wget` on ports `3001` and `3000`. If server code changes, rebuild the
server image before checking health.

## Provider Notes

The hosted provider i2i path is not a required part of the repository contract. If a
provider cannot access a local base image, use an approved text-to-image fallback or
manual authoring, then apply the same filename, YAML, publication, and verification
steps above. Do not preserve provider-specific generation queues or completion counts in
this runbook.
