#!/usr/bin/env node

/**
 * backfill-draft-prompts.mjs
 *
 * Walks all .prompt.md files in docs/lore/ and for any file lacking a
 * ## Prompt (Draft) section, inserts one (≤800 chars NIM-safe) derived from
 * the existing ## Prompt. Also adds YAML frontmatter (name, type, size, source,
 * target, tool, consumer) normalized from the bold metadata lines.
 *
 * Preserves ## Prompt, ## Negative Prompt, ## Variations exactly.
 * Idempotent — skips files that already have ## Prompt (Draft).
 *
 * Usage:
 *   node backfill-draft-prompts.mjs            # dry-run (preview)
 *   node backfill-draft-prompts.mjs --apply    # write changes
 *   node backfill-draft-prompts.mjs --apply --force  # re-process all
 */

import fs from 'node:fs';
import path from 'node:path';

const PROMPT_ROOTS = [
  path.resolve('docs/lore/shared/assets'),
  ...getLandmarkDirs(),
  path.resolve('docs/lore/figures'),
  path.resolve('docs/lore/media'),
];

const MAX_NIM_LENGTH = 800;
const STYLE = 'photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k';
const NEG = 'photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality';

// Default size map by type (used when no Dimensions line exists)
const DEFAULT_SIZES = {
  tile: '1024x1024',
  overlay: '1024x1024',
  background: '1280x768',
  'html-background': '1280x768',
  portrait: '1024x1024',
  'phone-wallpaper': '768x1344',
  'app-icon': '1024x1024',
  biometric: '1344x768',
  expression: '1344x768',
  'outfit-pose': '768x1344',
};

// Content-safe replacements matching generate-drafts-unified.mjs
const CONTENT_SAFE_REPLACEMENTS = [
  [/\bgovernor\b/gi, 'civic leader'],
  [/\bgovernment\b/gi, 'public'],
  [/\boppressive\b/gi, 'formal'],
  [/\bpresidential\b/gi, 'executive'],
  [/\bprotest\b/gi, 'gathering'],
  [/\bdam\b/gi, 'water reservoir'],
  [/\bgritty\b/gi, 'textured'],
  [/\bgraffiti\b/gi, 'street art'],
  [/\bslum\b/gi, 'dense neighborhood'],
  [/\bghetto\b/gi, 'urban district'],
  [/\bandoned\b/gi, 'unoccupied'],
  [/\btense\b/gi, ''],
  [/\bmenacing\b/gi, ''],
  [/\bterrifying\b/gi, ''],
  [/\bhorrifying\b/gi, ''],
  [/\bblood\b/gi, 'red liquid'],
  [/\bweapon\b/gi, 'object'],
  [/\bmurder\b/gi, 'incident'],
  [/\bfight\b/gi, 'confrontation'],
  [/\bwar\b/gi, 'conflict'],
];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function hasFrontmatter(content) {
  return content.startsWith('---');
}

function hasDraftSection(content) {
  // Look for ## Prompt (Draft) or ### Prompt (Draft)
  return /^#{2,3} Prompt \(Draft\)\s*\n/m.test(content);
}

function parseBoldMetadata(line, key) {
  const re = new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`);
  const m = line.match(re);
  return m ? m[1].trim() : '';
}

function extractExistingMetadata(content) {
  // Extract values from bold markdown lines in the header block
  const nameMatch = content.match(/^# Prompt:\s*(.+)$/m);
  const type = parseBoldMetadata(content, 'Type') || parseBoldMetadata(content, 'Consumer');
  const source = parseBoldMetadata(content, 'Source');
  const target = parseBoldMetadata(content, 'Target field');
  const tool = parseBoldMetadata(content, 'Tool');
  const consumerMatch = content.match(/^\[CONSUMER:\s*(\S+)\]/m);
  const dimMatch = content.match(/\*\*Dimensions:\*\*\s*(\d+)\s*[x×]\s*(\d+)/i);
  const stage = parseBoldMetadata(content, 'Pipeline stage');

  let size = dimMatch ? `${dimMatch[1]}x${dimMatch[2]}` : '';
  if (!size && DEFAULT_SIZES[type]) size = DEFAULT_SIZES[type];

  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    type: type || '',
    size,
    source: source || '',
    target: target || '',
    tool: tool || '',
    consumer: consumerMatch ? consumerMatch[1] : type,
    stage: stage || '',
  };
}

function extractFullPrompt(content) {
  const m = content.match(/^#{1,2}\s+Prompt\s*\n([\s\S]*?)(?=^#{1,2}\s+(?:Negative Prompt|Prompt \(Draft\)|$))/m);
  return m ? m[1].trim() : '';
}

function extractNegativePrompt(content) {
  const m = content.match(/^#{1,2}\s+Negative Prompt\s*\n([\s\S]*?)(?=^#{1,2}\s+|$)/m);
  return m ? m[1].trim() : '';
}

function cleanNegativePrompt(text) {
  let t = (text || '').trim();
  if (!t) return '';
  t = t.replace(/^--no\s+/, 'no ');
  t = t.replace(/^--no$/, 'no');
  return t.trim();
}

function buildDraftPrompt(fullPromptText, negativeText) {
  let scene = (fullPromptText || '')
    .replace(/Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k\.?\s*/gi, '')
    .replace(/Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k\.?\s*/gi, '')
    .replace(/\d+\s*[x×]\s*\d+\.?\s*/g, '')
    .trim();

  // Apply content-safe replacements
  CONTENT_SAFE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    scene = scene.replace(pattern, replacement);
  });

  // Remove excessive repetition (>2 occurrences of any word)
  const words = scene.split(/\s+/);
  const wordCount = {};
  const filteredWords = [];
  for (const word of words) {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!cleanWord || cleanWord.length <= 3) {
      filteredWords.push(word);
      continue;
    }
    wordCount[cleanWord] = (wordCount[cleanWord] || 0) + 1;
    if (wordCount[cleanWord] <= 2) {
      filteredWords.push(word);
    }
  }
  scene = filteredWords.join(' ');

  // Combine
  const neg = cleanNegativePrompt(negativeText);
  let combined = neg ? `${scene}. ${STYLE}. NO ${NEG}, ${neg}` : `${scene}. ${STYLE}. NO ${NEG}`;
  if (combined.length > MAX_NIM_LENGTH) {
    const maxScene = MAX_NIM_LENGTH - STYLE.length - NEG.length - 10;
    scene = scene.substring(0, maxScene).trim();
    combined = neg ? `${scene}. ${STYLE}. NO ${NEG}, ${neg}` : `${scene}. ${STYLE}. NO ${NEG}`;
    if (combined.length > MAX_NIM_LENGTH) {
      // Emergency truncation
      combined = combined.substring(0, MAX_NIM_LENGTH - 3) + '...';
    }
  }
  return combined;
}

function buildFrontmatterYAML(meta) {
  const lines = ['---'];
  if (meta.name) lines.push(`name: ${meta.name}`);
  if (meta.type) lines.push(`type: ${meta.type}`);
  if (meta.size) lines.push(`size: ${meta.size}`);
  if (meta.source) lines.push(`source: ${meta.source}`);
  if (meta.target) lines.push(`target: ${meta.target}`);
  if (meta.consumer) lines.push(`consumer: ${meta.consumer}`);
  lines.push('---');
  return lines.join('\n');
}

function extractExistingFrontmatterBlock(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? m[0] : null;
}

function stripFrontmatterBlock(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function parseExistingFrontmatter(yamlBlock) {
  const meta = {};
  const yamlLines = yamlBlock.replace(/^---\n/, '').replace(/\n---$/, '').split('\n');
  for (const line of yamlLines) {
    const [k, ...v] = line.split(': ');
    if (k && v.length) meta[k.trim()] = v.join(': ').trim();
  }
  return meta;
}

function processFile(filePath, apply, force, cleanFm) {
  const original = fs.readFileSync(filePath, 'utf-8');
  let content = original;

  // If --clean-fm, strip only tool from frontmatter (keep type)
  if (cleanFm) {
    const existingFm = extractExistingFrontmatterBlock(content);
    if (existingFm) {
      const lines = existingFm.split('\n');
      const cleaned = lines.filter(l => !l.startsWith('tool:'));
      const newFm = cleaned.join('\n');
      if (newFm !== existingFm) {
        content = newFm + '\n' + stripFrontmatterBlock(content);
      }
    }
  }

  // Check if draft section already exists
  if (hasDraftSection(content) && !force) {
    if (content !== original) {
      if (!apply) return { status: 'would-change-fm', file: path.basename(filePath) };
      fs.writeFileSync(filePath, content, 'utf-8');
      return { status: 'cleaned-fm', file: path.basename(filePath) };
    }
    return { status: 'skipped-draft', file: path.basename(filePath) };
  }

  // Extract existing metadata from bold lines
  const meta = extractExistingMetadata(content);
  if (!meta.type) {
    return { status: 'skipped-no-type', file: path.basename(filePath) };
  }

  // Extract prompt and negative
  const fullPrompt = extractFullPrompt(content);
  const negativeText = extractNegativePrompt(content);

  if (!fullPrompt) {
    return { status: 'skipped-no-prompt', file: path.basename(filePath) };
  }

  // Build draft prompt
  const draftText = buildDraftPrompt(fullPrompt, negativeText);

  // Build frontmatter
  const existingFm = extractExistingFrontmatterBlock(content);
  let newContent;

  if (existingFm) {
    // Update existing frontmatter with any missing fields
    const existingMeta = parseExistingFrontmatter(existingFm);
    const mergedMeta = { ...existingMeta, ...meta };
    // Don't overwrite existing values
    Object.keys(existingMeta).forEach(k => { mergedMeta[k] = existingMeta[k]; });
    const newFm = buildFrontmatterYAML(mergedMeta);
    newContent = newFm + '\n' + stripFrontmatterBlock(content);
  } else {
    // Add frontmatter
    newContent = buildFrontmatterYAML(meta) + '\n\n' + content;
  }

  // Insert ## Prompt (Draft) before ## Prompt if missing
  if (!hasDraftSection(newContent)) {
    // Find the ## Prompt line and insert before it
    const promptSectionStart = newContent.search(/^#{1,2}\s+Prompt\s*\n/m);
    if (promptSectionStart !== -1) {
      const before = newContent.substring(0, promptSectionStart);
      const after = newContent.substring(promptSectionStart);
      newContent = before + `## Prompt (Draft)\n${draftText}\n\n` + after;
    }
  }

  // Skip if nothing changed
  if (newContent === original && !force) {
    return { status: 'unchanged', file: path.basename(filePath) };
  }

  if (!apply) {
    return { status: 'would-change', file: path.basename(filePath) };
  }

  fs.writeFileSync(filePath, newContent, 'utf-8');
  return { status: 'updated', file: path.basename(filePath) };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { apply: false, force: false, cleanFm: false };
  for (const arg of args) {
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--clean-fm') opts.cleanFm = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
backfill-draft-prompts.mjs — Add ## Prompt (Draft) + YAML frontmatter to .prompt.md files

Usage:
  node backfill-draft-prompts.mjs              # dry-run (preview)
  node backfill-draft-prompts.mjs --apply      # write changes
  node backfill-draft-prompts.mjs --apply --force  # re-process all
  node backfill-draft-prompts.mjs --apply --clean-fm  # strip type/tool from frontmatter
`);
      process.exit(0);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs();

  console.log(`\n📝 Prompt Backfill Tool\n`);
  if (!opts.apply) console.log(`  🔍 Dry-run mode (use --apply to write changes)`);
  if (opts.force) console.log(`  ⚠️  Force mode (re-process all files)`);
  console.log(`  Roots: ${PROMPT_ROOTS.join(', ')}\n`);

  // Walk all .prompt.md files
  const promptFiles = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'references') continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.prompt.md')) {
        promptFiles.push(full);
      }
    }
  }
  for (const root of PROMPT_ROOTS) walk(root);

  console.log(`  Found ${promptFiles.length} prompt files\n`);

  const stats = { updated: 0, 'skipped-draft': 0, 'skipped-no-type': 0, 'skipped-no-prompt': 0, unchanged: 0, 'would-change': 0, 'cleaned-fm': 0, 'would-change-fm': 0 };

  for (const file of promptFiles) {
    const result = processFile(file, opts.apply, opts.force, opts.cleanFm);
    stats[result.status]++;
    if (result.status === 'updated') {
      console.log(`  ✅ ${result.file}`);
    } else if (result.status === 'would-change') {
      console.log(`  📋 ${result.file} — would add draft + frontmatter`);
    } else if (opts.apply && result.status === 'skipped-draft') {
      // quiet for skipped-draft in apply mode (too many)
    } else if (opts.apply && result.status === 'unchanged') {
      // quiet
    } else {
      console.log(`  ℹ️  ${result.file} — ${result.status.replace('skipped-', 'no ')}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total files:   ${promptFiles.length}`);
  if (opts.apply) {
    console.log(`  ✅ Updated:     ${stats.updated}`);
    console.log(`  🧹 Cleaned FM:  ${stats['cleaned-fm']}`);
    console.log(`  ⏭️  Had draft:   ${stats['skipped-draft']}`);
    console.log(`  ℹ️  No type:     ${stats['skipped-no-type']}`);
    console.log(`  ℹ️  No prompt:   ${stats['skipped-no-prompt']}`);
  } else {
    console.log(`  📋 Would change: ${stats['would-change']}`);
    console.log(`  🧹 Would clean FM: ${stats['would-change-fm']}`);
    console.log(`  ⏭️  Has draft:    ${stats['skipped-draft']}`);
    console.log(`  ℹ️  No type:      ${stats['skipped-no-type']}`);
    console.log(`  ℹ️  No prompt:    ${stats['skipped-no-prompt']}`);
    console.log(`\n  Run with --apply to write changes`);
  }
  console.log();
}

main();