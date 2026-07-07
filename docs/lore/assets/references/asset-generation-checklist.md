# Asset Generation Checklist

> **Purpose:** Step-by-step guide for content creators to generate, verify, and integrate AI-generated assets into Las Flores 2077.
> **Audience:** AI artists, designers, content creators

---

## 📋 Pre-Generation Checklist

Before generating any asset, ensure:

- [ ] **Lore written** — Source lore file exists in `docs/lore/` (figures/, landmarks/, districts/, or events/)
- [ ] **Prompt reviewed** — Prompt content follows the modular structure from `prompt_library.md` (Style + Setting + Mood + Lighting + Composition + Details + Contrast + Technical Specs)
- [ ] **Consumer Intent Tag set** — Prompt includes the appropriate tag at the top:
  - `[CONSUMER: phaser-sprite]` — For Phaser texture atlases (transparent background, centered, isolated)
  - `[CONSUMER: html-background]` — For DOM background images (16:9 crop, no transparency required)
  - `[CONSUMER: tile]` — For map tile textures (seamless, 1:1 crop, transparent optional)
  - `[CONSUMER: portrait]` — For character portraits (transparent background, 3:4 crop, PNG with alpha)
- [ ] **Negative prompts included** — Universal negatives applied: `--no androids, no robots, no extreme violence, no blood, no gore, no modern day, no utopian`
- [ ] **Tool settings selected** — Appropriate aspect ratio and style flags chosen per tool (see table below)

---

## ⚙️ Generation Settings by Tool

### MidJourney

| Asset Type | Settings | Notes |
|---|---|---|
| Portrait | `--v 6 --ar 3:4 --style raw` | 3:4 aspect ratio for character portraits |
| Background | `--v 6 --ar 16:9 --style raw` | Landscape format for scene backgrounds |
| Tile texture | `--v 6 --ar 1:1 --style raw` | Square format for seamless tiles |
| Landmark overlay | `--v 6 --ar 1:1 --style raw` | Square for overlay composites |
| Thematic art | `--v 6 --ar 16:9 --style raw` | Landscape for symbolic/vault art |
| Video | `--v 6 --ar 16:9 --style raw` | Wide format for cinematic scenes |

### Stable Diffusion

| Asset Type | Checkpoint | Sampler | CFG Scale | Steps |
|---|---|---|---|---|
| Portrait | Realistic Vision v5.1 or Juggernaut | DPM++ 2M Karras | 9 | 50 |
| Background | Realistic Vision v5.1 | DPM++ 2M Karras | 9 | 50 |
| Tile texture | Realistic Vision v5.1 | DPM++ 2M Karras | 7-9 | 40-50 |
| Any | — | DPM++ 2M Karras | 7-12 | 40-50 |

### DALL-E 3

| Asset Type | Settings | Notes |
|---|---|---|
| Portrait | Quality: HD, Style: Photorealistic | Full sentences, explicit descriptions |
| Background | Quality: HD, Style: Photorealistic | Natural language descriptions |
| Tile texture | Quality: HD, Style: Natural | Specify "seamless tileable" |
| Video frames | Quality: HD, Style: Photorealistic | Describe camera angles and lighting |

---

## ✅ Post-Generation Checklist

After generating the asset:

- [ ] **MIME verified** — Run `node docs/lore/assets/scripts/verify-assets.mjs --check-mime` to confirm correct content-type
- [ ] **Dimensions checked** — Run `node docs/lore/assets/scripts/verify-assets.mjs --check-dimensions` to verify aspect ratios:
  - Portraits: ~3:4
  - Backgrounds: ~16:9
  - Tiles: ~1:1
- [ ] **Uploaded to MinIO** — Asset uploaded to correct bucket path:
  - `las-flores/portraits/{character_slug}.png`
  - `las-flores/portraits/{character_slug}/atlas.png` — for texture atlases
  - `las-flores/backgrounds/{location_slug}.png`
  - `las-flores/tiles/{tile_type}.png`
- [ ] **Content YAML updated** — Added URL to corresponding content file:
  - Character portraits: `content/characters/char_{slug}.yaml` → `portrait_urls[].url`
  - Location backgrounds: `content/locations/location_{slug}.yaml` → `scene.background_url`
  - Map tiles: `content/maps/map_{slug}.yaml` → `base_image_url` or `overlay_image_url`
- [ ] **Verify script passes** — Run `node docs/lore/assets/scripts/verify-assets.mjs` and confirm ✅ for the asset
- [ ] **Asset tested in-game** — Rebuild server/container and verify client renders the asset correctly

---

## 📊 Quick Reference: Asset Pipeline Flow

```
1. Write lore → docs/lore/figures/{slug}.md
2. Generate prompt → docs/lore/figures/{slug}.prompt.md (via generate-prompt.mjs)
3. Paste prompt into AI tool with correct settings
4. Download generated asset
5. Upload to MinIO: las-flores/portraits/{slug}.png
6. Update content: content/characters/char_{slug}.yaml
7. Verify: node verify-assets.mjs
8. Rebuild: docker compose build server && docker compose up -d server
```

---

## 🔗 Related Documents

- **Asset Pipeline Workflow** — `docs/lore/assets/workflows/asset_pipeline.md`
- **Prompt Library** — `docs/lore/guides/prompt_library.md`
- **Media Pipeline Tiers** — `docs/lore/assets/workflows/media-pipeline-tiers.md`
- **Verify Script** — `docs/lore/assets/scripts/verify-assets.mjs`
