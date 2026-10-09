---
name: akool-expression-i2i
description: "Generate character expression variants (e.g. __happy, __sad) from a base portrait or an akool.com share link using the cheapest AKOOL image-to-image path, and save them into the character's assets/ folder. Use when the user gives a shared/base image and a list of expressions."
---

# AKOOL expression image-to-image

Turns one good base portrait into expression variants, using the expression text already written in the character's `.prompt.md`.

## When to use

- The user supplies a base image (an `akool.com/share/<code>` link, a bare share code, or a public image URL) and one or more expression names.
- Not for creating a base portrait from scratch: text-to-image style drifts; image-to-image from a good reference keeps the art style.

## Run

```bash
# preview only, spends nothing
scripts/akool-expression-i2i.sh --dry-run carlos_konibo https://akool.com/share/K7p77CZOnA happy sad
# real run (3 credits per expression)
scripts/akool-expression-i2i.sh carlos_konibo https://akool.com/share/K7p77CZOnA happy sad
```

- Saves `content/characters/<slug>/assets/<slug>__<expression>.png`.
- Expression names are the ``**`__<name>.png`**`` bullets in `content/characters/<slug>/<slug>.prompt.md` (`happy`, `sad`, ...). An unknown name fails before any spend.
- Existing files are skipped unless `--force`; with `--force` the old file is copied to `${TMPDIR:-/tmp}/akool-backups/` first. Confirm with the user before `--force`.
- Options: `--scale`, `--similar` (0-1, default 0.6), `--resolution 4k` (costs more, 4 credits).
- For a share link, the scale is taken from the link's own settings.

## Why this is the cheapest path (measured 2026-10-09)

- Direct API, Flux Kontext (`wavespeed-ai/flux-kontext-dev`), `1080p`, one image: **3 credits**. 4k costs 4. The CLI costs 8. The MCP also costs 3 but cannot set `negative_prompt`, resolution or similarity.
- The reported `deduction_credit` can understate the balance change by 1-2 credits. Check the balance before and after a large batch.
- Details and caveats: `docs/tutorials/akool-image-cli.md`.

## Rules

- Never print `AKOOL_API_KEY`. The script reads it from `.env` (gitignored).
- Ask the user before spending (state the expressions and the credit total) and always `--dry-run` first on a new character.
- Look at every result: Kontext keeps face, clothing, backdrop and linework well but often drifts on poses (e.g. the second hand gesture). Report mismatches honestly.
- Do not use this for video (the API charges ~100 credits per clip versus 1 in the web UI).
- The `_id` printed for each job is the only way to find the image again (no list endpoint for images).
