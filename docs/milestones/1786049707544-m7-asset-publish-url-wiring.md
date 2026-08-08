# M7 — Asset Publish & URL Wiring

**Milestone file:** `1786049707544-m7-asset-publish-url-wiring.md`
**Depends on:** M6 (`…-m6-portrait-png-generation.md`) — assets must exist before
they can be published.
**Deliverable:** upload staged `content/**/assets/` PNGs to MinIO and write
`portrait_urls` / `background_urls` back into YAML + DB; verify with
`verify-assets.mjs`.
**Status:** deferred — track this milestone; execute later.

---

## Goal

Close the authoring loop documented in AGENTS.md:
`content/**/assets/` (staging) → `AssetPublishService` (upload to MinIO) → YAML +
DB (`portrait_urls` / `background_urls` written). Today **0** entities are wired
through the pipeline and only **1** scene YAML has `background_urls`.

## Scope

1. **Characters** — run `AssetPublishService`
   (`server/src/services/AssetPublishService.ts`) over every character folder
   with staged assets. It uploads to MinIO and writes `portrait_urls` (with
   `expression` tags for variants) back into `char_<slug>.yaml` + DB, per
   `docs/ASSET_EXPRESSION_VOCABULARY.md`.
2. **Scenes** — wire `background_urls` with environment tags (`night`, `rain`,
   `sunset`) resolved by `resolveBackgroundUrl(...)`; only 1 of 20 scene YAMLs
   currently has them.
3. **Reference flow** — the staged-publish logic in
   `server/scripts/publish-adeyemi-portraits.ts` is a working model for how the
   dev-batch expression variants resolve against the running env's stage.

## Verification

```bash
cd /home/anthony/code/las_flores_city
node scripts/asset-pipeline/scripts/verify-assets.mjs        # → 0 missing MinIO URLs
grep -rl 'portrait_urls' content/characters --include='*.yaml' | wc -l      # → grows
grep -rl 'background_urls' content/scenes --include='*.yaml' | wc -l        # → grows
docker exec las-flores-server wget -qO- http://localhost:3000/health        # server healthy
```

## Safety

- Run `bash scripts/backup-content-assets.sh` before any publish pass.
- MinIO data survives `docker compose down --volumes` (host-bind mount
  `.minio-data/`), but always back up local staging first.
- YAML writes follow the existing pipeline transaction pattern
  (`AssetPublishService` → `markPublished` / `AssetNeedsService`).

## Do NOT

- Do not generate new PNGs here (that is M6). This milestone publishes and
  wires what already exists in staging.
- Do not touch game-behavior code; URL wiring is content/config only.

## Acceptance criteria (M7)

- [ ] `verify-assets.mjs` reports 0 missing assets across `content/`.
- [ ] Every staged character PNG is referenced by a `portrait_urls` entry (with
      correct `expression` tags) in YAML + DB.
- [ ] Every scene with staged backgrounds has `background_urls` entries with
      environment tags.
- [ ] No deprecated `docs/lore/figures/` references introduced.
