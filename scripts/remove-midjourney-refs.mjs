#!/usr/bin/env node

/**
 * remove-midjourney-refs.mjs
 *
 * One-off migration: removes MidJourney tool references from .prompt.md
 * files and converts the --ar size flag to frontmatter metadata. Also strips
 * inline size prose (pixel dimensions / "aspect ratio" phrases) from prompt
 * bodies so all size info lives only in frontmatter.
 *
 * Usage:
 *   node scripts/remove-midjourney-refs.mjs              # dry-run
 *   node scripts/remove-midjourney-refs.mjs --apply       # write changes
 *   node scripts/remove-midjourney-refs.mjs --apply --filter content/characters
 */

import fs from 'node:fs';
import path from 'node:path';

const CONTENT_ROOT = path.resolve('content');
const APPLY = process.argv.includes('--apply');
const filterIdx = process.argv.indexOf('--filter');
const FILTER = filterIdx >= 0 ? path.resolve(process.argv[filterIdx + 1]) : null;

// Matches: **Tool:** MidJourney --v 6 --ar 3:4 --style raw
const MJ_TOOL_RE = /\*\*Tool:\*\* MidJourney --v 6 --ar (\d+:\d+) --style raw\n?/i;

// Inline size prose to strip from prompt bodies.
// These are fragments that embed pixel dimensions or aspect-ratio prose
// directly in the generation prompt text. We only strip them when they
// appear as trailing fragments (preceded by ", " or ", " at end of sentence)
// so we never破坏 legitimate prose.
const INLINE_SIZE_RE = [
  // "Transparent background, 3:4 aspect ratio." or "...3:4 aspect ratio, 512×768."
  /,\s*3:4\s+aspect\s+ratio(?:,\s*\d+[×x]\d+)?\.?/gi,
  // trailing ", 256×256." / ", 128×128," / ", 1080×1920." / ", 1920x1080."
  /,\s*\d{3,4}[×x]\d{3,4}\.?/g,
];

// Legacy body metadata: **Dimensions:** NNNxNNN (numeric only — keep layout
// descriptions like "Multi-panel horizontal strip")
const DIMENSIONS_LINE_RE = /^[ \t]*\*\*Dimensions:\*\* \d+[×x]\d+[^\n]*\n?/gm;

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { frontmatterBlock: null, meta: {}, body: content };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) meta[k] = v;
  }
  return { frontmatterBlock: m[0], meta, body: content.slice(m[0].length) };
}

function buildFrontmatter(meta) {
  const lines = Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `---\n${lines}\n---\n`;
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf-8');
  let content = original;

  // 1. Extract MidJourney --ar from Tool line
  const arMatch = content.match(MJ_TOOL_RE);
  const aspectRatio = arMatch ? arMatch[1] : null;

  // Remove the Tool line
  content = content.replace(MJ_TOOL_RE, '');

  // Collapse double blank lines left by removal
  content = content.replace(/\n{3,}/g, '\n\n');

  // 2. Update frontmatter with aspect_ratio
  const { frontmatterBlock, meta, body } = parseFrontmatter(content);
  if (aspectRatio) {
    meta.aspect_ratio = aspectRatio;
    const newFm = buildFrontmatter(meta);
    if (frontmatterBlock) {
      content = newFm + body;
    } else {
      // No frontmatter: prepend minimal block
      content = newFm + '\n' + content;
    }
  }

  // 3. Strip inline size prose from prompt bodies
  for (const re of INLINE_SIZE_RE) {
    content = content.replace(re, '');
  }

  // 4. Strip numeric **Dimensions:** body metadata lines
  content = content.replace(DIMENSIONS_LINE_RE, '');

  // Final cleanup: collapse any accidental triple blank lines
  content = content.replace(/\n{3,}/g, '\n\n');

  const changed = content !== original;
  return { status: changed ? 'updated' : 'unchanged', from: filePath, to: changed ? content : null };
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('.') && entry.name !== '.kilo') continue;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.prompt.md')) {
      if (FILTER && full !== FILTER && !full.startsWith(FILTER + path.sep)) continue;
      acc.push(full);
    }
  }
  return acc;
}

function main() {
  const files = walk(CONTENT_ROOT);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (const f of files) {
    let result;
    try {
      result = processFile(f);
    } catch (err) {
      console.error(`  ❌ ${path.relative(process.cwd(), f)}: ${err.message}`);
      errors++;
      continue;
    }
    if (result.status === 'updated') {
      updated++;
      if (APPLY) {
        fs.writeFileSync(f, result.to, 'utf-8');
        console.log(`  ✓ ${path.relative(process.cwd(), f)}`);
      } else {
        console.log(`  • ${path.relative(process.cwd(), f)}`);
      }
    } else {
      unchanged++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 remove-midjourney-refs (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  console.log(`  Files scanned: ${files.length}`);
  console.log(`  ${APPLY ? '✓' : '•'} Would update:   ${updated}`);
  console.log(`  ⏭️  Unchanged:      ${unchanged}`);
  console.log(`  ❌ Errors:         ${errors}`);
}

main();
