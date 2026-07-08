#!/usr/bin/env node

/**
 * fix-prompt-sources.mjs
 *
 * Updates the **Source:** field in prompt file bodies to match the new nested paths.
 * This is a follow-up to the migration script.
 *
 * Usage:
 *   node fix-prompt-sources.mjs --dry-run
 *   node fix-prompt-sources.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('docs/lore');
const DRY_RUN = process.argv.includes('--dry-run');

// Categories that were migrated
const CATEGORIES = [
  'communities',
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

function log(...args) {
  console.log(...args);
}

/**
 * Update both frontmatter and body Source: fields in a prompt file
 */
function fixPromptSources(promptPath, expectedSource) {
  if (!fs.existsSync(promptPath)) return;
  let content = fs.readFileSync(promptPath, 'utf-8');
  const original = content;
  let updated = false;

  // Update frontmatter source
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const updatedFrontmatter = frontmatter.replace(
      /^(source:\s*)(.+)$/m,
      `$1${expectedSource}`
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
    if (oldBodySource !== expectedSource) {
      content = content.replace(
        /^\*\*Source:\*\*\s*(.+)$/m,
        `**Source:** ${expectedSource}`
      );
      updated = true;
    }
  }

  if (updated) {
    if (DRY_RUN) {
      log(`  [dry-run] update source in ${promptPath} -> ${expectedSource}`);
    } else {
      fs.writeFileSync(promptPath, content, 'utf-8');
      log(`  Updated source in ${promptPath}`);
    }
  }
  return updated;
}

/**
 * Recursively scan a directory for .prompt.md files and fix their sources
 */
function scanAndFixCategory(categoryPath, categoryName, basePath) {
  const entries = fs.readdirSync(categoryPath, { withFileTypes: true });
  let fixed = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Handle subdirectories (like companies/chinese/)
      const subdirPath = path.join(categoryPath, entry.name);
      // Skip assets directories
      if (entry.name === 'assets') continue;
      
      const subBasePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      fixed += scanAndFixCategory(subdirPath, categoryName, subBasePath);
    } else if (entry.isFile() && entry.name.endsWith('.prompt.md')) {
      const baseName = path.basename(entry.name, '.prompt.md');
      const promptPath = path.join(categoryPath, entry.name);
      
      // Determine the expected source path
      // The .md file should be in the same directory with the same base name
      const mdPath = path.join(categoryPath, `${baseName}.md`);
      
      // The expected source is docs/lore/<category>/<subpath>/<baseName>.md
      // The prompt file is in categoryPath which is docs/lore/<category>/<subpath>/
      // and the md file is in the same directory: categoryPath/baseName.md
      // So the relative path from docs/lore/ is: categoryName/<subpath>/baseName.md
      // But subPath already includes baseName if we're at the leaf level
      // Actually, categoryPath = docs/lore/media/el_grito_estudiantil
      // and we want: docs/lore/media/el_grito_estudiantil/el_grito_estudiantil.md
      // So we need to get the relative path from docs/lore/ to the md file
      const relativePath = path.relative(
        path.join(ROOT),
        path.join(categoryPath, `${baseName}.md`)
      );
      const expectedSource = `docs/lore/${relativePath}`;
      
      // Only fix if the .md file exists
      if (fs.existsSync(mdPath)) {
        if (fixPromptSources(promptPath, expectedSource)) {
          fixed++;
        }
      }
    }
  }
  
  return fixed;
}

function main() {
  log(DRY_RUN ? '=== DRY RUN (fix prompt sources) ===' : '=== FIXING PROMPT SOURCES ===');
  
  let totalFixed = 0;
  
  for (const category of CATEGORIES) {
    const categoryPath = path.join(ROOT, category);
    if (fs.existsSync(categoryPath)) {
      log(`\n=== ${category} ===`);
      totalFixed += scanAndFixCategory(categoryPath, category, '');
    }
  }
  
  log(`\nTotal prompt files fixed: ${totalFixed}`);
  log('Done.');
}

main();
