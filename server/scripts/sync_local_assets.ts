import fs from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import { queryOLTP, withOLTPTransaction } from '../src/database/connection.js';
import { uploadToMinio } from '../src/services/StorageService.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_ROOT = path.resolve(__dirname, '../../content');

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function syncAssets() {
  console.log(`Scanning ${PROMPT_ROOT} for generated drafts...`);
  const entries = [];
  
  function walk(dir: string) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (item.isFile() && item.name.endsWith('.prompt.md')) {
        const relFromRoot = path.relative(PROMPT_ROOT, full);
        const prompt_rel = relFromRoot.replace(/\.prompt\.md$/, '');
        const draftsDir = path.join(dir, 'drafts');
        if (fs.existsSync(draftsDir)) {
          entries.push({ prompt_rel, draftsDir });
        }
      }
    }
  }

  walk(PROMPT_ROOT);

  for (const entry of entries) {
    const { prompt_rel, draftsDir } = entry;
    console.log(`Processing drafts for ${prompt_rel}...`);
    
    const files = fs.readdirSync(draftsDir).filter(f => f.endsWith('.png'));
    
    // First pass: bases
    const baseFiles = files.filter(f => f.includes('__base'));
    let baseId: string | null = null;
    
    for (let i = 0; i < baseFiles.length; i++) {
      const file = baseFiles[i];
      const fullPath = path.join(draftsDir, file);
      const buffer = fs.readFileSync(fullPath);
      
      const key = `drafts/bases/${slugify(prompt_rel)}__base_imported_${i}.png`;
      const image_path = await uploadToMinio(buffer, key);
      
      const seed = 123456; // dummy seed
      
      const result = await queryOLTP(
        `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, prompt_text, chosen)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [prompt_rel, i, image_path, seed, 'unknown', 'Imported base', i === 0]
      );
      if (i === 0) baseId = result.rows[0].id; // choose the first one
      console.log(`  Inserted base ${file} as ${image_path}`);
    }
    
    // Second pass: variants
    if (baseId) {
      const variantFiles = files.filter(f => !f.includes('__base'));
      for (const file of variantFiles) {
        // e.g. tile_cobblestone__night_variant.png
        const nameParts = file.split('__');
        let variantName = nameParts.length > 1 ? nameParts[1].replace('.png', '') : file;
        
        const fullPath = path.join(draftsDir, file);
        const buffer = fs.readFileSync(fullPath);
        
        const key = `drafts/variants/${slugify(prompt_rel)}__${slugify(variantName)}_imported.png`;
        const image_path = await uploadToMinio(buffer, key);
        
        await queryOLTP(
          `INSERT INTO asset_variants (base_id, variant_name, image_path, i2i_strength, prompt_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [baseId, variantName, image_path, 0.7, 'Imported variant']
        );
        console.log(`  Inserted variant ${file} as ${image_path}`);
      }
    }
  }
  
  console.log('Sync complete!');
  process.exit(0);
}

syncAssets().catch(console.error);
