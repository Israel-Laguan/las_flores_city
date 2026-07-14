# Asset Generation Pipeline — QA Testing Prompt

## Context for QA Testing

You are testing the admin-side asset generation pipeline for Las Flores 2077. The system generates UI assets (tiles, overlays, backgrounds, portraits, phone icons) using AI image generation (NVIDIA NIM FLUX.2 Klein primary, Pollinations fallback).

## Prerequisites

Before starting QA, ensure:
1. PostgreSQL OLTP is running on port 5434
2. MinIO is running on port 9000
3. Server container is built and can start
4. Admin panel can be built
5. `NVIDIA_API_KEY` is set in `.env`

## Setup Instructions

### 1. Start Infrastructure

```bash
# Start PostgreSQL OLTP
podman run -d --name las-flores-postgres-oltp \
  --network las-flores-net -p 5434:5432 \
  -v postgres-oltp-data:/var/lib/postgresql/data \
  -e POSTGRES_DB=las_flores \
  -e POSTGRES_USER=las_flores \
  -e POSTGRES_PASSWORD=las_flores_dev_password \
  docker.io/library/postgres:16-alpine

# Start MinIO
podman run -d --name las-flores-minio \
  --network las-flores-net -p 9000:9000 -p 9001:9001 \
  -v minio-data:/data \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  docker.io/minio/minio:latest server /data --console-address ":9001"

# Wait for them to be healthy (30 seconds)
sleep 30
```

### 2. Run Database Migrations

```bash
# Apply migrations to create asset_bases and asset_variants tables
podman exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores <<'EOF'
BEGIN;
CREATE TABLE IF NOT EXISTS asset_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_rel TEXT NOT NULL,
    proposal_index INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    seed BIGINT,
    chosen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    asset_type TEXT,
    prompt_text TEXT,
    negative_prompt TEXT,
    width INTEGER,
    height INTEGER,
    final_path TEXT
);
CREATE TABLE IF NOT EXISTS asset_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_id UUID NOT NULL REFERENCES asset_bases(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    image_path TEXT NOT NULL,
    i2i_strength NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    prompt_text TEXT,
    negative_prompt TEXT,
    width INTEGER,
    height INTEGER,
    final_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_asset_bases_prompt_rel ON asset_bases(prompt_rel);
CREATE INDEX IF NOT EXISTS idx_asset_variants_base_id ON asset_variants(base_id);
CREATE INDEX IF NOT EXISTS idx_asset_bases_final_path ON asset_bases(final_path) WHERE final_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_variants_final_path ON asset_variants(final_path) WHERE final_path IS NOT NULL;
COMMIT;
EOF
```

### 3. Build and Start Server

```bash
# Build server image (if not already built)
podman build -f server/Dockerfile -t las-flores-server .

# Run server
podman run -d --name las-flores-server \
  --network las-flores-net -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e DATABASE_URL=postgresql://las_flores:las_flores_dev_password@las-flores-postgres-oltp:5432/las_flores \
  -e ANALYTICS_DATABASE_URL=postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics \
  -e REDIS_URL=redis://localhost:6379 \
  -e MINIO_ENDPOINT=las-flores-minio \
  -e MINIO_PORT=9000 \
  -e MINIO_ACCESS_KEY=minioadmin \
  -e MINIO_SECRET_KEY=minioadmin \
  -e JWT_SECRET=dev-secret \
  -e NVIDIA_API_KEY=YOUR_NVIDIA_API_KEY_HERE \
  las-flores-server

# Wait for server to start
sleep 10
```

### 4. Verify Server Health

```bash
# Check server health
podman exec las-flores-server wget -qO- http://localhost:3000/health
# Expected: {"success":true,"data":{"status":"healthy",...}}
```

### 5. Start Dashboard Panel

```bash
# In a new terminal, from the project root
npm run dev --workspace=dashboard
# This will start on http://localhost:3001
```

## Manual QA Test Cases

### Test Case 1: Prompt Catalog Loads

**Steps:**
1. Navigate to `http://localhost:3001/assets`
2. Wait for page to load

**Expected Results:**
- ✅ Page displays "Asset Generation Pipeline" heading
- ✅ "What do you want to create?" section is visible
- ✅ Three category cards appear:
  - 🗺️ Isometric Map
  - 🎭 VN Interface
  - 📱 Phone & Terminal
- ✅ Each category shows asset entries (e.g., "app_misiones", "lm_teatro_nacional")
- ✅ Each entry shows: name, asset_type, dimensions, base_count, variant_count
- ✅ No error messages displayed

**Pass Criteria:** Catalog loads with all 51 assets across 3 categories

---

### Test Case 2: Generate Base Proposals

**Steps:**
1. Click on "📱 Phone & Terminal" category
2. Click on "app_misiones" entry
3. Click "Generate 4 Bases" button
4. Wait for generation (30-60 seconds)

**Expected Results:**
- ✅ Page transitions to generator view
- ✅ "Step 1: Generate Base Proposals" section is visible
- ✅ 4 base proposal cards appear in a grid
- ✅ Each card shows:
  - Image preview (generated icon)
  - Proposal number (#1, #2, #3, #4)
  - Random seed value
  - "Approve" button
- ✅ Images load correctly (no broken images)
- ✅ Loading state shows during generation

**Pass Criteria:** 4 distinct base images are generated and displayed

---

### Test Case 3: Approve a Base

**Steps:**
1. Review the 4 base proposals
2. Click "Approve" on the best proposal
3. Observe the UI changes

**Expected Results:**
- ✅ Clicked base gets green border (2px solid #00ff00)
- ✅ "✓ Chosen" badge appears on approved base
- ✅ Other bases show "Approve" button
- ✅ Only ONE base has the "chosen" status at a time
- ✅ "Step 2: Generate Variants (i2i)" section appears after approval

**Pass Criteria:** Base approval works correctly, variants section appears

---

### Test Case 4: Generate Variant (i2i)

**Steps:**
1. In "Step 2: Generate Variants (i2i)" section:
   - Verify variant name is pre-filled (e.g., "night" or "alt_color")
   - Verify variant prompt is pre-filled from .prompt.md file
   - Adjust i2i strength slider to 0.7
2. Click "Generate Variant"
3. Wait for generation (20-40 seconds)

**Expected Results:**
- ✅ Variant form is pre-filled with data from .prompt.md
- ✅ i2i strength slider shows current value (0.70)
- ✅ Loading state shows during generation
- ✅ Variant appears in "Generated Variants" grid below
- ✅ Variant card shows:
  - Generated image
  - Variant name
  - i2i strength value
  - "Publish" button
- ✅ Image is visually similar to base but with variant changes (e.g., different color)

**Pass Criteria:** Variant is generated using i2i from the chosen base

---

### Test Case 5: Publish Base to MinIO

**Steps:**
1. Scroll to "Step 3: Publish Approved Base"
2. Click "Publish Base to MinIO"
3. Wait for copy operation
4. Note the alert message with URL

**Expected Results:**
- ✅ Alert shows: "Published to: http://localhost:9000/las-flores/phone/app_misiones.png"
- ✅ URL follows convention: `las-flores/<asset_type>/<name>.png`
- ✅ Image is accessible at the URL
- ✅ Database `final_path` field is updated

**Pass Criteria:** Base is copied to final MinIO path

---

### Test Case 6: Publish Variant to MinIO

**Steps:**
1. In "Generated Variants" grid, click "Publish" on a variant
2. Wait for copy operation
3. Note the alert message with URL

**Expected Results:**
- ✅ Alert shows: "Published to: http://localhost:9000/las-flores/phone/app_misiones__night.png"
- ✅ URL follows convention: `las-flores/<asset_type>/<name>__<variant>.<ext>`
- ✅ Image is accessible at the URL
- ✅ Database `final_path` field is updated

**Pass Criteria:** Variant is copied to final MinIO path

---

### Test Case 7: Multiple Asset Types

**Steps:**
1. Return to catalog view
2. Test generating assets for different types:
   - Isometric Map tile (e.g., "tile_street")
   - VN portrait (e.g., "portrait_alex")
   - VN background (e.g., "bg_puerto_noche")

**Expected Results:**
- ✅ All asset types load correctly
- ✅ Dimensions are correct for each type:
  - Tiles: 1024×1024
  - Portraits: 832×1248
  - Backgrounds: 1392×752
- ✅ Generation works for all types
- ✅ Publish paths follow conventions:
  - Tiles → `las-flores/tiles/`
  - Portraits → `las-flores/portraits/`
  - Backgrounds → `las-flores/backgrounds/`

**Pass Criteria:** All asset types work correctly

---

### Test Case 8: Error Handling

**Steps:**
1. Test with invalid prompt_rel (manually call API):
```bash
curl -X POST http://localhost:3000/assets/generate-bases \
  -H "Content-Type: application/json" \
  -d '{"prompt_rel": "invalid/not_exist", "count": 4}'
```

**Expected Results:**
- ✅ Returns 404 status
- ✅ Error message: "Prompt file not found: invalid/not_exist"

**Pass Criteria:** Proper error handling for invalid inputs

---

### Test Case 9: Image Proxy Endpoint

**Steps:**
1. After generating a base, get its ID from the database:
```bash
podman exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores -c "SELECT id FROM asset_bases LIMIT 1;"
```
2. Access the image proxy:
```bash
curl -I http://localhost:3000/assets/image/<BASE_ID>
```

**Expected Results:**
- ✅ Returns 200 status
- ✅ Content-Type header is set (image/png or image/jpeg)
- ✅ Cache-Control header is set
- ✅ Image bytes are returned

**Pass Criteria:** Image proxy serves images correctly

---

### Test Case 10: Prompt Catalog API

**Steps:**
1. Call the prompt catalog endpoint:
```bash
curl http://localhost:3000/assets/prompt-catalog | jq .
```

**Expected Results:**
- ✅ Returns success: true
- ✅ data.categories is an array with 3 categories
- ✅ Each category has entries array
- ✅ Each entry has: prompt_rel, name, asset_type, dimensions, variants
- ✅ Total entries across all categories = 51

**Pass Criteria:** Prompt catalog returns all 51 assets

---

## Automated Test Checklist

After manual QA passes, create automated tests for:

### Server Tests (`server/tests/`)

1. **`assets.test.ts`** — Route integration tests:
   - `GET /assets/prompt-catalog` — returns 200 with categories
   - `POST /assets/generate-bases` — creates bases with valid prompt_rel
   - `POST /assets/generate-bases` — returns 404 for invalid prompt_rel
   - `POST /assets/approve-base` — marks base as chosen
    - `POST /assets/approve-base` — clears the chosen flag on the previous base for the same prompt_rel
   - `POST /assets/generate-variants` — creates variant with i2i
   - `POST /assets/publish` — copies to final path
   - `GET /assets/image/:id` — returns image bytes
   - `GET /assets/list` — returns bases and variants
   - `GET /assets/list-all` — returns group summaries

2. **`AssetGenerationService.test.ts`** — Service unit tests:
   - `generateBaseImage()` — calls NIM with correct params
   - `generateBaseImage()` — falls back to Pollinations on failure
   - `generateVariantImage()` — fetches base image, passes as base64
   - `generateVariantImage()` — falls back to Pollinations i2i
   - `fetchImageAsBase64()` — handles s3:// URLs
   - Token bucket rate limiting works

### Test Data Requirements

- Use dedicated UUIDs for test fixtures
- Clean up in `afterAll` hooks
- Mock NIM and Pollinations API calls (don't hit real APIs in tests)
- Use test database (separate from dev)

## Known Issues / Limitations

1. **NIM i2i strength parameter**: NIM FLUX.2 Klein may not support the `strength` parameter. If it ignores it, the fallback to Pollinations will also ignore it. This is acceptable for MVP.

2. **Pollinations i2i**: Pollinations `&image=` parameter may not work as true i2i. It might just use the image as a reference. This is acceptable as a fallback.

3. **Rate limits**: NIM has ~35 RPM client-side limit. Tests that hit real NIM will be slow.

4. **Content filtering**: Some prompts may trigger NIM's content filter. The system falls back to Pollinations automatically.

## Success Criteria

- [ ] All 10 manual test cases pass
- [ ] Server starts without errors
- [ ] Admin UI loads without errors
- [ ] Can generate bases for all 3 categories
- [ ] Can approve a base
- [ ] Can generate variants via i2i
- [ ] Can publish assets to MinIO
- [ ] Images are accessible via proxy endpoint
- [ ] Prompt catalog returns all 51 assets
- [ ] Error handling works for invalid inputs

## Next Steps After QA

1. Fix any bugs found during QA
2. Implement automated tests
3. Run full test suite: `npm run test --workspace=server`
4. Deploy to production environment
5. Proceed to Step 3: Client Integration (update client code to use generated assets)

## Quick Commands Reference

```bash
# Check server logs
podman logs las-flores-server

# Check server health
podman exec las-flores-server wget -qO- http://localhost:3000/health

# Query database
podman exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores -c "SELECT * FROM asset_bases;"

# List MinIO buckets
podman exec las-flores-minio mc ls local

# Restart server
podman restart las-flores-server

# View server container IP
podman inspect las-flores-server | jq '.[0].NetworkSettings.Networks'