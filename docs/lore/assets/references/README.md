# References Archive

> **Purpose:** Historical "before" state of the asset pipeline. These assets were generated using the old style prefix and prompt structure. They are preserved for reference, comparison, and inspiration.

---

## What's Here

| Directory | Contents | Status |
|---|---|---|
| `prompts/` | Legacy prompt templates (`characters.txt`, `locations.txt`, `scenes.txt`) | Superseded by registry system |
| `style-exploration/` | Style exploration notes (`notes.md`, `modern-comic/notes.md`) | Historical record |
| `ui-concepts/` | HTML mockups + prompt files + draft PNGs for 3 UI concepts | Legacy assets, see below |

---

## UI Concepts Breakdown

### `ui-concepts/isometric-map/`
- **HTML mockup:** `index.html` — isometric map concept
- **Prompt files:** 17 tile prompts + 15 landmark prompts
- **Draft PNGs:** ~42 generated images (base + day_lit + night_glow variants)
- **Status:** Prompts use old style. Tiles and landmarks now have registries (`tiles.yaml`, `landmarks.yaml`) with updated prompts.

### `ui-concepts/phone-terminal/`
- **HTML mockup:** `index.html` — phone UI concept
- **Prompt files:** 1 wallpaper + 8 app icon prompts
- **Draft PNGs:** ~27 generated images
- **Status:** Prompts use old style. Icons and wallpaper now have registries (`app_icons.yaml`, `phone_wallpapers.yaml`) with updated prompts.

### `ui-concepts/vn-interface/`
- **HTML mockup:** `index.html` — visual novel interface concept
- **Prompt files:** 8 background prompts + 2 portrait prompts
- **Draft PNGs:** ~30 generated images
- **Status:** Prompts use old style. Backgrounds now have registry (`backgrounds.yaml`) with updated prompts. Portraits should use the new `portrait` prompt type or the biometric pipeline.

---

## How to Use This Archive

1. **Reference for mood/color:** The draft PNGs show what the old style produced. Compare with new generations to validate quality improvement.
2. **Prompt archaeology:** The old `.prompt.md` files show the previous prompt structure. Useful for understanding what changed.
3. **Do not regenerate from these files:** Use the new registries and `generate-prompt.mjs` instead.

---

## Migration Status

| Asset Category | Old Location | New Registry | Prompt Type |
|---|---|---|---|
| Terrain tiles | `ui-concepts/isometric-map/assets/tile_*.prompt.md` | `registries/tiles.yaml` | `tile` |
| Landmark overlays | `ui-concepts/isometric-map/assets/lm_*.prompt.md` | `registries/landmarks.yaml` | `overlay` |
| Scene backgrounds | `ui-concepts/vn-interface/assets/bg_*.prompt.md` | `registries/backgrounds.yaml` | `background` |
| Character portraits | `ui-concepts/vn-interface/assets/portrait_*.prompt.md` | N/A (use `portrait` type or biometric pipeline) | `portrait` |
| Phone wallpaper | `ui-concepts/phone-terminal/assets/wallpaper_*.prompt.md` | `registries/phone_wallpapers.yaml` | `phone-wallpaper` |
| App icons | `ui-concepts/phone-terminal/assets/app_*.prompt.md` | `registries/app_icons.yaml` | `app-icon` |

---

## Notes

- **Do not delete this directory.** It serves as the "before" baseline for the asset pipeline.
- **Do not commit new binary assets here.** This is a documentation archive only.
- **To regenerate with new style:** Use the registries + `generate-prompt.mjs` in the main pipeline.