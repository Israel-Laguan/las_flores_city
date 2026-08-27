import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import crypto from 'crypto';
import * as yaml from 'js-yaml';
import type pg from 'pg';
import type { ContentType } from '@las-flores/shared';
import { oltpPool, queryOLTP } from '@las-flores/infra';
import { invalidatePattern } from '@las-flores/infra';
import { validateContent } from './validate.js';
import { processContentFile } from './upsert.js';
import { compileAllDialogueTrees } from './compiler.js';
import { extractContentIds, getContentTypeFromPath, getProcessingOrder } from './path-utils.js';
import { ZERO_UUID } from './uuid-utils.js';
import { buildSnapshotsForAllTrees } from '../services/SnapshotService.js';

export { extractContentIds };

const CONTENT_TYPE_TABLE: Record<ContentType, string> = {
  character: 'characters',
  dialogue: 'dialogue_trees',
  overlay: 'dialogue_overlays',
  scene: 'scenes',
  location: 'scenes',
  gig: 'gigs',
  mission: 'mysteries',
  story: 'story_beats',
  vault: 'vault_items',
  shop_item: 'shop_items',
  map_tile: 'map_tiles',
  story_beat: 'story_beats',
};

export interface MigrationResult {
  success: boolean;
  filesProcessed: number;
  filesSkipped: number;
  filesFailed: number;
  errors: string[];
  appliedMigrations: AppliedMigration[];
}

export interface AppliedMigration {
  filePath: string;
  contentType: ContentType;
  contentId: string;
  action: 'created' | 'updated' | 'skipped';
}

async function calculateChecksum(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function isTargetContentPresent(contentType: ContentType, ids: string[]): Promise<boolean> {
  if (ids.length === 0) {
    return false;
  }

  // story_beat and story (beats-based) use slug as PK (not UUID) — check by slug count
  if (contentType === 'story_beat' || contentType === 'story') {
    const slugs = ids; // for story_beat/story, ids array holds slugs (comma-joined, split by caller)
    const result = await queryOLTP<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM story_beats WHERE slug = ANY($1::text[])`,
      [slugs]
    );
    return result.rows[0].count === slugs.length;
  }

  const table = CONTENT_TYPE_TABLE[contentType];
  const result = await queryOLTP<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM ${table} WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return result.rows[0].count === ids.length;
}

async function areContentReferencesPresent(contentType: ContentType, data: Record<string, unknown>): Promise<boolean> {
  if (contentType === 'vault') {
    const items = (data.vault_items as Array<{ id: string; mission_id?: string }>) || [];

    for (const item of items) {
      if (!item.mission_id) {
        continue;
      }

      const mysteryResult = await queryOLTP('SELECT id FROM mysteries WHERE id = $1', [item.mission_id]);
      if (mysteryResult.rows.length === 0) {
        return false;
      }

      const vaultResult = await queryOLTP<{ mystery_id: string | null }>(
        'SELECT mystery_id FROM vault_items WHERE id = $1',
        [item.id]
      );
      if (vaultResult.rows.length > 0 && vaultResult.rows[0].mystery_id !== item.mission_id) {
        return false;
      }
    }

    return true;
  }

  if (contentType === 'overlay') {
    const mysteryId = (data as { mission_id?: string }).mission_id;
    if (!mysteryId) {
      return true;
    }

    const result = await queryOLTP('SELECT id FROM mysteries WHERE id = $1', [mysteryId]);
    return result.rows.length > 0;
  }

  return true;
}

async function shouldSkipMigration(filePath: string, contentDir: string, checksum: string): Promise<boolean> {
  const relativePath = path.relative(contentDir, filePath);
  // M48 fix: compare the stored checksum against the file's CURRENT
  // checksum. The previous query matched on path OR checksum but never
  // compared them, so any edited file whose row already existed was
  // permanently skipped — YAML changes never re-published to the CDN.
  const result = await queryOLTP<{ id: string; file_checksum: string }>(
    'SELECT id, file_checksum FROM migration_log WHERE (file_path = $1 OR file_path = $2) ORDER BY applied_at DESC LIMIT 1',
    [filePath, relativePath]
  );

  if (result.rows.length === 0) {
    return false;
  }

  if (result.rows[0].file_checksum !== checksum) {
    console.log(`🔁 Checksum changed: ${relativePath} — reprocessing`);
    return false;
  }

  const contentType = getContentTypeFromPath(filePath);
  if (!contentType) {
    return false;
  }

  const content = await fs.readFile(filePath, 'utf-8');
  const data = yaml.load(content) as Record<string, unknown>;
  const ids = extractContentIds(contentType, data);

  if (await isTargetContentPresent(contentType, ids) && await areContentReferencesPresent(contentType, data)) {
    return true;
  }

  console.warn(
    `⚠️  Drift detected: migration_log entry exists but target row(s) missing — reprocessing ${relativePath}`
  );
  return false;
}

async function recordMigration(
  filePath: string,
  contentDir: string,
  checksum: string,
  contentType: ContentType,
  contentId: string
): Promise<void> {
  const relativePath = path.relative(contentDir, filePath);
  await queryOLTP(
    'DELETE FROM migration_log WHERE file_path = $1 OR file_path = $2',
    [relativePath, filePath]
  );
  await queryOLTP(
    'INSERT INTO migration_log (file_path, file_checksum, content_type, content_id) VALUES ($1, $2, $3, $4)',
    [relativePath, checksum, contentType, contentId]
  );
}

async function acquireMigrationLock(): Promise<pg.PoolClient | null> {
  let client: pg.PoolClient;
  try {
    client = await oltpPool.connect();
  } catch (error) {
    console.error('[migrate] Failed to acquire content migration lock:', error);
    return null;
  }

  try {
    // Blocking advisory lock: wait for the global content-migration lock to be
    // released rather than try-and-give-up. Under concurrent invocations (e.g.
    // parallel integration-test workers sharing one Postgres instance, or a
    // second admin-triggered migration) the later caller waits for the current
    // holder to finish instead of spurious `success: false`. The advisory key
    // `content_migration` is also used by tests/helpers/schemaLock.ts so that a
    // migration here serializes against other suites' schema DDL too.
    await client.query(`SELECT pg_advisory_lock(hashtext('content_migration'))`);
    return client;
  } catch (error) {
    console.error('[migrate] Failed to acquire content migration lock:', error);
    // The lock query failed, so we cannot know whether the session actually
    // holds the lock (e.g. the statement was cancelled after the server took
    // it). Destroy the connection rather than returning it to the pool so any
    // session-level lock is dropped with it, and so the checked-out client is
    // never leaked on this error path.
    client.release(true);
    return null;
  }
}

async function releaseMigrationLock(client: pg.PoolClient): Promise<void> {
  try {
    await client.query(`SELECT pg_advisory_unlock(hashtext('content_migration'))`);
  } catch (error) {
    client.release(true);
    throw error;
  }
  client.release();
}

async function dropDialogueTreeFKConstraints(): Promise<void> {
  await queryOLTP('ALTER TABLE dialogue_trees DROP CONSTRAINT IF EXISTS dialogue_trees_character_id_fkey');
  await queryOLTP('ALTER TABLE dialogue_trees DROP CONSTRAINT IF EXISTS dialogue_trees_scene_id_fkey');
  await queryOLTP('ALTER TABLE dialogue_trees DROP CONSTRAINT IF EXISTS dialogue_trees_mission_id_fkey');
}

async function recreateDialogueTreeFKConstraints(): Promise<void> {
  // Scrub any placeholder zero-UUID FK values left by skipped or legacy
  // migrations so re-adding the constraints does not fail on stale rows.
  for (const column of ['scene_id', 'character_id', 'mission_id']) {
    await queryOLTP(
      `UPDATE dialogue_trees SET ${column} = NULL WHERE ${column} = $1`,
      [ZERO_UUID],
    );
  }
  await queryOLTP('ALTER TABLE dialogue_trees ADD CONSTRAINT dialogue_trees_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL');
  await queryOLTP('ALTER TABLE dialogue_trees ADD CONSTRAINT dialogue_trees_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE SET NULL');
  await queryOLTP('ALTER TABLE dialogue_trees ADD CONSTRAINT dialogue_trees_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES mysteries(id) ON DELETE SET NULL');
}

async function discoverContentFiles(contentDir: string, files?: string[]): Promise<string[]> {
  let allFiles: string[];
  if (files && files.length > 0) {
    allFiles = files.map(f => path.isAbsolute(f) ? f : path.resolve(contentDir, f));
    console.log(`📁 Scoped migration: ${allFiles.length} specific file(s)`);
  } else {
    const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
    const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
    allFiles = [...yamlFiles, ...ymlFiles];
  }
  return getProcessingOrder(allFiles);
}

async function invalidateCaches(): Promise<void> {
  const patterns = ['dialogue:*', 'map:*', 'story_beats:*'];
  for (const pattern of patterns) {
    try {
      await invalidatePattern(pattern);
      console.log(`🗑️  Cleared ${pattern.replace('*', '')}caches`);
    } catch (error: any) {
      console.error('⚠️  Cache invalidation error (non-fatal):', error.message);
    }
  }
}

export async function migrateContent(contentDir: string, files?: string[]): Promise<MigrationResult> {
  console.log(`🚀 Starting content migration from: ${contentDir}`);

  const result: MigrationResult = {
    success: true,
    filesProcessed: 0,
    filesSkipped: 0,
    filesFailed: 0,
    errors: [],
    appliedMigrations: [],
  };

  const lockClient = await acquireMigrationLock();
  if (!lockClient) {
    console.log('⏳ Another migration is in progress — skipping this run.');
    result.success = false;
    result.errors.push('Another content migration is already running');
    return result;
  }

  try {
    console.log('🔍 Validating content...');
    // Use schema-only validation to skip DB/Redis cross-reference checks.
    // The story_beats registry is populated by this very migration run, so
    // cross-references would fail on a fresh database. Full cross-reference
    // validation is performed by the admin UI (admin-content.ts), not here.
    const validationResult = await validateContent(contentDir, true);

    if (!validationResult.valid) {
      result.success = false;
      result.errors = validationResult.errors
        .filter(e => e.severity === 'error')
        .map(e => `${e.file}: ${e.message}`);
      return result;
    }

    if (validationResult.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      validationResult.warnings.forEach(w => console.log(`  - ${w}`));
    }

    const allFiles = await discoverContentFiles(contentDir, files);
    console.log(`📁 Found ${allFiles.length} content files`);

    console.log('🔓 Temporarily dropping dialogue_trees FK constraints...');
    await dropDialogueTreeFKConstraints();

    try {
      for (const file of allFiles) {
        if (!getContentTypeFromPath(file)) continue;

        try {
          const checksum = await calculateChecksum(file);

          if (await shouldSkipMigration(file, contentDir, checksum)) {
            console.log(`⏭️  Skipping (unchanged): ${path.relative(contentDir, file)}`);
            result.filesSkipped++;
            continue;
          }

          console.log(`📦 Processing: ${path.relative(contentDir, file)}`);
          const migration = await processContentFile(file);

          const logContentId = migration.contentId.split(',')[0];
          await recordMigration(file, contentDir, checksum, migration.contentType, logContentId);

          result.filesProcessed++;
          result.appliedMigrations.push(migration);

          console.log(`✅ Applied: ${migration.contentType} - ${migration.contentId}`);
        } catch (error: any) {
          result.filesFailed++;
          result.errors.push(`${path.relative(contentDir, file)}: ${error.message}`);
          console.error(`❌ Failed: ${path.relative(contentDir, file)} - ${error.message}`);
        }
      }
    } finally {
      console.log('🔒 Re-creating dialogue_trees FK constraints...');
      await recreateDialogueTreeFKConstraints();
    }

    // Full (non-scoped) migrations bootstrap the story_beats registry during
    // this run, so up-front validation used schema-only mode (to avoid
    // cross-references failing against an empty registry). Now that the
    // registry is populated, re-run full cross-reference validation and fail
    // the migration if any dialogue/scene references an unknown beat slug.
    // Scoped migrations (files provided) are skipped here: they run on an
    // already-initialized DB where out-of-scope beats legitimately vary, and
    // the admin UI (admin-content.ts) performs full validation for them.
    if (!files || files.length === 0) {
      try {
        const crossValidation = await validateContent(contentDir);
        if (!crossValidation.valid) {
          result.success = false;
          const crossErrors = crossValidation.errors
            .filter(e => e.severity === 'error')
            .map(e => `Cross-reference (post-migration): ${e.file}: ${e.message}`);
          result.errors.push(...crossErrors);
          console.error('❌ Post-migration cross-reference validation failed:', crossErrors);
        }
      } catch (error: any) {
        result.success = false;
        result.errors.push(`Post-migration cross-reference validation failed: ${error.message}`);
        console.error('❌ Post-migration cross-reference validation failed:', error.message);
      }
    }

    await runPostMigrationTasks(result);
    return result;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Migration failed: ${error.message}`);
    console.error('❌ Migration failed:', error);
    return result;
  } finally {
    await releaseMigrationLock(lockClient);
  }
}

async function runPostMigrationTasks(result: MigrationResult): Promise<void> {
  console.log('\n📊 Migration Summary:');
  console.log(`  ✅ Processed: ${result.filesProcessed}`);
  console.log(`  ⏭️  Skipped: ${result.filesSkipped}`);
  console.log(`  ❌ Failed: ${result.filesFailed}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  try {
    console.log('\n🔄 Compiling dialogue chunks...');
    const compileResult = await compileAllDialogueTrees();
    console.log(`   ${compileResult.trees} trees → ${compileResult.chunks} chunks (${compileResult.failed} failed)`);
    if (compileResult.failed > 0) {
      result.errors.push(`Chunk compiler: ${compileResult.failed} tree(s) failed to compile`);
    }
  } catch (error: any) {
    console.error('❌ Chunk compilation failed (non-fatal):', error.message);
    result.errors.push(`Chunk compilation failed: ${error.message}`);
  }

  // M30 Phase A: Build pre-resolved overlay snapshots after chunk compilation.
  // This runs under the same content_migration advisory lock held by the caller.
  try {
    console.log('\n📸 Building pre-resolved overlay snapshots (M30 Phase A)...');
    const snapshotResult = await buildSnapshotsForAllTrees();
    console.log(
      `   ${snapshotResult.totalTrees} trees → ${snapshotResult.totalSnapshots} snapshots (${snapshotResult.errors.length} errors)`
    );
    if (snapshotResult.errors.length > 0) {
      // Snapshot pre-computation is an optimization (M30 Phase A). Its errors must
      // NOT fail the content migration: the compiler publishes content_urls that
      // the live resolver can still load on-demand. Log snapshot errors as
      // warnings so migration success is not coupled to MinIO availability during
      // snapshot publication. The live resolver falls back to on-demand merge
      // for any state that lacks a pre-resolved snapshot.
      console.warn(
        `   [non-fatal] ${snapshotResult.errors.length} snapshot error(s) — ` +
        `live resolver will handle these trees on-demand:`,
        snapshotResult.errors.join(', ')
      );
    }
  } catch (error: any) {
    console.warn('⚠️ Snapshot compilation failed (non-fatal — will resolve live):', error.message);
  }

  await invalidateCaches();

  if (result.filesFailed > 0 || result.errors.length > 0) {
    result.success = false;
  }
}
