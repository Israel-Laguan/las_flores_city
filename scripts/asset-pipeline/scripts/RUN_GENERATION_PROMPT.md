# Run Asset Generation Pipeline

## Context

The project has ~200 `.prompt.md` files across these directories, all needing image generation:
- `content/characters/*/` — ~128 portrait/biometric prompts
- `content/locations/*/` — ~55 background/overlay prompts
- `content/scenes/*/` — ~18 scene background prompts
- `content/lore/shared/*/` — app icon, tile, and thematic prompts

Generated images go to the flat `assets/` directory inside each entity folder (e.g. `content/characters/<slug>/assets/`). Naming follows `<slug>__<ISO-timestamp>.png`.

## Instructions

Run the full asset generation pipeline. Follow these steps in order:

### Step 1: Pre-flight checks

1. Verify NVIDIA API key is available: check `.env` for `NVIDIA_API_KEY` or env var
2. Verify the unified generator script exists at `scripts/asset-pipeline/scripts/generate-drafts-unified.mjs`
3. Do a dry-run first to see what would be generated:
   ```bash
   node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --dry-run
   ```
4. Report total prompt variants found and any issues

### Step 2: Run generation

Run the unified draft generator. Use `--filter` to batch by type if needed to manage load:

```bash
# Full run (all types)
node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs

# Or batch by type if full run is too large:
node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --filter background
node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --filter overlay
node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --filter portrait
node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --filter thematic
node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --filter tile
node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --filter app-icon
```

The script tries NIM first, falls back to Pollinations. It saves to `{promptDir}/assets/`.

### Step 3: Post-generation verification

After generation completes, run these checks:

1. **Count generated assets per type:**
   ```bash
   echo "=== Generated asset counts ==="
   for type in background overlay portrait thematic tile app-icon biometric; do
     count=$(find content -path "*/assets/*${type}.png" -type f 2>/dev/null | wc -l)
     echo "  $type: $count"
   done
   ```

2. **Check for zero-byte or corrupt files (< 5KB):**
   ```bash
   find content -path "*/assets/*.png" -size 0 -type f
   find content -path "*/assets/*.png" -size -5k -type f
   ```

3. **Verify every prompt file has at least one generated asset:**
   Write a quick check: for each `.prompt.md` file, verify at least one `.png` exists in its sibling `assets/` directory. Report prompts with zero assets.

4. **Check for duplicate filenames** (same name, different timestamps — this is expected, but flag if >5 variants per prompt as possible runaway generation)

### Step 4: Healing — retry failures

If any prompts failed to generate (no assets, or zero-byte files):

1. Use the `--force` flag to regenerate only failed ones:
   ```bash
   node scripts/asset-pipeline/scripts/generate-drafts-unified.mjs --force --filter <type>
   ```

2. If NIM is failing (check for 429 rate limits or auth errors), the script should auto-fallback to Pollinations. If both fail, report the error and skip.

3. After retry, re-run the verification in Step 3.

### Step 5: Summary report

Report:
- Total prompts scanned
- Total assets generated (by type)
- Failed prompts (list with error reason)
- Retried and recovered
- Any remaining failures that need manual intervention

## Error handling

- If `NVIDIA_API_KEY` is missing, report warning but continue with Pollinations only
- If rate limited (429), wait and retry with exponential backoff
- If a prompt file is malformed (missing `**Type:**` field), skip and report
- If disk space is low, report and stop
- Never delete existing assets unless `--force` is explicitly used
