---
name: akool-location-i2i
description: "Generate district location backgrounds with AKOOL text-to-image, then their night/rain/sunset variants with image-to-image relighting, for one location or every location under content/districts/. Never overwrites: existing names get a __akool suffix. Use when asked to create or vary location/district background images."
---

# AKOOL location backgrounds (base + variants, batch)

Files only. No YAML or DB changes (content layering contract): afterwards add variants to `background_urls[]` through the normal asset publish workflow (`docs/ASSET_EXPRESSION_VOCABULARY.md` section 2).

## Run

```bash
S=scripts/akool-location-i2i.sh
$S all                                  # PLAN for all 75 locations: counts, credits, balance. Spends nothing.
$S all central --variants night,rain    # plan for one district
$S all central --variants night,rain --yes   # run for real (required to spend)
$S --dry-run base central embajada_de_china  # single location
$S variants central embajada_de_china last night rain sunset
```

- `all`: per location it generates the base (text-to-image from `## Prompt`), then each variant (image-to-image from that new base). Variants whose time/weather is already in the location's own prompt (e.g. a prompt saying "night") are skipped.
- **Never overwrites.** If `<slug>__default.png` exists (84 do), the new image is saved as `<slug>__default__akool.png`, then `__akool-2.png`, and so on. Existing files are never touched.
- **Resumable.** Finished items are recorded in `$AKOOL_BATCH_STATE` (default `${TMPDIR:-/tmp}/akool-location-batch.done`) and skipped on re-run, so a crash does not double-spend. Delete that file to start over (renames would then create duplicates).
- A real `all` run needs `--yes` and refuses if the plan exceeds the balance (read via the API; the CLI fails when `.env` is loaded). Narrow with `<district>` or `--variants`.
- Variants: `night`, `rain`, `sunset`, `dawn`, `overcast` (fixed relighting prompts + the location's negative prompt). Options: `--scale` (16:9), `--similar` (0.6), `--resolution 4k` (costs more).
- Variants need a public source URL: the script chains from the base it just generated. Existing local defaults are not reachable by AKOOL; to vary one, pass a share link from the web UI.
- Runtime is sequential, about 35 s per image.

## Rules

- Ask before spending: show the plan (images, credits, balance) and wait for an explicit OK.
- Credit cost: 3 per image at 1080p (measured 2026-10-09). The balance is shared with the web UI, so it can drop for reasons that are not this script.
- Generate and review a small district first. View results: composition preserved across variants, no people/text/logos, day base for a day/night set.
- Keep the job `_id`s printed per image (no list endpoint for images).
- Never print `AKOOL_API_KEY`. Do not commit unless asked.
