import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import crypto from 'crypto';
import type { ContentType } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { validateContent } from './validate.js';
import { processContentFile } from './upsert.js';

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

async function isMigrationApplied(filePath: string, contentDir: string, checksum: string): Promise<boolean> {
  const relativePath = path.relative(contentDir, filePath);
  const result = await queryOLTP(
    'SELECT id FROM migration_log WHERE (file_path = $1 OR file_path = $2 OR file_checksum = $3) LIMIT 1',
    [filePath, relativePath, checksum]
  );
  return result.rows.length > 0;
}

async function recordMigration(
  filePath: string,
  checksum: string,
  contentType: ContentType,
  contentId: string
): Promise<void> {
  await queryOLTP(
    'INSERT INTO migration_log (file_path, file_checksum, content_type, content_id) VALUES ($1, $2, $3, $4)',
    [filePath, checksum, contentType, contentId]
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
  if (normalizedPath.includes('/vault/') || normalizedPath.includes('\\vault\\')) {
    return 'vault';
  }
  if (normalizedPath.includes('/mysteries/') || normalizedPath.includes('\\mysteries\\')) {
    return 'mystery';
  }
  
  if (normalizedPath.endsWith('.yaml') && normalizedPath.includes('gig')) {
    return 'gig';
  }

  return null;
}

function getProcessingOrder(files: string[]): string[] {
  const order: ContentType[] = ['character', 'vault', 'scene', 'mystery', 'dialogue', 'overlay', 'gig'];
  
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

        if (await isMigrationApplied(file, contentDir, checksum)) {
          console.log(`⏭️  Skipping (unchanged): ${path.relative(contentDir, file)}`);
          result.filesSkipped++;
          continue;
        }

        console.log(`📦 Processing: ${path.relative(contentDir, file)}`);
        const migration = await processContentFile(file);
        
        const loggedFilePath = path.relative(contentDir, file);
        const logContentId = migration.contentId.split(',')[0];
        await recordMigration(loggedFilePath, checksum, migration.contentType, logContentId);
        
        result.filesProcessed++;
        result.appliedMigrations.push(migration);
        
        console.log(`✅ Applied: ${migration.contentType} - ${migration.contentId}`);
      } catch (error: any) {
        result.filesFailed++;
        result.errors.push(`${path.relative(contentDir, file)}: ${error.message}`);
        console.error(`❌ Failed: ${path.relative(contentDir, file)} - ${error.message}`);
      }
    }

    if (result.filesFailed > 0) {
      result.success = false;
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  ✅ Processed: ${result.filesProcessed}`);
    console.log(`  ⏭️  Skipped: ${result.filesSkipped}`);
    console.log(`  ❌ Failed: ${result.filesFailed}`);

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }

    return result;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Migration failed: ${error.message}`);
    console.error('❌ Migration failed:', error);
    return result;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
