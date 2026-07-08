# Admin Asset Generation — Usage Guide

> **Purpose:** Step-by-step guide for using the admin asset generation pipeline to create UI assets for Las Flores 2077.
>
> **Last updated:** 2026-07-03

---

## Prerequisites

Before using the admin asset pipeline, ensure the following are running:

1. **PostgreSQL OLTP** — `docker compose up -d postgres-oltp`
2. **MinIO** — `docker compose up -d minio`
3. **Server** — `docker compose up -d server`
4. **Admin Panel** — `docker compose up -d admin` (or `npm run dev --workspace=admin` locally)
5. **NVIDIA_API_KEY** — Set in `.env` (server) and `.env.example` (documentation)

Verify server health:
```bash
docker exec las-flores-server wget -qO- http://localhost:3000/health
# Expected: {"success":true,"data":{"status":"healthy",...}}
```

---

## Accessing the Admin Panel

Open your browser and navigate to:
```
http://localhost:3001/assets
```

You should see the **Asset Generation Pipeline** page with a dark cyberpunk-themed interface.

---

## Workflow Overview

The admin panel implements a **3-step workflow** for each asset:

```
Step 1: Generate Base Proposals
         └── Generate 4 base images from the prompt file using NIM (FLUX.2 Klein)
         └── Review the 4 proposals
         └── Click "Approve" on the best base

Step 2: Generate Variants (i2i)
         └── Use the approved base as input for image-to-image generation
         └── Adjust i2i strength slider (0.0–1.0)
         └── Generate variants (night, rain, alt-color, etc.)

Step 3: Publish
         └── Copy the approved base and/or variants to final MinIO paths
         └── Assets are now ready for client integration
```

---

## Step 1: Choose an Asset to Create

On the main page, you'll see a **"What do you want to create?"** menu with 3 categories:

| Category | Icon | Description |
|----------|------|-------------|
| 🗺️ Isometric Map | 🗺️ | Tile textures and landmark overlays for the district map |
| 🎭 VN Interface | 🎭 | Scene backgrounds and character portraits for dialogue |
| 📱 Phone & Terminal | 📱 | Wallpaper and app icons for the phone OS |

Click on a category to expand it, then click on an asset name (e.g., `app_misiones`) to enter the generator view.

### Asset Types Reference

| Asset Type | Dimensions | Format | Use Case |
|------------|-----------|--------|----------|
| `tile` | 1024×1024 | PNG | Isometric map tile textures |
| `overlay` | 1024×1024 | PNG (transparent) | Landmark overlays |
| `background` | 1392×752 | JPG | VN scene backgrounds |
| `html-background` | 1248×832 | JPG | Web-based backgrounds |
| `portrait` | 832×1248 | PNG (transparent) | Character portraits |
| `phone-wallpaper` | 752×1392 | JPG | Phone home screen |
| `app-icon` | 1024×1024 | PNG (transparent) | Phone app icons |

---

## Step 2: Generate Base Proposals

Once you've selected an asset, you'll see the **Step 1: Generate Base Proposals** section.

1. Click the **"Generate 4 Bases"** button.
2. The system will:
   - Read the `.prompt.md` file from `docs/lore/assets/ui-concepts/`
   - Extract the "Base" prompt
   - Generate 4 images using NIM FLUX.2 Klein (with Pollinations fallback)
   - Upload each image to MinIO at `drafts/bases/<prompt_rel>__base_<uuid>.png`
   - Store metadata in the `asset_bases` table
3. Wait for generation (typically 10–30 seconds per image).
4. Review the 4 proposals displayed in a grid.

### Understanding the Grid

Each base proposal card shows:
- **Image preview** — the generated base image
- **Proposal #** — 1–4 (the order generated)
- **Seed** — the random seed used for generation
- **Approve button** — click to mark this base as the chosen one

### Approving a Base

1. Review the 4 proposals.
2. Click **"Approve"** on the best proposal.
3. The chosen base will get a green border and a **"✓ Chosen"** badge.
4. Only one base can be chosen at a time (choosing a new one automatically unchecks the previous).

**Tip:** If none of the 4 proposals are good, you can generate 4 more by clicking "Generate 4 Bases" again. The new proposals will be added to the grid.

---

## Step 3: Generate Variants (i2i)

Once a base is approved, the **Step 2: Generate Variants (i2i)** section will appear.

### Variant Form

| Field | Description | Default |
|-------|-------------|---------|
| **Variant Name** | Short identifier (e.g., `night`, `rain`, `alt_color`) | Pre-filled from prompt file |
| **Variant Prompt** | The prompt describing the variant | Pre-filled from prompt file |
| **Negative Prompt** (optional) | Things to avoid in the generation | Pre-filled from prompt file |
| **i2i Strength** | How much the base image influences the variant (0.0 = pure text-to-image, 1.0 = almost identical to base) | 0.70 |

### Generating a Variant

1. Adjust the **i2i Strength** slider if needed:
   - **0.3–0.5** — Strong variation, keeps only the composition
   - **0.6–0.8** — Balanced variation, keeps colors and shapes (recommended)
   - **0.9–1.0** — Subtle variation, keeps most of the base
2. Click **"Generate Variant"**.
3. The system will:
   - Fetch the approved base image from MinIO
   - Base64-encode it
   - Send it to NIM FLUX.2 Klein with the variant prompt and strength
   - Fall back to Pollinations i2i if NIM fails
   - Upload the result to `drafts/variants/<prompt_rel>__<variant_name>_<uuid>.png`
4. The variant will appear in the **Generated Variants** grid below.

### Pre-filled Variants

The admin UI automatically pre-fills the variant form with the first non-base variant from the `.prompt.md` file. For example, if the prompt file has:
- `## Prompt — Base`
- `## Prompt — Night Glow Variant`
- `## Prompt — Day-lit Variant`

The form will pre-fill with "Night Glow Variant" so you can generate it with one click.

---

## Step 4: Publish Assets

Once you're happy with the base and/or variants, you can publish them to their final MinIO paths.

### Publishing a Base

1. Scroll to **Step 3: Publish Approved Base**.
2. Click **"Publish Base to MinIO"**.
3. The system will:
   - Copy the image from `drafts/bases/...` to the final path
   - Final path follows the inventory convention: `las-flores/<asset_type>/<name>.<ext>`
   - Example: `las-flores/tiles/tile_street.png` or `las-flores/phone/app_misiones.png`
4. You'll see an alert with the public URL.

### Publishing a Variant

1. Find the variant card in the **Generated Variants** grid.
2. Click the **"Publish"** button on the variant card.
3. The system will:
   - Copy the image from `drafts/variants/...` to the final path
   - Final path: `las-flores/<asset_type>/<name>__<variant_name>.<ext>`
   - Example: `las-flores/tiles/tile_street__night.png`
4. You'll see an alert with the public URL.

### Final Path Conventions

| Asset Type | Base Path | Variant Path |
|------------|-----------|--------------|
| `tile` | `las-flores/tiles/<name>.png` | `las-flores/tiles/<name>__<variant>.png` |
| `overlay` | `las-flores/overlays/<name>.png` | `las-flores/overlays/<name>__<variant>.png` |
| `background` | `las-flores/backgrounds/<name>.jpg` | `las-flores/backgrounds/<name>__<variant>.jpg` |
| `html-background` | `las-flores/backgrounds/<name>.jpg` | `las-flores/backgrounds/<name>__<variant>.jpg` |
| `portrait` | `las-flores/portraits/<name>.png` | `las-flores/portraits/<name>__<variant>.png` |
| `phone-wallpaper` | `las-flores/phone/<name>.jpg` | `las-flores/phone/<name>__<variant>.jpg` |
| `app-icon` | `las-flores/phone/<name>.png` | `las-flores/phone/<name>__<variant>.png` |

---

## Troubleshooting

### "NVIDIA_API_KEY missing"

**Cause:** The server doesn't have `NVIDIA_API_KEY` set in its environment.

**Fix:** Add to `.env`:
```bash
NVIDIA_API_KEY=nvapi-...
```
Then rebuild the server:
```bash
docker compose build server && docker compose up -d server
```

### "Content filtered" warnings

**Cause:** NIM's safety filter triggered on the prompt.

**Fix:** The system automatically falls back to Pollinations. If Pollinations also fails, try:
- Rewriting the prompt to avoid sensitive terms
- Using a different seed (generate new bases)

### Rate limit errors (429)

**Cause:** NIM client-side limit is ~35 RPM.

**Fix:** The system has automatic retry with exponential backoff. If you see repeated failures:
- Wait 2–3 minutes before retrying
- The token bucket will refill automatically

### Images not loading

**Cause:** The `/assets/image/:id` proxy endpoint may not be working.

**Fix:** Check that the server is running and the image exists in the database:
```bash
curl http://localhost:3000/assets/image/<base-id>
```

### Prompt catalog is empty

**Cause:** The `docs/` directory is not mounted in the server container.

**Fix:** Ensure `docker-compose.yml` has the volume mount:
```yaml
volumes:
  - ./docs:/app/docs:ro
```
Then restart the server:
```bash
docker compose up -d server
```

---

## API Reference

### `GET /assets/prompt-catalog`

Returns the list of all prompt files grouped by category.

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "phone-terminal",
        "label": "📱 Phone & Terminal",
        "icon": "📱",
        "entries": [
          {
            "prompt_rel": "phone-terminal/app_misiones",
            "name": "app_misiones",
            "category": "phone-terminal",
            "asset_type": "app-icon",
            "dimensions": { "width": 1024, "height": 1024 },
            "prompt_file": "docs/lore/assets/ui-concepts/phone-terminal/assets/app_misiones.prompt.md",
            "variants": [
              { "name": "Base", "prompt": "...", "negative_prompt": "" },
              { "name": "Alt Color", "prompt": "...", "negative_prompt": "" }
            ]
          }
        ]
      }
    ]
  }
}
```

### `POST /assets/generate-bases`

Generates N base proposals for a prompt.

**Request:**
```json
{
  "prompt_rel": "phone-terminal/app_misiones",
  "count": 4,
  "asset_type": "app-icon",
  "negative_prompt": "no text, no logos",
  "width": 1024,
  "height": 1024
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "prompt_rel": "phone-terminal/app_misiones",
      "proposal_index": 0,
      "image_path": "s3://las-flores/drafts/bases/...",
      "seed": 123456789,
      "chosen": false,
      "created_at": "2026-07-03T...",
      "asset_type": "app-icon",
      "prompt_text": "...",
      "negative_prompt": "",
      "width": 1024,
      "height": 1024,
      "final_path": null
    }
  ]
}
```

### `POST /assets/generate-variants`

Generates variants from a chosen base using i2i.

**Request:**
```json
{
  "base_id": "uuid",
  "variants": [
    {
      "variant_name": "night",
      "prompt": "Same icon but with darker background and blue neon glow",
      "i2i_strength": 0.7,
      "negative_prompt": "no text, no logos",
      "width": 1024,
      "height": 1024
    }
  ]
}
```

### `POST /assets/approve-base`

Marks a base as the chosen one for variant generation.

**Request:**
```json
{
  "base_id": "uuid"
}
```

### `POST /assets/publish`

Copies a base or variant to its final MinIO path.

**Request (base):**
```json
{
  "base_id": "uuid"
}
```

**Request (variant):**
```json
{
  "variant_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "final_path": "las-flores/phone/app_misiones.png",
    "url": "http://localhost:9000/las-flores/phone/app_misiones.png"
  }
}
```

### `GET /assets/list?prompt_rel=<prompt_rel>`

Lists all bases and variants for a prompt.

### `GET /assets/list-all`

Lists all prompt groups with base/variant counts.

### `GET /assets/image/:id`

Proxies an image from MinIO. Returns the image bytes with `Content-Type` set.

---

## Next Steps

After publishing assets, proceed to **Step 3: Client Integration** (separate chat/task):

1. Update `client/src/styles/phone.css` — add wallpaper and app grid styles
2. Update `client/src/components/PhoneOverlay.ts` — render app icons
3. Update `client/src/components/MapView.tsx` — add isometric tile rendering
4. Update `client/src/components/DialogueUI.ts` — add portrait and background rendering
5. Run `npm run lint --workspace=client && npm run build --workspace=client`

See `docs/lore/assets/ui-concepts/UI_ASSET_INVENTORY.md` for the full client integration map.

---

## Quick Reference

| Action | Button | Endpoint |
|--------|--------|----------|
| Generate 4 bases | "Generate 4 Bases" | `POST /assets/generate-bases` |
| Approve a base | "Approve" (on base card) | `POST /assets/approve-base` |
| Generate variant | "Generate Variant" | `POST /assets/generate-variants` |
| Publish base | "Publish Base to MinIO" | `POST /assets/publish` |
| Publish variant | "Publish" (on variant card) | `POST /assets/publish` |

---

## Notes

- **Draft vs Final:** Drafts are stored in `drafts/bases/` and `drafts/variants/`. Final assets are stored in `las-flores/<type>/`. Always publish before using in the client.
- **Seeds:** Each base proposal uses a random seed. If you want to regenerate a specific proposal, note the seed and use it in a custom request.
- **i2i Strength:** This is a creative parameter. Experiment with different values to get the desired look.
- **Rate Limits:** NIM has a ~35 RPM client-side limit. The system handles this automatically with token bucket rate limiting and exponential backoff retry.
- **Fallback:** If NIM fails (content filter, rate limit, network), the system falls back to Pollinations automatically.