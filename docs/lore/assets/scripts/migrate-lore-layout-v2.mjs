#!/usr/bin/env node

/**
 * migrate-lore-layout-v2.mjs
 *
 * Extended version that migrates ALL remaining lore categories to per-entity folders:
 *   <category>/<name>/<name>.md + <name>.prompt.md + assets/
 *
 * Preserves existing subdirectory structure for:
 *   - companies/ (chinese/, european/, lw_group/)
 *   - landmarks/ (region subdirectories)
 *
 * Also rewrites:
 *   - .prompt.md frontmatter `source:` paths
 *   - README.md links in each category
 *
 * Usage:
 *   node migrate-lore-layout-v2.mjs --dry-run
 *   node migrate-lore-layout-v2.mjs
 *   node migrate-lore-layout-v2.mjs --category events
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('docs/lore');
const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_CATEGORY = process.argv.find(a => a.startsWith('--category='))?.split('=')[1];

// Categories to migrate (excluding figures and landmarks which are already done)
const CATEGORIES = [
  'communities',
  'conflicts',
  'companies',
  'districts',
  'events',
  'families',
  'governance',
  'guides',
  'humanity_first',
  'media',
  'organizations',
  'partnerships',
  'platforms',
  'stories',
];

// Categories with existing meaningful subdirectory structure to preserve
const PRESERVE_SUBDIRS = new Set(['companies']);

function log(...args) {
  console.log(...args);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (DRY_RUN) {
      log(`  [dry-run] mkdir ${dir}`);
    } else {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function moveFile(src, dest) {
  if (DRY_RUN) {
    log(`  [dry-run] move ${src} -> ${dest}`);
    return;
  }
  ensureDir(path.dirname(dest));
  fs.renameSync(src, dest);
}

function rewritePromptSource(promptPath, newSource) {
  if (!fs.existsSync(promptPath)) return;
  let content = fs.readFileSync(promptPath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let updated = false;

  // Update frontmatter source
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const updatedFrontmatter = frontmatter.replace(
      /^(source:\s*)(.+)$/m,
      `$1${newSource}`
    );
    if (frontmatter !== updatedFrontmatter) {
      content = content.replace(frontmatter, updatedFrontmatter);
      updated = true;
    }
  }

  // Update body **Source:** field
  const bodySourceMatch = content.match(/^\*\*Source:\*\*\s*(.+)$/m);
  if (bodySourceMatch) {
    const oldBodySource = bodySourceMatch[1];
    const newBodySource = newSource;
    if (oldBodySource !== newBodySource) {
      content = content.replace(
        /^\*\*Source:\*\*\s*(.+)$/m,
        `**Source:** ${newBodySource}`
      );
      updated = true;
    }
  }

  if (updated) {
    if (DRY_RUN) {
      log(`  [dry-run] update source in ${promptPath} -> ${newSource}`);
    } else {
      fs.writeFileSync(promptPath, content, 'utf-8');
    }
  }
}

/**
 * Rewrite markdown links in README files to use nested paths
 * Pattern: [text](filename.md) -> [text](filename/filename.md)
 */
function rewriteCategoryReadme(categoryPath) {
  const readmePath = path.join(categoryPath, 'README.md');
  if (!fs.existsSync(readmePath)) {
    log(`  No README.md found in ${categoryPath}`);
    return;
  }

  let content = fs.readFileSync(readmePath, 'utf-8');
  const original = content;

  // Match markdown links: [text](path.md) or [text](path)
  // Don't rewrite if already nested (contains /)
  content = content.replace(
    /\[([^\]]+)\]\(([a-zA-Z0-9_\-]+)(?:\.md)?\)/g,
    (match, text, filename) => {
      // Skip if already has a path separator (already nested)
      if (filename.includes('/')) {
        return match;
      }
      // Check if this file exists in the category directory
      const oldPath = path.join(categoryPath, `${filename}.md`);
      const newPath = path.join(categoryPath, filename, `${filename}.md`);
      
      // Only rewrite if the new nested file exists (was already migrated)
      // or if we're in dry-run mode
      if (fs.existsSync(newPath) || DRY_RUN) {
        return `[${text}](${filename}/${filename}.md)`;
      }
      return match;
    }
  );

  if (content !== original) {
    if (DRY_RUN) {
      log(`  [dry-run] Would rewrite links in ${readmePath}`);
    } else {
      fs.writeFileSync(readmePath, content, 'utf-8');
      log(`  Rewrote links in ${readmePath}`);
    }
  } else {
    log(`  No README link changes needed for ${readmePath}`);
  }
}

/**
 * Migrate a single category directory
 * Handles both flat files and files within existing subdirectories
 */
function migrateCategory(category) {
  const categoryPath = path.join(ROOT, category);
  
  if (!fs.existsSync(categoryPath)) {
    log(`  Category ${category} does not exist, skipping.`);
    return 0;
  }

  log(`\n=== ${category} ===`);
  let moved = 0;

  // Get all entries in the category
  const entries = fs.readdirSync(categoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Handle subdirectories (like companies/chinese/, media/assets/)
      const subdirPath = path.join(categoryPath, entry.name);
      
      // Skip 'assets' directories - they're already in the right place
      if (entry.name === 'assets') {
        continue;
      }
      
      // If this category preserves subdirs (like companies), recurse into them
      if (PRESERVE_SUBDIRS.has(category)) {
        const subdirEntries = fs.readdirSync(subdirPath, { withFileTypes: true });
        
        for (const subEntry of subdirEntries) {
          if (!subEntry.isFile()) continue;
          
          const base = path.basename(subEntry.name, path.extname(subEntry.name));
          const ext = path.extname(subEntry.name);
          
          // Only process .md files that aren't prompt files
          if (ext !== '.md') continue;
          if (base.endsWith('.prompt') || subEntry.name.endsWith('.prompt.md')) continue;
          
          const loreFile = path.join(subdirPath, subEntry.name);
          const promptFile = path.join(subdirPath, `${base}.prompt.md`);
          const targetDir = path.join(subdirPath, base);
          const targetLore = path.join(targetDir, `${base}.md`);
          const targetPrompt = path.join(targetDir, `${base}.prompt.md`);
          
          // Skip if already in nested folder (already migrated)
          if (fs.existsSync(targetLore)) {
            log(`  Skipping ${subEntry.name} in ${entry.name}/ - already migrated`);
            moved++;
            continue;
          }
          
          ensureDir(targetDir);
          
          if (fs.existsSync(loreFile)) {
            moveFile(loreFile, targetLore);
          }
          if (fs.existsSync(promptFile)) {
            moveFile(promptFile, targetPrompt);
            rewritePromptSource(
              targetPrompt,
              `docs/lore/${category}/${entry.name}/${base}/${base}.md`
            );
          }
          
          moved++;
        }
        continue;
      }
      
      // For other subdirectories (like media/assets), skip them
      continue;
    }
    
    if (!entry.isFile()) continue;
    
    const base = path.basename(entry.name, path.extname(entry.name));
    const ext = path.extname(entry.name);
    
    // Only process .md files
    if (ext !== '.md') continue;
    
    // Skip README files
    if (base === 'README') continue;
    
    // Skip prompt files at the root level (they'll be handled with their base file)
    if (base.endsWith('.prompt') || entry.name.endsWith('.prompt.md')) continue;
    
    const loreFile = path.join(categoryPath, entry.name);
    const promptFile = path.join(categoryPath, `${base}.prompt.md`);
    const targetDir = path.join(categoryPath, base);
    const targetLore = path.join(targetDir, `${base}.md`);
    const targetPrompt = path.join(targetDir, `${base}.prompt.md`);
    
    // Skip if already in nested folder (already migrated)
    if (fs.existsSync(targetLore)) {
      log(`  Skipping ${entry.name} - already migrated`);
      moved++;
      continue;
    }
    
    ensureDir(targetDir);
    
    if (fs.existsSync(loreFile)) {
      moveFile(loreFile, targetLore);
    }
    if (fs.existsSync(promptFile)) {
      moveFile(promptFile, targetPrompt);
      rewritePromptSource(
        targetPrompt,
        `docs/lore/${category}/${base}/${base}.md`
      );
    }
    
    moved++;
  }

  // Rewrite README links for this category
  rewriteCategoryReadme(categoryPath);

  log(`  ${category}: processed ${moved} entries`);
  return moved;
}

function main() {
  log(DRY_RUN ? '=== DRY RUN ===' : '=== MIGRATING ===');
  
  let totalMoved = 0;
  
  const categoriesToProcess = SPECIFIC_CATEGORY 
    ? [SPECIFIC_CATEGORY]
    : CATEGORIES;
  
  for (const category of categoriesToProcess) {
    totalMoved += migrateCategory(category);
  }
  
  log(`\nTotal entries processed: ${totalMoved}`);
  log('Done.');
}

main();
