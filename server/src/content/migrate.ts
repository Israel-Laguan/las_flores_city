import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import crypto from 'crypto';
import {
  YAMLCharacterSchema,
  YAMLDialogueSchema,
  YAMLOverlaySchema,
  YAMLSceneSchema,
  ContentType,
} from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { validateContent, sanitizeText } from './validate.js';

// Migration result
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

// Calculate file checksum
async function calculateChecksum(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Check if migration was already applied
async function isMigrationApplied(filePath: string, checksum: string): Promise<boolean> {
  const result = await queryOLTP(
    'SELECT id FROM migration_log WHERE file_path = $1 AND file_checksum = $2',
    [filePath, checksum]
  );
  return result.rows.length > 0;
}

// Record migration
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

// Get content type from file path
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
  
  return null;
}

// Upsert character
async function upsertCharacter(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO characters (id, name, title, description, avatar_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       avatar_url = EXCLUDED.avatar_url,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id`,
    [
      data.id,
      data.name,
      data.title || null,
      sanitizeText(data.description),
      data.avatar_url || null,
      JSON.stringify(data.metadata || {}),
    ]
  );
  return result.rows[0].id;
}

// Upsert dialogue tree
async function upsertDialogueTree(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, description, start_node_id, nodes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       start_node_id = EXCLUDED.start_node_id,
       nodes = EXCLUDED.nodes,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id`,
    [
      data.id,
      data.name,
      data.description || null,
      data.start_node_id,
      JSON.stringify(data.nodes || {}),
      JSON.stringify(data.metadata || {}),
    ]
  );
  return result.rows[0].id;
}

// Upsert dialogue overlay
async function upsertDialogueOverlay(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO dialogue_overlays (id, name, description, target_tree_id, modifications, conditions, priority, is_nsfw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       target_tree_id = EXCLUDED.target_tree_id,
       modifications = EXCLUDED.modifications,
       conditions = EXCLUDED.conditions,
       priority = EXCLUDED.priority,
       is_nsfw = EXCLUDED.is_nsfw,
       updated_at = NOW()
     RETURNING id`,
    [
      data.id,
      data.name,
      data.description || null,
      data.target_tree_id,
      JSON.stringify(data.modifications || []),
      JSON.stringify(data.conditions || {}),
      data.priority || 0,
      data.is_nsfw || false,
    ]
  );
  return result.rows[0].id;
}

// Upsert scene
async function upsertScene(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO scenes (id, name, description, district, image_url, available_dialogues, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       district = EXCLUDED.district,
       image_url = EXCLUDED.image_url,
       available_dialogues = EXCLUDED.available_dialogues,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id`,
    [
      data.id,
      data.name,
      sanitizeText(data.description),
      data.district,
      data.image_url || null,
      data.available_dialogues || [],
      JSON.stringify(data.metadata || {}),
    ]
  );
  return result.rows[0].id;
}

// Process content file
async function processContentFile(filePath: string): Promise<AppliedMigration> {
  const contentType = getContentTypeFromPath(filePath);
  if (!contentType) {
    throw new Error(`Could not determine content type from path: ${filePath}`);
  }

  // Read and parse YAML
  const content = await fs.readFile(filePath, 'utf-8');
  const data = yaml.load(content) as any;

  // Upsert based on type
  let contentId: string;
  let action: 'created' | 'updated' | 'updated';

  switch (contentType) {
    case 'character':
      contentId = await upsertCharacter(data);
      break;
    case 'dialogue':
      contentId = await upsertDialogueTree(data);
      break;
    case 'overlay':
      contentId = await upsertDialogueOverlay(data);
      break;
    case 'scene':
      contentId = await upsertScene(data);
      break;
    default:
      throw new Error(`Unsupported content type: ${contentType}`);
  }

  return {
    filePath: path.relative(process.cwd(), filePath),
    contentType,
    contentId,
    action: 'updated', // Could be 'created' or 'updated' based on existence check
  };
}

// Get processing order (dependency resolution)
function getProcessingOrder(files: string[]): string[] {
  // Characters first, then scenes, dialogues, overlays (overlays depend on dialogue trees)
  const order: ContentType[] = ['character', 'scene', 'dialogue', 'overlay'];
  
  return files.sort((a, b) => {
    const typeA = getContentTypeFromPath(a);
    const typeB = getContentTypeFromPath(b);
    
    if (!typeA || !typeB) return 0;
    
    const indexA = order.indexOf(typeA);
    const indexB = order.indexOf(typeB);
    
    return indexA - indexB;
  });
}

// Main migration function
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
    // Validate content first
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

    // Find all YAML files
    const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
    const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
    let allFiles = [...yamlFiles, ...ymlFiles];

    // Sort by processing order
    allFiles = getProcessingOrder(allFiles);

    console.log(`📁 Found ${allFiles.length} content files`);

    // Process each file
    for (const file of allFiles) {
      try {
        // Calculate checksum
        const checksum = await calculateChecksum(file);

        // Check if already applied
        if (await isMigrationApplied(file, checksum)) {
          console.log(`⏭️  Skipping (unchanged): ${path.relative(contentDir, file)}`);
          result.filesSkipped++;
          continue;
        }

        // Process file
        console.log(`📦 Processing: ${path.relative(contentDir, file)}`);
        const migration = await processContentFile(file);
        
        // Record migration
        await recordMigration(file, checksum, migration.contentType, migration.contentId);
        
        result.filesProcessed++;
        result.appliedMigrations.push(migration);
        
        console.log(`✅ Applied: ${migration.contentType} - ${migration.contentId}`);
      } catch (error: any) {
        result.filesFailed++;
        result.errors.push(`${path.relative(contentDir, file)}: ${error.message}`);
        console.error(`❌ Failed: ${path.relative(contentDir, file)} - ${error.message}`);
      }
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

// CLI entry point
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
