# Milestone 5: Migration & Backfill

**Goal**: Migrate existing content to the new path-based model (lore_path, narrative_path, asset_paths).

**Effort**: Medium (2-3 hours)

**Prerequisites**: Milestones 1-4 complete (all features in place).

## Scope

### In Scope
- Create migration script to backfill `lore_path` and `narrative_path` for existing content
- Create migration script to backfill `asset_paths` from existing URL fields
- Add migration tracking table to record what was migrated
- Add rollback script to revert migration if needed
- Update validation to check migrated files exist

### Out of Scope
- Manual editing of migrated files (already possible via story builder)
- Asset file movement (assumes assets are already in MinIO or local)
- Content quality improvements (out of scope for migration)

## Rationale

Milestones 1-4 added the infrastructure for path-based content. This milestone migrates existing content to use it:

1. **60+ characters** currently have no `lore_path` or `narrative_path`
2. **100+ dialogues, scenes, etc.** also lack path references
3. **All assets** are referenced by MinIO URL, not relative path

Without migration, the new features (lore viewing, asset path resolution) only work for new content. Migration makes them work for existing content too.

## Migration Strategy

### Phase 1: Add Path Fields (Non-Breaking)

Add `lore_path`, `narrative_path`, and `asset_paths` to existing YAML files **without removing existing fields**. This is safe because:
- All new fields are optional in the schema
- Existing URL fields remain functional
- Migration can be run incrementally (one content type at a time)

### Phase 2: Verify Migration

Run validation to ensure:
- All new path fields point to existing files (or create stubs)
- All asset paths resolve (from local or MinIO)
- No broken references

### Phase 3: Cleanup (Optional, Future)

After verifying everything works:
- Remove old URL fields (`avatar_url`, `portrait_urls`, etc.) if desired
- Remove `lore_ref` tags if replaced by `lore_path`
- **This is optional and can be done in a future milestone**

## Implementation Steps

### Step 1: Create Migration Script

**File**: `scripts/migrate-content-paths.mjs` (new)

Create a Node.js script that:
1. Scans all YAML files in `content/`
2. For each file, derives suggested paths based on naming conventions
3. Adds `lore_path`, `narrative_path`, and `asset_paths` fields
4. Writes updated YAML back to disk
5. Logs what was changed

```javascript
#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';

const CONTENT_DIR = path.resolve(process.cwd(), 'content');
const LORE_DIR = path.resolve(process.cwd(), 'docs/lore');

// Track migration
const migrationLog = {
  timestamp: new Date().toISOString(),
  filesProcessed: 0,
  filesUpdated: 0,
  changes: [],
};

async function migrateFile(filePath) {
  const relativePath = path.relative(CONTENT_DIR, filePath);
  const content = await fs.readFile(filePath, 'utf-8');
  const data = yaml.load(content);
  
  if (!data || typeof data !== 'object') {
    console.log(`Skipping ${relativePath}: not a YAML object`);
    return;
  }

  const type = getContentTypeFromPath(filePath);
  if (!type) {
    console.log(`Skipping ${relativePath}: unknown content type`);
    return;
  }

  migrationLog.filesProcessed++;
  let updated = false;

  // Derive slug from filename
  const slug = deriveSlug(filePath, type);

  // Add lore_path
  if (!data.lore_path && shouldHaveLorePath(type)) {
    const lorePath = deriveLorePath(type, slug);
    // Only add if the file exists or we want to create a stub
    const fullLorePath = path.join(LORE_DIR, lorePath);
    try {
      await fs.access(fullLorePath);
      data.lore_path = lorePath;
      updated = true;
      migrationLog.changes.push({ file: relativePath, field: 'lore_path', value: lorePath });
    } catch {
      // Lore file doesn't exist, skip for now
    }
  }

  // Add narrative_path
  if (!data.narrative_path && shouldHaveNarrativePath(type)) {
    const narrativePath = deriveNarrativePath(type, slug);
    const fullNarrativePath = path.join(CONTENT_DIR, narrativePath);
    try {
      await fs.access(fullNarrativePath);
      data.narrative_path = narrativePath;
      updated = true;
      migrationLog.changes.push({ file: relativePath, field: 'narrative_path', value: narrativePath });
    } catch {
      // Narrative file doesn't exist, skip
    }
  }

  // Add asset_paths
  if (!data.asset_paths && shouldHaveAssetPaths(type)) {
    const assetPaths = deriveAssetPaths(type, slug);
    data.asset_paths = assetPaths;
    updated = true;
    migrationLog.changes.push({ file: relativePath, field: 'asset_paths', value: assetPaths });
  }

  if (updated) {
    const updatedYaml = yaml.dump(data, { lineWidth: -1, noRefs: true });
    await fs.writeFile(filePath, updatedYaml, 'utf-8');
    migrationLog.filesUpdated++;
    console.log(`Updated ${relativePath}`);
  }
}

function getContentTypeFromPath(filePath) {
  const normalized = filePath.toLowerCase();
  if (normalized.includes('/characters/')) return 'character';
  if (normalized.includes('/dialogues/')) return 'dialogue';
  if (normalized.includes('/scenes/')) return 'scene';
  if (normalized.includes('/missions/') || normalized.includes('/mysteries/')) return 'mission';
  if (normalized.includes('/locations/')) return 'location';
  if (normalized.includes('/stories/')) return 'story';
  if (normalized.includes('/overlays/')) return 'overlay';
  if (normalized.includes('/gigs/')) return 'gig';
  if (normalized.includes('/vault/')) return 'vault';
  if (normalized.includes('/shop/')) return 'shop_item';
  return null;
}

function deriveSlug(filePath, type) {
  const basename = path.basename(filePath, '.yaml');
  if (type === 'character') {
    return basename.replace(/^char_/, '');
  }
  return basename;
}

function shouldHaveLorePath(type) {
  return ['character', 'dialogue', 'mission', 'scene', 'location'].includes(type);
}

function shouldHaveNarrativePath(type) {
  return ['character', 'dialogue'].includes(type);
}

function shouldHaveAssetPaths(type) {
  return ['character', 'scene', 'location', 'overlay'].includes(type);
}

function deriveLorePath(type, slug) {
  if (type === 'character') {
    return `docs/lore/figures/${slug}/${slug}.md`;
  }
  // For other types, use a generic lore path
  return `docs/lore/${type}s/${slug}.md`;
}

function deriveNarrativePath(type, slug) {
  if (type === 'character') {
    return `content/characters/char_${slug}.md`;
  }
  if (type === 'dialogue') {
    return `content/dialogues/${slug}.md`;
  }
  return `content/${type}s/${slug}.md`;
}

function deriveAssetPaths(type, slug) {
  const paths = {};
  switch (type) {
    case 'character':
      paths.portrait = `characters/${slug}/portrait.png`;
      paths.biometric = `characters/${slug}/biometric.png`;
      break;
    case 'scene':
      paths.background = `scenes/${slug}/background.jpg`;
      break;
    case 'location':
      paths.image = `locations/${slug}/image.jpg`;
      paths.background = `locations/${slug}/background.jpg`;
      break;
    case 'overlay':
      paths.background = `overlays/${slug}/background.jpg`;
      break;
  }
  return paths;
}

async function main() {
  console.log('Starting content path migration...');
  
  const files = await glob(`${CONTENT_DIR}/**/*.yaml`, { absolute: true });
  console.log(`Found ${files.length} YAML files`);

  for (const file of files) {
    await migrateFile(file);
  }

  // Write migration log
  const logPath = path.resolve(process.cwd(), 'scripts/migration-log.json');
  await fs.writeFile(logPath, JSON.stringify(migrationLog, null, 2), 'utf-8');

  console.log('\nMigration complete!');
  console.log(`Files processed: ${migrationLog.filesProcessed}`);
  console.log(`Files updated: ${migrationLog.filesUpdated}`);
  console.log(`Changes: ${migrationLog.changes.length}`);
  console.log(`Log written to: ${logPath}`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

### Step 2: Create Rollback Script

**File**: `scripts/rollback-content-paths.mjs` (new)

Create a script that reverts the migration by removing the added fields:

```javascript
#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';

const CONTENT_DIR = path.resolve(process.cwd(), 'content');
const FIELDS_TO_REMOVE = ['lore_path', 'narrative_path', 'asset_paths'];

async function rollbackFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const data = yaml.load(content);
  
  if (!data || typeof data !== 'object') return;

  let updated = false;
  for (const field of FIELDS_TO_REMOVE) {
    if (field in data) {
      delete data[field];
      updated = true;
    }
  }

  if (updated) {
    const updatedYaml = yaml.dump(data, { lineWidth: -1, noRefs: true });
    await fs.writeFile(filePath, updatedYaml, 'utf-8');
    console.log(`Rolled back ${path.relative(CONTENT_DIR, filePath)}`);
  }
}

async function main() {
  console.log('Rolling back content path migration...');
  
  const files = await glob(`${CONTENT_DIR}/**/*.yaml`, { absolute: true });
  console.log(`Found ${files.length} YAML files`);

  for (const file of files) {
    await rollbackFile(file);
  }

  console.log('Rollback complete!');
}

main().catch((err) => {
  console.error('Rollback failed:', err);
  process.exit(1);
});
```

### Step 3: Create Migration Tracking Table

**File**: `server/src/database/migrations/022_migration_log.sql` (new)

Create a table to track migrations:

```sql
CREATE TABLE IF NOT EXISTS migration_log (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  files_processed INTEGER DEFAULT 0,
  files_updated INTEGER DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb
);
```

**Run the migration**:
```bash
npm run migrate # or your migration command
```

### Step 4: Add Migration Runner Script

**File**: `scripts/run-migration.mjs` (new)

Create a script that:
1. Runs the migration
2. Records the migration in the database
3. Validates the results

```javascript
#!/usr/bin/env node

import { migrateContentPaths } from './migrate-content-paths.mjs';
import { queryOLTP } from '../server/src/database/connection.js';

async function main() {
  console.log('Running content path migration...');
  
  // Run migration
  const result = await migrateContentPaths();
  
  // Record in database
  await queryOLTP(`
    INSERT INTO migration_log (migration_name, files_processed, files_updated, details)
    VALUES ($1, $2, $3, $4)
  `, [
    'content_path_migration_v1',
    result.filesProcessed,
    result.filesUpdated,
    JSON.stringify(result.changes),
  ]);

  console.log('Migration recorded in database');
  console.log('Done!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

### Step 5: Update Validation to Check Paths

**File**: `server/src/content/validate.ts` (modify)

Enhance validation to check that referenced paths exist:

```typescript
// Add to validateYAMLFile(), after schema validation:

// Check lore_path
const lorePath = data?.lore_path;
if (lorePath && typeof lorePath === 'string') {
  const fullPath = path.resolve(process.cwd(), lorePath);
  try {
    await fs.access(fullPath);
  } catch {
    warnings.push({
      file: filePath,
      message: `Lore file not found: ${lorePath}`,
      severity: 'warning',
    });
  }
}

// Check narrative_path
const narrativePath = data?.narrative_path;
if (narrativePath && typeof narrativePath === 'string') {
  const fullPath = path.join(contentDir, narrativePath);
  try {
    await fs.access(fullPath);
  } catch {
    warnings.push({
      file: filePath,
      message: `Narrative file not found: ${narrativePath}`,
      severity: 'warning',
    });
  }
}

// Check asset_paths
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

### Step 6: Create Stub Generator

**File**: `scripts/generate-lore-stubs.mjs` (new)

Create a script that generates empty lore/narrative stubs for content that has paths but no files:

```javascript
#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';

const CONTENT_DIR = path.resolve(process.cwd(), 'content');
const LORE_DIR = path.resolve(process.cwd(), 'docs/lore');

async function generateStubs() {
  const files = await glob(`${CONTENT_DIR}/**/*.yaml`, { absolute: true });
  
  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const data = yaml.load(content);
    
    if (!data || typeof data !== 'object') continue;

    // Check lore_path
    if (data.lore_path) {
      const fullPath = path.resolve(LORE_DIR, data.lore_path);
      try {
        await fs.access(fullPath);
      } catch {
        // Create stub
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        const stub = `# ${data.name || 'Untitled'}\n\n> TODO: Add lore\n`;
        await fs.writeFile(fullPath, stub, 'utf-8');
        console.log(`Created lore stub: ${data.lore_path}`);
      }
    }

    // Check narrative_path
    if (data.narrative_path) {
      const fullPath = path.join(CONTENT_DIR, data.narrative_path);
      try {
        await fs.access(fullPath);
      } catch {
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        const stub = `# ${data.name || 'Untitled'}\n\n> TODO: Add narrative\n`;
        await fs.writeFile(fullPath, stub, 'utf-8');
        console.log(`Created narrative stub: ${data.narrative_path}`);
      }
    }
  }

  console.log('Stub generation complete!');
}

generateStubs().catch((err) => {
  console.error('Stub generation failed:', err);
  process.exit(1);
});
```

## Verification

```bash
# 1. Backup existing content (important!)
git add -A && git commit -m "backup: before path migration"

# 2. Run migration script
node scripts/migrate-content-paths.mjs

# 3. Check migration log
cat scripts/migration-log.json

# 4. Run validation
npm run validate:content

# 5. Verify warnings are expected (missing lore/narrative files)
# If too many warnings, run stub generator:
node scripts/generate-lore-stubs.mjs

# 6. Re-run validation
npm run validate:content

# 7. Verify no warnings (or only expected ones)

# 8. Test in admin UI
npm run dev
# Go to http://localhost:3001/story-builder
# Generate a plan, verify lore/narrative buttons work
# Verify images load from asset_paths

# 9. If something goes wrong, rollback:
node scripts/rollback-content-paths.mjs
git add -A && git commit -m "rollback: content path migration"
```

## Rollback

If the migration causes issues:

1. **Immediate rollback**:
   ```bash
   node scripts/rollback-content-paths.mjs
   ```

2. **Git rollback** (if committed):
   ```bash
   git revert HEAD
   # or
   git reset --hard HEAD~1
   ```

3. **Database cleanup** (optional):
   ```sql
   DELETE FROM migration_log WHERE migration_name = 'content_path_migration_v1';
   ```

## Files Created

- `scripts/migrate-content-paths.mjs` (new)
- `scripts/rollback-content-paths.mjs` (new)
- `scripts/generate-lore-stubs.mjs` (new)
- `scripts/run-migration.mjs` (new)
- `server/src/database/migrations/022_migration_log.sql` (new)

## Files Modified

- `server/src/content/validate.ts` (modified — add path validation)

## Post-Migration Checklist

After running the migration:

- [ ] All YAML files have `lore_path` and/or `narrative_path` where appropriate
- [ ] All YAML files have `asset_paths` where appropriate
- [ ] Lore stubs are created for missing lore files
- [ ] Narrative stubs are created for missing narrative files
- [ ] Validation passes with no warnings (or only expected ones)
- [ ] Admin UI can view/edit lore for existing content
- [ ] Admin UI can display images from asset_paths
- [ ] Assets still load correctly (from local or MinIO)

## Next Steps

After this milestone:
- The story builder is fully functional for both new and existing content
- Future enhancements can build on the path-based model:
  - Asset sync between local and MinIO
  - Lore editing with preview
  - Content quality checks based on lore coverage