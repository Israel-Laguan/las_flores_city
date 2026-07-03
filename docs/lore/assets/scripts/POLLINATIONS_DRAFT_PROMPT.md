# Pollinations Draft Generation — Copy-Paste Prompt

Use this prompt in another chat to generate all Pollinations drafts for the Las Flores 2077 UI assets.

---

## Context

I'm working on a game called **Las Flores 2077**, a cyberpunk narrative set in a fictional Latin American coastal city. We have three UI concepts that need visual assets:
1. **Isometric District Map** — tile textures + landmark overlays
2. **Visual Novel Interface** — scene backgrounds + character portraits
3. **Phone Terminal** — wallpaper + app icons

All prompts are already written in `docs/lore/assets/ui-concepts/[concept]/assets/*.prompt.md`. Each file contains multiple variants (Base + Night/Weather + Alt).

---

## Your Task

Generate first-draft images using the **Pollinations free API** (`https://image.pollinations.ai/prompt/...`).

### Scripts Available

| Script | Purpose |
|--------|---------|
| `docs/lore/assets/scripts/generate-pollinations-drafts.mjs` | Node.js script that reads `.prompt.md` files and downloads drafts via Pollinations |
| `docs/lore/assets/scripts/generate-drafts.sh` | Bash wrapper with state tracking for resume/retry |

### Step-by-Step Instructions

1. **Initialize state** (one-time):
```bash
bash docs/lore/assets/scripts/generate-drafts.sh init
```

2. **Check status**:
```bash
bash docs/lore/assets/scripts/generate-drafts.sh status
```

3. **Generate drafts** (this is the main task):
```bash
# Generate ALL 145 prompt variants
bash docs/lore/assets/scripts/generate-drafts.sh run

# Or generate specific types in batches:
bash docs/lore/assets/scripts/generate-drafts.sh run --filter tile
bash docs/lore/assets/scripts/generate-drafts.sh run --filter overlay
bash docs/lore/assets/scripts/generate-drafts.sh run --filter portrait,background
bash docs/lore/assets/scripts/generate-drafts.sh run --filter app-icon,phone-wallpaper
```

4. **Verify**:
```bash
bash docs/lore/assets/scripts/generate-drafts.sh status
```

---

## Important Constraints

- **30-second delay** between requests (Pollinations rate limit)
- Total variants: **145** across **51 prompt files**
- Estimated total time: ~72 hours for full generation
- Drafts save to sibling `drafts/` directories next to each prompt file
- Files under 5KB are considered corrupt/error responses

### Asset Dimensions (from prompt files)
- Tiles/Overlays: 512×512
- VN Backgrounds: 1920×1080
- VN Portraits: 512×768
- Phone Wallpaper: 1080×1920
- App Icons: 128×128

---

## Troubleshooting

### Issue: `find: docs/lore/docs/lore/... No such file or directory`
**Cause:** The script was run from the wrong directory.  
**Fix:** Always run from the project root (`/home/anthony/code/las_flores_city`) or use absolute paths:
```bash
cd /home/anthony/code/las_flores_city
bash docs/lore/assets/scripts/generate-drafts.sh init
```

### Issue: `command not found: node`
**Cause:** Node.js is not in PATH.  
**Fix:** Use the full path to node:
```bash
which node
# If not found, install Node.js or use nvm
```

### Issue: Script says "0 variants" after `init`
**Cause:** The `PROMPT_ROOT` path is wrong.  
**Fix:** Verify:
```bash
ls docs/lore/assets/ui-concepts/isometric-map/assets/*.prompt.md | head
# Should list prompt files
```

### Issue: Drafts are corrupt/small files
**Cause:** Pollinations returned an error page instead of an image.  
**Fix:** 
```bash
bash docs/lore/assets/scripts/generate-drafts.sh clean
bash docs/lore/assets/scripts/generate-drafts.sh retry
```

### Issue: Script stops mid-generation
**Cause:** Ctrl-C, network timeout, or terminal closed.  
**Fix:** State is preserved. Just re-run:
```bash
bash docs/lore/assets/scripts/generate-drafts.sh run
```
Already-completed drafts are skipped automatically.

### Issue: `Permission denied` when running `generate-drafts.sh`
**Cause:** Script is not executable.  
**Fix:**
```bash
chmod +x docs/lore/assets/scripts/generate-drafts.sh
```

---

## Manual Fallback

If the script fails, you can generate manually:

1. Open any `.prompt.md` file
2. Copy the prompt variant you want
3. Visit: `https://image.pollinations.ai/prompt/ENCODED_PROMPT?width=512&height=512&nologo=true`
4. Download the image
5. Save to the `drafts/` folder next to the prompt file with naming: `{basename}__{variant_slug}.png`

Example:
- Prompt file: `docs/lore/assets/ui-concepts/isometric-map/assets/tile_street.prompt.md`
- Variant: `Base`
- Save to: `docs/lore/assets/ui-concepts/isometric-map/assets/drafts/tile_street__base.png`

---

## Output Structure

```
docs/lore/assets/ui-concepts/
├── isometric-map/assets/
│   ├── tile_street.prompt.md
│   └── drafts/
│       ├── tile_street__base.png
│       ├── tile_street__night_variant.png
│       └── ...
├── vn-interface/assets/
│   ├── bg_puerto_noche.prompt.md
│   └── drafts/
│       ├── bg_puerto_noche__base.png
│       └── ...
└── phone-terminal/assets/
    ├── app_mapa.prompt.md
    └── drafts/
        ├── app_mapa__base.png
        └── ...
```

---

## After Generation

Once drafts are generated:
1. Review the drafts in the `drafts/` directories
2. Select the best variants for production
3. Re-generate production-quality images in MidJourney/DALL-E using the same prompts
4. Upload production assets to MinIO (paths documented in `UI_ASSET_INVENTORY.md`)

---

## State File

The script creates `docs/lore/assets/scripts/generate-drafts-state.tsv` which is gitignored. It tracks:
- `prompt_rel` — relative path to prompt file
- `variant` — variant name
- `w` / `h` — dimensions
- `draft_path` — relative path to draft file
- `size_bytes` — file size
- `status` — pending/completed/failed
- `updated_at` — timestamp

You can inspect it with:
```bash
cat docs/lore/assets/scripts/generate-drafts-state.tsv
```

</parameter>
</write_to_file>