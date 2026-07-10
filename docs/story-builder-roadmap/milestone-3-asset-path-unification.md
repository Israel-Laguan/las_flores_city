# Milestone 3: Asset Path Unification

**Goal**: Store relative paths for assets in YAML instead of MinIO URLs, with the server resolving from local filesystem or MinIO transparently.

**Effort**: Medium (2-3 hours)

**Prerequisites**: Milestone 2 complete (lore path references in place).

## Scope

### In Scope
- Add `asset_paths` field to YAML schemas (relative paths for portraits, backgrounds, etc.)
- Create server endpoint `GET /api/admin/asset?path=...` that resolves from local or MinIO
- Update admin UI to use path-based asset URLs
- Add asset validation (check if referenced paths exist)
- Update ContentSkeletonGenerator to suggest asset paths

### Out of Scope
- Inline markdown editing (Milestone 4)
- Migration of existing content (Milestone 5)
- Asset generation workflow (already exists at `/assets`)

## Rationale

Currently, assets are stored in MinIO and referenced by full URL in YAML:
```yaml
avatar_url: "http://minio:9000/las-flores/portrait/diego.png"
```

This causes several problems:
1. **Environment coupling**: URLs change between dev/staging/prod
2. **Git diffs**: URL changes pollute commits
3. **Portability**: Can't move assets without updating all YAML files
4. **Local development**: Requires MinIO running even for local testing

**Solution**: Store relative paths in YAML, resolve at serve time:
```yaml
asset_paths:
  portrait: "characters/diego/portrait.png"
  background: "scenes/plaza/background.jpg"
```

The server resolves these paths:
- **Dev**: Check local `content/assets/` first, fall back to MinIO
- **Prod**: Check MinIO (or configured asset root)

## Implementation Steps

### Step 1: Update YAML Schemas

**File**: `shared/src/schemas/yaml-content.ts` (modify)

Add `asset_paths` field to relevant schemas:

```typescript
// Add to YAMLCharacterSchema
asset_paths: z.object({
  portrait: z.string().optional(),
  biometric: z.string().optional(),
  expression_strip: z.string().optional(),
  face_base: z.string().optional(),
  hair_front: z.string().optional(),
  hair_back: z.string().optional(),
}).optional(),

// Add to YAMLSceneSchema
asset_paths: z.object({
  background: z.string().optional(),
  ambient_sound: z.string().optional(),
}).optional(),

// Add to YAMLLocationSchema
asset_paths: z.object({
  image: z.string().optional(),
  background: z.string().optional(),
}).optional(),

// Add to YAMLOverlaySchema (if overlays have images)
asset_paths: z.object({
  background: z.string().optional(),
}).optional(),
```

**Note**: Keep existing URL fields (`avatar_url`, `portrait_urls`, `background_url`, etc.) for backward compatibility. During migration (Milestone 5), we'll populate `asset_paths` from existing URLs and optionally remove the URL fields.

### Step 2: Create Asset Resolver Endpoint

**File**: `server/src/routes/admin-asset.ts` (new)

Create an Express router that serves assets by relative path:

```typescript
import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import type { AuthRequest } from '../middleware/auth.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { signMinioUrl } from '../services/StorageService.js';

export const adminAssetRouter = express.Router();

adminAssetRouter.use(authAndAdminMiddleware);

const AssetPathSchema = z.string().max(500);

// GET /admin/asset?path=characters/diego/portrait.png
adminAssetRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { path: assetPath } = req.query;
    
    if (!assetPath || typeof assetPath !== 'string') {
      res.status(400).json({ success: false, error: 'path query parameter is required', timestamp: new Date().toISOString() });
      return;
    }

    const parsed = AssetPathSchema.safeParse(assetPath);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid asset path', timestamp: new Date().toISOString() });
      return;
    }

    // Security: prevent path traversal
    const normalizedPath = path.normalize(parsed.data);
    if (normalizedPath.includes('..')) {
      res.status(403).json({ success: false, error: 'Access denied', timestamp: new Date().toISOString() });
      return;
    }

    // Strategy 1: Check local filesystem first (dev mode)
    const localAssetRoot = path.resolve(process.cwd(), 'content/assets');
    const localPath = path.join(localAssetRoot, normalizedPath);
    
    try {
      await fs.access(localPath);
      const imageBuffer = await fs.readFile(localPath);
      const contentType = localPath.endsWith('.jpg') || localPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(imageBuffer);
      return;
    } catch {
      // Local file not found, try MinIO
    }

    // Strategy 2: Check MinIO (prod mode)
    const minioKey = `las-flores/${normalizedPath}`;
    try {
      const signedUrl = await signMinioUrl(minioKey, 300);
      const resp = await fetch(signedUrl, { signal: AbortSignal.timeout(15000) });
      if (resp.ok) {
        const imageBuffer = Buffer.from(await resp.arrayBuffer());
        const contentType = minioKey.endsWith('.jpg') || minioKey.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(imageBuffer);
        return;
      }
    } catch {
      // MinIO fetch failed
    }

    // Not found in either source
    res.status(404).json({ success: false, error: 'Asset not found', timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[admin-asset] GET / error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch asset',
      timestamp: new Date().toISOString(),
    });
  }
});
```

**Register the router** in `server/src/routes/index.ts`:

```typescript
import { adminAssetRouter } from './admin-asset.js';
// ...
adminRouter.use('/admin/asset', adminAssetRouter);
```

### Step 3: Create Admin Proxy Route

**File**: `admin/src/app/api/admin/asset/route.ts` (new)

```typescript
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path');
    
    if (!path) {
      return NextResponse.json({ success: false, error: 'path is required' }, { status: 400 });
    }

    // Proxy to server (which will resolve from local or MinIO)
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const cookieStore = await import('next/headers').then(m => m.cookies());
    const sessionCookie = cookieStore.get('jwt_session');
    
    const headers = new Headers();
    if (sessionCookie) {
      headers.set('Cookie', `jwt_session=${sessionCookie.value}`);
    }

    const res = await fetch(`${serverUrl}/admin/asset?path=${encodeURIComponent(path)}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const error = await res.json();
      return NextResponse.json(error, { status: res.status });
    }

    // Return the image buffer directly
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('Content-Type') || 'image/png';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Admin asset proxy error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch asset',
    }, { status: 500 });
  }
}
```

### Step 4: Update ContentCard to Use Asset Paths

**File**: `admin/src/app/story-builder/components/ContentCard.tsx` (modify)

Replace the "Generate Image" button placeholder with actual image loading from path:

```typescript
// Add image loading state
const [imageError, setImageError] = useState(false);

// For each asset need, resolve the path:
function getAssetImageUrl(assetPath: string): string {
  if (!assetPath) return '';
  return `/api/admin/asset?path=${encodeURIComponent(assetPath)}`;
}

// In the asset section, replace placeholder with:
{item.assetNeeds.map((need, i) => {
  // Try to get the path from item.fields.asset_paths
  const assetPaths = item.fields.asset_paths || {};
  const assetPath = assetPaths[need.promptType] || assetPaths[need.targetField];
  const imageUrl = assetPath ? getAssetImageUrl(assetPath) : null;

  return (
    <div key={i} style={{ marginBottom: '0.75rem' }}>
      <div style={{ marginBottom: '0.25rem' }}>
        <span style={styles.assetTag}>
          {need.promptType}: {need.targetField}
        </span>
        <span style={{ color: '#888', fontSize: '0.75rem' }}>
          [{need.status}]
        </span>
      </div>
      
      {imageUrl && !imageError ? (
        <img
          src={imageUrl}
          alt={need.promptType}
          style={styles.imagePreview}
          onError={() => setImageError(true)}
        />
      ) : (
        <div style={styles.imagePlaceholder}>
          {assetPath ? 'Failed to load image' : 'No image path specified'}
        </div>
      )}
      
      <div style={{ marginTop: '0.5rem' }}>
        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={() => window.open('/assets', '_blank')}
        >
          {assetPath ? 'Replace Image' : 'Generate Image'}
        </button>
        {assetPath && (
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => {
              // Remove the asset path
              const newPaths = { ...assetPaths };
              delete newPaths[need.promptType];
              onFieldChange(index, 'asset_paths', newPaths);
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
})}
```

### Step 5: Update ContentSkeletonGenerator

**File**: `server/src/services/ContentSkeletonGenerator.ts` (modify)

Add `asset_paths` to generated YAML:

```typescript
// In each template function, add asset_paths based on type:
character: (item) => yaml.dump({
  // ... existing fields ...
  asset_paths: {
    portrait: `characters/${item.slug}/portrait.png`,
    biometric: `characters/${item.slug}/biometric.png`,
  },
}, YAML_OPTIONS),

scene: (item) => yaml.dump({
  // ... existing fields ...
  asset_paths: {
    background: `scenes/${item.slug}/background.jpg`,
  },
}, YAML_OPTIONS),

location: (item) => yaml.dump({
  // ... existing fields ...
  asset_paths: {
    image: `locations/${item.slug}/image.jpg`,
    background: `locations/${item.slug}/background.jpg`,
  },
}, YAML_OPTIONS),
```

### Step 6: Add Asset Path Validation

**File**: `server/src/content/validate.ts` (modify)

Add validation for `asset_paths`:

```typescript
// In validateYAMLFile(), after schema validation:
const assetPaths = data?.asset_paths;
if (assetPaths && typeof assetPaths === 'object') {
  const localAssetRoot = path.resolve(contentDir, 'assets');
  
  for (const [assetType, assetPath] of Object.entries(assetPaths)) {
    if (typeof assetPath !== 'string') continue;
    
    const fullPath = path.join(localAssetRoot, assetPath);
    try {
      await fs.access(fullPath);
    } catch {
      warnings.push({
        file: filePath,
        message: `Asset file not found: ${assetPath} (${assetType})`,
        severity: 'warning',
      });
    }
  }
}
```

### Step 7: Update Field Definitions

**File**: `admin/src/app/story-builder/components/FieldDefinitions.ts` (modify)

Add `asset_paths` as a special field type (not directly editable in text form, but shown in the image section):

```typescript
// No changes needed to FIELD_DEFINITIONS — asset_paths is handled by ContentCard
// The image section already reads from item.fields.asset_paths
```

## Verification

```bash
# 1. Lint admin and server
npm run lint --workspace=admin
npm run lint --workspace=server

# 2. Build both
npm run build --workspace=admin
npm run build --workspace=server

# 3. Rebuild server container (if using Docker)
docker compose build server && docker compose up -d server

# 4. Verify server health
docker exec las-flores-server wget -qO- http://localhost:3000/health

# 5. Manual test:
#    - Go to http://localhost:3001/story-builder
#    - Generate a plan for a character
#    - Verify Step 2 shows asset paths in the image section
#    - Place an image at content/assets/characters/diego/portrait.png
#    - Verify the image loads in the card
#    - Remove the local image, upload to MinIO at las-flores/characters/diego/portrait.png
#    - Verify the image still loads (MinIO fallback)
#    - Verify validation warns if asset path doesn't exist
```

## Rollback

1. Revert changes to `shared/src/schemas/yaml-content.ts`
2. Revert changes to `server/src/services/ContentSkeletonGenerator.ts`
3. Delete `server/src/routes/admin-asset.ts`
4. Delete `admin/src/app/api/admin/asset/route.ts`
5. Revert changes to `admin/src/app/story-builder/components/ContentCard.tsx`
6. Revert changes to `server/src/content/validate.ts`
7. Revert changes to `server/src/routes/index.ts`
8. Commit: `revert: rollback Milestone 3`

## Files Modified

- `shared/src/schemas/yaml-content.ts` (modified)
- `server/src/services/ContentSkeletonGenerator.ts` (modified)
- `server/src/content/validate.ts` (modified)
- `server/src/routes/admin-asset.ts` (new)
- `server/src/routes/index.ts` (modified — register new router)
- `admin/src/app/api/admin/asset/route.ts` (new)
- `admin/src/app/story-builder/components/ContentCard.tsx` (modified)

## Next Steps

After this milestone:
- Milestone 4 adds inline markdown editing (edit lore MD directly from content cards)
- Milestone 5 migrates existing content to use asset_paths