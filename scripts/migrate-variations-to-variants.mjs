#!/usr/bin/env node

/**
 * migrate-variations-to-variants.mjs
 *
 * One-time migration script that converts all ## Variations sections
 * in .prompt.md files to the new ## Variants (image-to-image) format.
 *
 * Usage:
 *   node scripts/migrate-variations-to-variants.mjs                    # dry-run
 *   node scripts/migrate-variations-to-variants.mjs --apply            # apply changes
 *   node scripts/migrate-variations-to-variants.mjs --apply --force    # overwrite existing variants
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTENT_DIRS = [
  path.join(ROOT, 'content/characters'),
  path.join(ROOT, 'content/districts'),
  path.join(ROOT, 'content/scenes'),
];

// ── Helpers ───────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

function findPromptFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findPromptFiles(full));
    } else if (entry.name.endsWith('.prompt.md')) {
      files.push(full);
    }
  }
  return files;
}

function detectEntityType(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('content/characters/')) return 'character';
  if (rel.startsWith('content/districts/')) return 'location';
  if (rel.startsWith('content/scenes/')) return 'scene';
  return 'unknown';
}

function detectScale(entityType, content) {
  if (entityType === 'location' || entityType === 'scene') return '16:9';
  // Check if prompt mentions wide composition
  if (content.toLowerCase().includes('16:9') || content.toLowerCase().includes('wide')) return '16:9';
  return '3:4';
}

function extractEntitySlug(filePath) {
  const dir = path.dirname(filePath);
  return path.basename(dir);
}

// ── Parse existing Variations section ──────────────────────────────────────

function parseVariations(content) {
  const match = content.match(/## Variations\n([\s\S]*?)(?=\n## |\n---|\n$)/);
  if (!match) return null;

  const section = match[1];
  const items = [];

  // Match - [ ] items
  const regex = /- \[ \]\s*(.+)/g;
  let m;
  while ((m = regex.exec(section)) !== null) {
    items.push(m[1].trim());
  }

  return items.length > 0 ? { fullMatch: match[0], items } : null;
}

// ── Generate edit prompt from checklist item ───────────────────────────────

function generateEditPrompt(checklistItem, entityType, baseContent) {
  // Extract the scene/action description
  const description = checklistItem;

  // Detect if it's a life-stage variant
  const lifeStageKeywords = ['young', 'teen', 'child', 'elder', 'older', 'age', 'youth'];
  const isLifeStage = lifeStageKeywords.some(k => description.toLowerCase().includes(k));

  // Detect if it's an outfit variant
  const outfitKeywords = ['suit', 'formal', 'casual', 'uniform', 'dressed', 'clothing'];
  const isOutfit = outfitKeywords.some(k => description.toLowerCase().includes(k));

  // Detect if it's an emotion/expression variant
  const emotionKeywords = ['angry', 'sad', 'happy', 'stressed', 'tired', 'smile', 'laugh', 'cry', 'upset'];
  const isEmotion = emotionKeywords.some(k => description.toLowerCase().includes(k));

  // Build the edit prompt
  let prompt = '';

  if (isLifeStage) {
    prompt = `Transform this portrait to show: ${description}. ` +
      'Keep the same distinctive facial structure and features. Same graphic novel style.';
  } else if (isOutfit) {
    prompt = `Change this person\'s outfit to: ${description}. ` +
      'Keep face identical. Same graphic novel style.';
  } else if (isEmotion) {
    prompt = `Show this person with: ${description}. ` +
      'Keep face and body identical. Same graphic novel style.';
  } else {
    // Generic scene/pose variant
    prompt = `Place this person in: ${description}. ` +
      'Keep face identical. Same graphic novel style.';
  }

  return prompt;
}

// ── Generate slug from checklist item ──────────────────────────────────────

function generateVariantSlug(item, index) {
  // Try to extract a meaningful slug from the item
  let slug = slugify(item);

  // If too long or generic, use a numbered slug
  if (slug.length > 30 || slug === '' || slug === 'the') {
    slug = `variant_${index + 1}`;
  }

  return slug;
}

// ── Build replacement section ──────────────────────────────────────────────

function buildVariantsSection(variants, entitySlug, scale) {
  let section = `## Variants (image-to-image)\n`;
  section += `> Base image required. Run each with:\n`;
  section += `> \`akool-cli image generate --prompt "<edit_prompt>" --source-image <base_url> --scale <scale> --wait\`\n`;
  section += `> Output saved as \`${entitySlug}__<variant_slug>.png\`\n`;

  for (const v of variants) {
    section += `\n### \`${v.slug}\` — ${v.title}\n`;
    section += `**Scale:** ${v.scale}\n`;
    section += `**Edit prompt:**\n`;
    section += `${v.editPrompt}\n`;
  }

  return section;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');

  console.log(`\n🔄 Migrate Variations → Variants\n`);
  if (!apply) {
    console.log(`  ${YELLOW}DRY RUN — no files will be modified${NC}`);
    console.log(`  Run with --apply to apply changes\n`);
  }

  let totalFiles = 0;
  let migrated = 0;
  let skipped = 0;
  let noVariations = 0;

  for (const dir of CONTENT_DIRS) {
    const files = findPromptFiles(dir);
    for (const file of files) {
      totalFiles++;
      const content = fs.readFileSync(file, 'utf-8');
      const variations = parseVariations(content);

      if (!variations) {
        noVariations++;
        continue;
      }

      const entityType = detectEntityType(file);
      const entitySlug = extractEntitySlug(file);
      const baseScale = detectScale(entityType, content);

      // Build variants from checklist items
      const variants = variations.items.map((item, i) => ({
        slug: generateVariantSlug(item, i),
        title: item,
        scale: baseScale,
        editPrompt: generateEditPrompt(item, entityType, content),
      }));

      // Check if file already has ## Variants section
      if (content.includes('## Variants (image-to-image)') && !force) {
        console.log(`  ⏭️  ${path.relative(ROOT, file)} (already has variants section)`);
        skipped++;
        continue;
      }

      const newSection = buildVariantsSection(variants, entitySlug, baseScale);
      const newContent = content.replace(variations.fullMatch, newSection);

      if (apply) {
        fs.writeFileSync(file, newContent, 'utf-8');
        console.log(`  ✅ ${path.relative(ROOT, file)} (${variants.length} variants)`);
      } else {
        console.log(`  📝 ${path.relative(ROOT, file)} (${variants.length} variants)`);
        // Show preview
        for (const v of variants) {
          console.log(`      - \`${v.slug}\`: ${v.title}`);
        }
      }
      migrated++;
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`  Total prompt files: ${totalFiles}`);
  console.log(`  Already have variants: ${noVariations}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped (already done): ${skipped}`);

  if (!apply && migrated > 0) {
    console.log(`\n  Run with --apply to apply ${migrated} changes`);
  }
}

// ANSI colors (inline to avoid import issues)
const YELLOW = '\x1b[1;33m';
const NC = '\x1b[0m';

main();
