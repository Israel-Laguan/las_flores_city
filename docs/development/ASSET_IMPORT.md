# Asset Import Guide

This guide explains how to import your existing locally-generated drafts into the asset management system so they appear in the admin UI at `/assets`.

## Overview

You have 145 draft images already generated in:
```text
content/<type>/<slug>/assets/
```

These are organized per entity (characters, locations, scenes, etc.) and live alongside each entity's YAML and `.prompt.md` files.

To use these assets in the admin UI and create variations, you need to:
1. Import them into MinIO (object storage)
2. Register them in PostgreSQL database
3. View and manage them in the admin UI at `/assets`

## Quick Start

### Method 1: Using Admin UI (Recommended)

1. **Start your stack**:
   ```bash
   ./start-stack.sh
   ```

2. **Open admin UI**: Visit http://localhost:3001/assets

3. **Bulk import all drafts**:
   - In the catalog view, click the blue button: **"📁 Import All Local Drafts"**
   - This will import all 51 assets with their variants (~145 images)
   - Wait for confirmation alert

4. **Or import per-asset**:
   - Select a specific asset (e.g., "tile_street")
   - In the generator view, click: **"Import Local Drafts"**
   - This imports only the drafts for that specific asset

5. **View imported assets**:
   - After import, you'll see the base proposals in Step 1
   - Each base will have its variants listed in Step 2

6. **Create variations**:
   - Approve a base by clicking "Approve"
   - Then use "Generate Variant" or "Generate All Variants" to create i2i (image-to-image) variations

### Method 2: Using API Directly

#### Import all drafts:
```bash
curl "http://localhost:3000/assets/import-drafts?all=true"
```

#### Import specific asset:
```bash
curl "http://localhost:3000/assets/import-drafts?prompt_rel=isometric-map/assets/tile_street"
```

#### Import single image as base:
```bash
curl -X POST "http://localhost:3000/assets/import-base" \
  -H "Content-Type: application/json" \
  -d '{"prompt_rel": "custom/my_asset", "file_path": "/path/to/image.png"}'
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/assets/import-drafts?all=true` | Import all drafts from filesystem |
| GET | `/assets/import-drafts?prompt_rel=...` | Import drafts for specific asset |
| POST | `/assets/import-base` | Import single image as base |
| DELETE | `/assets/imported-drafts?all=true` | Delete all imported drafts |
| DELETE | `/assets/imported-drafts?prompt_rel=...` | Delete imported drafts for asset |

## Workflow Example

### 1. Import existing drafts
```bash
curl "http://localhost:3000/assets/import-drafts?all=true"
```

### 2. View in admin UI
- Go to http://localhost:3001/assets
- Select an asset category (e.g., "🗺️ Isometric Map")
- Click on an asset (e.g., "tile_street")
- You should see 3 bases (base, night_variant, wet_rainy_variant) already imported

### 3. Approve a base
- Click "Approve" on the best base image
- It will be marked as "✓ Chosen"

### 4. Generate variants (i2i)
- With a base approved, Step 2 becomes available
- Click "Generate Variant" to create a custom variation
- Or click "Generate All Variants" to create all variants defined in the prompt file
- Variants will appear below and can be published

### 5. Publish to final location
- Click "Publish Base" or "Publish" on a variant
- This copies the image to the final MinIO path (e.g., `las-flores/tiles/tile_street.png`)
- The URL will be shown in an alert

## Folder Structure

Your drafts are organized as:
```
content/
├── characters/<slug>/
│   └── assets/
│       ├── <slug>__default.png
│       ├── <slug>__<timestamp>.png
│       └── ...
├── locations/<slug>/
│   └── assets/
│       └── ...
├── scenes/<slug>/
│   └── assets/
│       └── ...
└── ...
```

Drafts are stored **flat** inside each entity's `assets/` folder (no sub-folders). The active file is selected by the `asset_paths.<field>` field in the entity YAML.

## File Naming Convention

Draft files follow this naming pattern:
```
<asset_name>__<variant_name>.png
```

Examples:
- `tile_street__base.png` - Base variant
- `tile_street__night_variant.png` - Night variant
- `bg_puerto_noche__base.jpg` - Background base (JPG)
- `portrait_alex__base.png` - Portrait (PNG with transparency)

## MinIO Paths After Import

After import, images are stored in MinIO at:
```
s3://las-flores/drafts/bases/<prompt_rel>_<index>.png
s3://las-flores/drafts/variants/<prompt_rel>_<variant_name>.png
```

After publishing, they move to final paths like:
```
s3://las-flores/tiles/tile_street.png
s3://las-flores/overlays/lm_palacio_municipal.png
s3://las-flores/backgrounds/bg_puerto_noche.jpg
s3://las-flores/portraits/portrait_alex.png
s3://las-flores/phone/app_mapa.png
```

## Database Schema

### asset_bases table
- `id` - UUID
- `prompt_rel` - Relative path to prompt file (e.g., "isometric-map/assets/tile_street")
- `proposal_index` - Index of this base proposal (0 for first)
- `image_path` - S3 path to image in MinIO
- `seed` - Random seed used for generation
- `chosen` - Boolean, true if this is the approved base
- `asset_type` - Type from prompt (tile, overlay, background, portrait, etc.)
- `prompt_text` - The prompt used
- `negative_prompt` - The negative prompt
- `width`, `height` - Dimensions
- `final_path` - Final published path (null if not published)

### asset_variants table
- `id` - UUID
- `base_id` - Foreign key to asset_bases
- `variant_name` - Name of variant (e.g., "night_variant")
- `image_path` - S3 path to variant image
- `i2i_strength` - Strength for image-to-image generation
- `prompt_text` - Variant prompt
- `negative_prompt` - Variant negative prompt
- `width`, `height` - Dimensions
- `final_path` - Final published path

## Troubleshooting

> **Note:** This guide references the pre-colocation location of the old UI-concepts assets. Those assets now live in `content/<type>/<slug>/assets/`; the import endpoint still reads from `PROMPT_ROOT` and supports the new per-folder layout.

### "No drafts folders found"
- Make sure the stack is running
- Check that `PROMPT_ROOT` environment variable is set correctly
- Default is `content` resolved relative to the server's cwd (e.g. from `server/` use `../content` to reach the repo root `content/`)

### Images not appearing after import
- Check the server logs for import errors
- Verify MinIO is running and accessible
- Check PostgreSQL connection

### 404 on import endpoints
- Make sure you're using the correct server URL (http://localhost:3000)
- Check that the assets-import route is mounted in server/src/index.ts

### Slow import
- Importing 145 images can take a few minutes
- Each image is uploaded to MinIO and registered in the database
- Be patient, check server logs for progress

## Configuration

The import uses the same MinIO and PostgreSQL configuration as the rest of the server:

```env
# PostgreSQL
DATABASE_URL=postgresql://las_flores:las_flores_dev_password@postgres-oltp:5432/las_flores

# MinIO
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=las-flores

# Prompt root (default)
PROMPT_ROOT=../content  # relative to server/ cwd; use absolute path for clarity
```

See `content/README.md` for the current per-folder layout and asset selection model.

## Files Modified

1. **server/src/routes/assets-import.ts** (NEW)
   - New route file with import endpoints

2. **server/src/index.ts** (MODIFIED)
   - Added import for assetsImportRouter
   - Mounted at /assets

3. **admin/src/app/assets/page.tsx** (MODIFIED)
   - Added "Import All Local Drafts" button in catalog view
   - Added "Import Local Drafts" button in generator view
   - Added importLocalDrafts function

## Next Steps

After importing and publishing assets:

1. **Update client code** to use the new asset URLs
2. **Test in game** to verify assets render correctly
3. **Iterate** on variants and regenerate as needed

See `content/README.md` for the current asset layout and selection model.
