#!/usr/bin/env node

/**
 * Import existing drafts from filesystem to MinIO + PostgreSQL
 * 
 * Usage: node scripts/import-drafts.mjs [--dry-run]
 * 
 * This script:
 * 1. Scans docs/lore/assets/ui-concepts/*/assets/*/drafts/ for PNG files
 * 2. Groups them by prompt_rel (derived from folder structure)
 * 3. Identifies base vs variant images
 * 4. Uploads to MinIO
 * 5. Registers in PostgreSQL database
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PROMPT_ROOT = path.join(ROOT, 'docs/lore/assets/ui-concepts');
const DRAFTS_DIR = 'drafts';

// Database connection
const dbConfig = {
  user: process.env.DATABASE_USER || 'las_flores',
  host: process.env.DATABASE_HOST || 'localhost',
  database: process.env.DATABASE_NAME || 'las_flores',
  password: process.env.DATABASE_PASSWORD || 'las_flores_dev_password',
  port: process.env.DATABASE_PORT || 5434,
};

// MinIO connection
const minioConfig = {
  endpoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: process.env.MINIO_PORT || 9000,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  bucket: process.env.MINIO_BUCKET || 'las-flores',
  useSSL: process.env.MINIO_USE_SSL === 'true',
};

const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================
// Utility functions
// ============================================================

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function getPromptRelFromPath(filePath) {
  // filePath: docs/lore/assets/ui-concepts/isometric-map/assets/tile_street.prompt/drafts/tile_street__base.png
  // We want: isometric-map/assets/tile_street
  const relative = path.relative(PROMPT_ROOT, filePath);
  const parts = relative.split(path.sep);
  // parts = ['isometric-map', 'assets', 'tile_street.prompt', 'drafts', 'tile_street__base.png']
  // Remove the last 2 parts (drafts, filename) and .prompt extension
  const promptParts = parts.slice(0, -2);
  const lastPart = promptParts[promptParts.length - 1];
  const cleanLastPart = lastPart.replace('.prompt', '');
  promptParts[promptParts.length - 1] = cleanLastPart;
  return promptParts.join('/');
}

function getVariantNameFromFilename(filename) {
  // filename: tile_street__base.png -> base
  // filename: tile_street__night_variant.png -> night_variant
  // filename: tile_street__day_lit_variant.png -> day_lit_variant
  const base = path.basename(filename, '.png');
  const parts = base.split('__');
  if (parts.length === 2) {
    return parts[1];
  }
  return base;
}

function isBaseVariant(filename) {
  const variantName = getVariantNameFromFilename(filename);
  return variantName === 'base';
}

function getProposalIndex(filename) {
  // For base variants, use 0. For others, use hash-based index
  if (isBaseVariant(filename)) {
    return 0;
  }
  // Use consistent hashing for same variant names
  const variantName = getVariantNameFromFilename(filename);
  const hash = crypto.createHash('md5').update(variantName).digest('hex');
  return Math.abs(parseInt(hash, 16)) % 100;
}

// ============================================================
// MinIO client
// ============================================================

let minioClient = null;

async function getMinioClient() {
  if (minioClient) return minioClient;
  
  try {
    const minio = await import('minio');
    minioClient = new minio.Client({
      endPoint: minioConfig.endpoint,
      port: parseInt(minioConfig.port),
      useSSL: minioConfig.useSSL,
      accessKey: minioConfig.accessKey,
      secretKey: minioConfig.secretKey,
    });
    return minioClient;
  } catch (err) {
    console.error('Failed to create MinIO client:', err.message);
    throw err;
  }
}

async function uploadToMinio(filePath, destinationPath) {
  const client = await getMinioClient();
  const fileContent = await fs.readFile(filePath);
  
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would upload ${filePath} to ${minioConfig.bucket}/${destinationPath} (${contentType})`);
    return `s3://${minioConfig.bucket}/${destinationPath}`;
  }
  
  try {
    await client.putObject(minioConfig.bucket, destinationPath, fileContent, {
      'Content-Type': contentType,
    });
    console.log(`  ✓ Uploaded to s3://${minioConfig.bucket}/${destinationPath}`);
    return `s3://${minioConfig.bucket}/${destinationPath}`;
  } catch (err) {
    console.error(`  ✗ Failed to upload ${filePath}:`, err.message);
    throw err;
  }
}

async function checkMinioConnection() {
  const client = await getMinioClient();
  try {
    await client.bucketExists(minioConfig.bucket);
    console.log(`✓ Connected to MinIO at ${minioConfig.endpoint}:${minioConfig.port}`);
    return true;
  } catch (err) {
    if (err.code === 'NoSuchBucket') {
      console.log(`  ! Bucket ${minioConfig.bucket} does not exist, will create it`);
      try {
        await client.makeBucket(minioConfig.bucket);
        console.log(`  ✓ Created bucket ${minioConfig.bucket}`);
        return true;
      } catch (err2) {
        console.error('  ✗ Failed to create bucket:', err2.message);
        return false;
      }
    }
    console.error('  ✗ Failed to connect to MinIO:', err.message);
    return false;
  }
}

// ============================================================
// Database client
// ============================================================

let dbClient = null;

async function getDbClient() {
  if (dbClient) return dbClient;
  
  dbClient = new pg.Client(dbConfig);
  await dbClient.connect();
  return dbClient;
}

async function checkDbConnection() {
  try {
    const client = await getDbClient();
    await client.query('SELECT 1');
    console.log(`✓ Connected to PostgreSQL at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    return true;
  } catch (err) {
    console.error('  ✗ Failed to connect to PostgreSQL:', err.message);
    return false;
  }
}

async function insertBase(dbClient, data) {
  const { prompt_rel, proposal_index, image_path, seed, asset_type, prompt_text, negative_prompt, width, height } = data;
  
  const query = `
    INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, prompt_text, negative_prompt, width, height, chosen)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (prompt_rel, proposal_index) DO UPDATE
    SET image_path = EXCLUDED.image_path,
        seed = EXCLUDED.seed,
        asset_type = EXCLUDED.asset_type,
        prompt_text = EXCLUDED.prompt_text,
        negative_prompt = EXCLUDED.negative_prompt,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        created_at = EXCLUDED.created_at
    RETURNING id, prompt_rel, proposal_index, image_path, seed, chosen, created_at, asset_type, prompt_text, negative_prompt, width, height
  `;
  
  const result = await dbClient.query(query, [
    prompt_rel, proposal_index, image_path, seed, asset_type, prompt_text, negative_prompt, width, height, false
  ]);
  return result.rows[0];
}

async function insertVariant(dbClient, data) {
  const { base_id, variant_name, image_path, i2i_strength, prompt_text, negative_prompt, width, height } = data;
  
  const query = `
    INSERT INTO asset_variants (base_id, variant_name, image_path, i2i_strength, prompt_text, negative_prompt, width, height)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (base_id, variant_name) DO UPDATE
    SET image_path = EXCLUDED.image_path,
        i2i_strength = EXCLUDED.i2i_strength,
        prompt_text = EXCLUDED.prompt_text,
        negative_prompt = EXCLUDED.negative_prompt,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        created_at = EXCLUDED.created_at
    RETURNING id, base_id, variant_name, image_path, i2i_strength, created_at, prompt_text, negative_prompt, width, height
  `;
  
  const result = await dbClient.query(query, [
    base_id, variant_name, image_path, i2i_strength, prompt_text, negative_prompt, width, height
  ]);
  return result.rows[0];
}

// ============================================================
// Parse prompt files
// ============================================================

function parsePromptFile(filePath) {
  try {
    const content = fsSync.readFileSync(filePath, 'utf-8');
    
    const typeMatch = content.match(/\*\*Type:\*\* (\S+)/);
    const asset_type = typeMatch ? typeMatch[1].trim() : 'unknown';
    
    const dimMatch = content.match(/\*\*Dimensions:\*\* (\d+)\s*[x×]\s*(\d+)/i);
    let width = 1024;
    let height = 1024;
    if (dimMatch) {
      width = parseInt(dimMatch[1], 10);
      height = parseInt(dimMatch[2], 10);
    }
    
    // Extract base variant prompt
    let basePrompt = '';
    let baseNegative = '';
    const basePromptMatch = content.match(/## Prompt — Base\n([\s\S]*?)(?=\n##|\n\*\*|$)/);
    if (basePromptMatch) {
      basePrompt = basePromptMatch[1].trim();
    }
    const baseNegativeMatch = content.match(/## Negative Prompt\n([\s\S]*?)(?=\n##|\n\*\*|$)/);
    if (baseNegativeMatch) {
      baseNegative = baseNegativeMatch[1].trim();
    }
    
    // Extract all variants
    const variants = [];
    const variantRegex = /## Prompt — ([^\n]+)\n([\s\S]*?)(?=\n## Prompt — |\n## Negative|\n\*\*|$)/g;
    let match;
    while ((match = variantRegex.exec(content)) !== null) {
      const variantName = match[1].trim();
      const promptText = match[2].trim();
      
      if (variantName !== 'Base') {
        // Get negative prompt for this variant
        const remaining = content.slice(match.index + match[0].length);
        const negMatch = remaining.match(/## Negative Prompt[^\n]*\n([\s\S]*?)(?=\n##|\n\*\*|$)/);
        const negativePrompt = negMatch ? negMatch[1].trim() : baseNegative;
        
        variants.push({
          name: variantName,
          prompt: promptText,
          negativePrompt,
        });
      }
    }
    
    return {
      asset_type,
      width,
      height,
      basePrompt,
      baseNegative,
      variants,
    };
  } catch (err) {
    console.error(`Failed to parse prompt file ${filePath}:`, err.message);
    return null;
  }
}

// ============================================================
// Main import logic
// ============================================================

async function scanDrafts() {
  console.log('\n📁 Scanning for drafts...\n');
  
  const assets = new Map(); // prompt_rel -> { bases: [], variants: [] }
  
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === DRAFTS_DIR) {
          // Found a drafts folder, scan for images
          await processDraftsFolder(fullPath);
        } else {
          await walk(fullPath);
        }
      }
    }
  };
  
  const processDraftsFolder = async (draftsFolder) => {
    const files = await fs.readdir(draftsFolder);
    const imageFiles = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    
    if (imageFiles.length === 0) return;
    
    // Determine prompt_rel from folder structure
    const parentFolder = path.dirname(draftsFolder);
    // parentFolder: .../isometric-map/assets/tile_street.prompt
    // We want: isometric-map/assets/tile_street
    const relPath = path.relative(PROMPT_ROOT, parentFolder);
    const prompt_rel = relPath.replace('.prompt', '');
    
    // Find the prompt file to get metadata
    const promptFile = path.join(parentFolder, `${path.basename(parentFolder)}.md`);
    // Actually, the folder is named like: tile_street.prompt
    // So the prompt file should be: parentFolder.prompt.md
    const actualPromptFile = parentFolder.endsWith('.prompt') 
      ? parentFolder + '.md'
      : path.join(parentFolder, path.basename(parentFolder) + '.prompt.md');
    
    let metadata = {
      asset_type: 'unknown',
      width: 1024,
      height: 1024,
      basePrompt: '',
      baseNegative: '',
      variants: [],
    };
    
    try {
      if (fsSync.existsSync(actualPromptFile)) {
        const parsed = parsePromptFile(actualPromptFile);
        if (parsed) {
          metadata = parsed;
        }
      }
    } catch (err) {
      // Ignore, use defaults
    }
    
    // Group files by type
    const bases = [];
    const variants = [];
    
    for (const file of imageFiles) {
      const filePath = path.join(draftsFolder, file);
      const variantName = getVariantNameFromFilename(file);
      
      const fileData = {
        filename: file,
        filePath,
        variantName,
        isBase: isBaseVariant(file),
        prompt_rel,
        ...metadata,
      };
      
      if (fileData.isBase) {
        bases.push(fileData);
      } else {
        variants.push(fileData);
      }
    }
    
    // Sort bases by proposal_index
    bases.sort((a, b) => {
      const aIdx = getProposalIndex(a.filename);
      const bIdx = getProposalIndex(b.filename);
      return aIdx - bIdx;
    });
    
    if (bases.length > 0 || variants.length > 0) {
      if (!assets.has(prompt_rel)) {
        assets.set(prompt_rel, { bases: [], variants: [], metadata });
      }
      const asset = assets.get(prompt_rel);
      asset.bases.push(...bases);
      asset.variants.push(...variants);
    }
  };
  
  await walk(PROMPT_ROOT);
  
  console.log(`✓ Found ${assets.size} assets with drafts\n`);
  
  return assets;
}

async function importAssets(assets) {
  console.log('📤 Importing assets to database and MinIO...\n');
  
  const dbClient = await getDbClient();
  await checkDbConnection();
  await checkMinioConnection();
  
  let totalImported = { bases: 0, variants: 0 };
  
  for (const [prompt_rel, asset] of assets) {
    console.log(`\nProcessing: ${prompt_rel}`);
    console.log(`  Bases: ${asset.bases.length}, Variants: ${asset.variants.length}`);
    
    // Process bases
    for (const base of asset.bases) {
      const proposal_index = getProposalIndex(base.filename);
      const destPath = `drafts/bases/${prompt_rel.replace(/\//g, '_')}_${proposal_index}.png`;
      
      console.log(`  Importing base: ${base.filename} -> ${destPath}`);
      
      const image_path = await uploadToMinio(base.filePath, destPath);
      
      if (DRY_RUN) {
        totalImported.bases++;
        console.log(`  [DRY RUN] Would insert base record for ${prompt_rel}`);
        continue;
      }
      
      try {
        const seed = Math.floor(Math.random() * 2147483647);
        const inserted = await insertBase(dbClient, {
          prompt_rel,
          proposal_index,
          image_path,
          seed,
          asset_type: asset.metadata.asset_type,
          prompt_text: asset.metadata.basePrompt,
          negative_prompt: asset.metadata.baseNegative,
          width: asset.metadata.width,
          height: asset.metadata.height,
        });
        
        console.log(`  ✓ Imported base: ${inserted.id}`);
        totalImported.bases++;
        
        // Store base_id for variants
        base.base_id = inserted.id;
        
      } catch (err) {
        console.error(`  ✗ Failed to insert base:`, err.message);
      }
    }
    
    // Process variants
    for (const variant of asset.variants) {
      // Find the base for this variant
      const matchingBase = asset.bases.find(b => 
        getVariantNameFromFilename(b.filename) === getVariantNameFromFilename(variant.filename)
      ) || asset.bases[0];
      
      if (!matchingBase && !DRY_RUN) {
        console.log(`  ⚠ No matching base found for variant ${variant.filename}, skipping`);
        continue;
      }
      
      const destPath = `drafts/variants/${prompt_rel.replace(/\//g, '_')}_${slugify(variant.variantName)}.png`;
      
      console.log(`  Importing variant: ${variant.filename} -> ${destPath}`);
      
      const image_path = await uploadToMinio(variant.filePath, destPath);
      
      if (DRY_RUN) {
        totalImported.variants++;
        console.log(`  [DRY RUN] Would insert variant record`);
        continue;
      }
      
      try {
        // Find a matching variant definition from metadata
        const variantMeta = asset.metadata.variants.find(v => 
          v.name.toLowerCase().includes(variant.variantName.toLowerCase())
        );
        
        const inserted = await insertVariant(dbClient, {
          base_id: matchingBase.base_id,
          variant_name: variant.variantName,
          image_path,
          i2i_strength: 0.7,
          prompt_text: variantMeta?.prompt || '',
          negative_prompt: variantMeta?.negativePrompt || '',
          width: asset.metadata.width,
          height: asset.metadata.height,
        });
        
        console.log(`  ✓ Imported variant: ${inserted.id}`);
        totalImported.variants++;
        
      } catch (err) {
        console.error(`  ✗ Failed to insert variant:`, err.message);
      }
    }
  }
  
  return totalImported;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Draft Import Script                                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  
  if (DRY_RUN) {
    console.log('🔹 DRY RUN MODE - No changes will be made\n');
  }
  
  // Check dependencies
  console.log('🔍 Checking dependencies...');
  try {
    await import('minio');
    console.log('  ✓ MinIO client available');
  } catch (err) {
    console.error('  ✗ MinIO client not available. Install with: npm install minio');
    process.exit(1);
  }
  
  try {
    await import('pg');
    console.log('  ✓ PostgreSQL client available');
  } catch (err) {
    console.error('  ✗ PostgreSQL client not available. Install with: npm install pg');
    process.exit(1);
  }
  
  // Scan for drafts
  const assets = await scanDrafts();
  
  if (assets.size === 0) {
    console.log('❌ No drafts found. Make sure drafts exist in:');
    console.log(`   ${path.join(PROMPT_ROOT, '*', '*', DRAFTS_DIR)}`);
    process.exit(0);
  }
  
  // Import
  const imported = await importAssets(assets);
  
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Import Summary                                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`  Assets processed: ${assets.size}`);
  console.log(`  Bases imported:   ${imported.bases}`);
  console.log(`  Variants imported: ${imported.variants}`);
  console.log(`  Total:            ${imported.bases + imported.variants} records\n`);
  
  if (DRY_RUN) {
    console.log('  🔹 Dry run complete. Use --dry-run to actually import.\n');
  } else {
    console.log('  ✓ Import complete!\n');
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
