import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import crypto from 'crypto';
import yaml from 'js-yaml';
import type { ContentType } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { invalidatePattern } from '../database/redis.js';
import { validateContent } from './validate.js';
import { processContentFile } from './upsert.js';
import { compileAllDialogueTrees } from './compiler.js';

const CONTENT_TYPE_TABLE: Record<ContentType, string> = {
  character: 'characters',
  dialogue: 'dialogue_trees',
  overlay: 'dialogue_overlays',
  scene: 'scenes',
  location: 'scenes',
  gig: 'gigs',
  mystery: 'mysteries',
  vault: 'vault_items',
  shop_item: 'shop_items',
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

export function extractContentIds(contentType: ContentType, data: Record<string, unknown>): string[] {
  switch (contentType) {
    case 'mystery':
      return ((data.mysteries as Array<{ id: string }>) || [data as { id: string }]).map((item) => item.id);
    case 'vault':
      return ((data.vault_items as Array<{ id: string }>) || []).map((item) => item.id);
    case 'gig':
      return ((data.gigs as Array<{ id: string }>) || [data as { id: string }]).map((item) => item.id);
    case 'shop_item':
      return ((data.shop_items as Array<{ id: string }>) || []).map((item) => item.id);
    default:
      return [(data as { id: string }).id];
  }
}

async function isTargetContentPresent(contentType: ContentType, ids: string[]): Promise<boolean> {
  if (ids.length === 0) {
    return false;
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
    const items = (data.vault_items as Array<{ id: string; mystery_id?: string }>) || [];

    for (const item of items) {
      if (!item.mystery_id) {
        continue;
      }

      const mysteryResult = await queryOLTP('SELECT id FROM mysteries WHERE id = $1', [item.mystery_id]);
      if (mysteryResult.rows.length === 0) {
        return false;
      }

      const vaultResult = await queryOLTP<{ mystery_id: string | null }>(
        'SELECT mystery_id FROM vault_items WHERE id = $1',
        [item.id]
      );
      if (vaultResult.rows.length > 0 && vaultResult.rows[0].mystery_id !== item.mystery_id) {
        return false;
      }
    }

    return true;
  }

  if (contentType === 'overlay') {
    const mysteryId = (data as { mystery_id?: string }).mystery_id;
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
  const result = await queryOLTP(
    'SELECT id FROM migration_log WHERE (file_path = $1 OR file_path = $2 OR file_checksum = $3) LIMIT 1',
    [filePath, relativePath, checksum]
  );

  if (result.rows.length === 0) {
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

function getContentTypeFromPath(filePath: string): ContentType | null {
  const normalizedPath = filePath.toLowerCase();
  
  if (normalizedPath.includes('/characters/') || normalizedPath.includes('\\characters\\')) {
    return 'character';
  }
  if (normalizedPath.includes('/dialogues/') || normalizedPath.includes('\\dialogues\\')) {
    return 'dialogue';
  }
  if (normalizedPath.includes('/overlays/') || normalizedPath.includes('\\overlays\\')) {
    return 'overlay';
  }
  if (normalizedPath.includes('/scenes/') || normalizedPath.includes('\\scenes\\')) {
    return 'scene';
  }
  if (normalizedPath.includes('/gigs/') || normalizedPath.includes('\\gigs\\') || normalizedPath.includes('gigs.yaml')) {
    return 'gig';
  }
  if (normalizedPath.includes('/locations/') || normalizedPath.includes('\\locations\\')) {
    return 'location';
  }
  if (normalizedPath.includes('/vault/') || normalizedPath.includes('\\vault\\')) {
    return 'vault';
  }
  if (normalizedPath.includes('/mysteries/') || normalizedPath.includes('\\mysteries\\')) {
    return 'mystery';
  }
  if (normalizedPath.includes('/shop/') || normalizedPath.includes('\\shop\\')) {
    return 'shop_item';
  }
  
  if (normalizedPath.endsWith('.yaml') && normalizedPath.includes('gig')) {
    return 'gig';
  }

  return null;
}

function getProcessingOrder(files: string[]): string[] {
  const order: ContentType[] = ['character', 'scene', 'location', 'mystery', 'vault', 'dialogue', 'overlay', 'gig', 'shop_item'];
  
  return files.sort((a, b) => {
    const typeA = getContentTypeFromPath(a);
    const typeB = getContentTypeFromPath(b);
    
    if (!typeA || !typeB) return 0;
    
    const indexA = order.indexOf(typeA);
    const indexB = order.indexOf(typeB);
    
    return indexA - indexB;
  });
}

export async function migrateContent(contentDir: string): Promise<MigrationResult> {
  console.log(`🚀 Starting content migration from: ${contentDir}`);
  
  const result: MigrationResult = {
    success: true,
    filesProcessed: 0,
    filesSkipped: 0,
    filesFailed: 0,
    errors: [],
    appliedMigrations: [],
  };

  try {
    console.log('🔍 Validating content...');
    const validationResult = await validateContent(contentDir);
    
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

    const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
    const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
    let allFiles = [...yamlFiles, ...ymlFiles];

    allFiles = getProcessingOrder(allFiles);

    console.log(`📁 Found ${allFiles.length} content files`);

    for (const file of allFiles) {
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

    await runPostMigrationTasks(result);
    return result;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Migration failed: ${error.message}`);
    console.error('❌ Migration failed:', error);
    return result;
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

  // ---- AOT Chunk Compilation ----
  // Runs after all content is upserted (including overlays, which
  // upsert after trees per getProcessingOrder). Compiles every
  // dialogue tree into ≤15-node chunks. Non-fatal: a compiler bug
  // must not block content shipping.
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

  // Clear stale dialogue caches (covers dialogue:resolved:*,
  // dialogue:archive:*, and future dialogue:chunk:* keys).
  try {
    await invalidatePattern('dialogue:*');
    console.log('🗑️  Cleared dialogue caches');
  } catch (error: any) {
    console.error('⚠️  Cache invalidation error (non-fatal):', error.message);
  }

if (result.filesFailed > 0) {
    result.success = false;
  }
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]).endsWith(path.join('src', 'content', 'migrate.ts'))
  : false;

if (isCli) {
  const contentDir = process.argv[2] || path.join(process.cwd(), 'content');
  
  migrateContent(contentDir)
    .then(result => {
      if (result.success) {
        console.log('\n🎉 Migration completed successfully!');
        process.exit(0);
      } else {
        console.log('\n💥 Migration failed!');
        if (result.errors.length > 0) {
          console.log('\nErrors:');
          result.errors.forEach(e => console.log(`  - ${e}`));
        }
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}
