#!/usr/bin/env node

/**
 * generate-pollinations-drafts.mjs
 *
 * Reads .prompt.md files from docs/lore/assets/ (recursively) and generates
 * first-draft images via Pollinations free endpoint for each prompt variant.
 *
 * Drafts are saved to a `drafts/` subdirectory next to each prompt file.
 *
 * Usage:
 *   node generate-pollinations-drafts.mjs
 *   node generate-pollinations-drafts.mjs --filter tile
 *   node generate-pollinations-drafts.mjs --filter portrait,background
 *   node generate-pollinations-drafts.mjs --force
 *   node generate-pollinations-drafts.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

// ── Config ──────────────────────────────────────────────────────────────────

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';
const PROMPT_ROOTS = [
  path.resolve('content/characters'),
  path.resolve('content/locations'),
  path.resolve('content/scenes'),
  path.resolve('content/overlays'),
  path.resolve('content/missions'),
  path.resolve('content/stories'),
  path.resolve('content/story_beats'),
  path.resolve('content/lore'),
  path.resolve('content/dialogues'),
];

const DEFAULT_DIMENSIONS = {
  tile: { width: 512, height: 512 },
  overlay: { width: 512, height: 512 },
  background: { width: 1280, height: 720 },
  'html-background': { width: 1280, height: 720 },
  portrait: { width: 512, height: 768 },
  'phone-wallpaper': { width: 1080, height: 1920 },
  'app-icon': { width: 128, height: 128 },
  biometric: { width: 1344, height: 768 },
  expression: { width: 1344, height: 768 },
  'outfit-pose': { width: 768, height: 1344 },
  thematic: { width: 1280, height: 720 },
};

const COOLDOWN_MS = 30000;
const MAX_RETRIES = 3;
const MIN_FILE_SIZE = 5000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isErrorFile(filePath) {
  if (!fs.existsSync(filePath)) return true;
  const size = fs.statSync(filePath).size;
  if (size < MIN_FILE_SIZE) {
    try {
      const head = fs.readFileSync(filePath, 'utf-8').slice(0, 400);
      if (head.includes('Too Many Requests') || head.includes('error')) return true;
    } catch {
      // binary file, probably fine
    }
  }
  return false;
}

// ── Frontmatter / Metadata Helpers ─────────────────────────────────────────

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const [k, ...v] = line.split(': ');
    if (k && v.length) meta[k.trim()] = v.join(': ').trim();
  }
  return meta;
}

function extractTypeAndSize(content) {
  const fm = parseFrontmatter(content);

  if (fm && fm.type) {
    const dimMatch = (fm.size || '').match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (dimMatch) {
      return {
        type: fm.type,
        width: parseInt(dimMatch[1], 10),
        height: parseInt(dimMatch[2], 10),
      };
    }
    const def = DEFAULT_DIMENSIONS[fm.type];
    if (def) {
      return { type: fm.type, width: def.width, height: def.height };
    }
    return { type: fm.type, width: 1024, height: 1024 };
  }

  const typeMatch = content.match(/\*\*Type:\*\* (\S+)/);
  const type = typeMatch ? typeMatch[1].trim() : 'unknown';

  const dimMatch = content.match(/\*\*Dimensions:\*\* (\d+)\s*[x×]\s*(\d+)/i);
  let width = null, height = null;
  if (dimMatch) {
    width = parseInt(dimMatch[1], 10);
    height = parseInt(dimMatch[2], 10);
  }
  if (!width || !height) {
    const def = DEFAULT_DIMENSIONS[type];
    if (def) { width = def.width; height = def.height; }
    else { width = 512; height = 512; }
  }
  return { type, width, height };
}

// ── Prompt File Parsing ────────────────────────────────────────────────────

function parsePromptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const results = [];

  const { type, width, height } = extractTypeAndSize(content);

  // 1. Try named variants first
  const promptRegex = /## Prompt — ([^\n]+)\n([\s\S]*?)(?=## Prompt — |## Negative Prompt\n|$)/g;
  let match;
  while ((match = promptRegex.exec(content)) !== null) {
    const variantName = match[1].trim();
    const promptText = match[2].trim();
    const negMatch = content.slice(match.index + match[0].length).match(/## Negative Prompt\n([\s\S]*?)(?=## Prompt — |$)/);
    const negativeText = negMatch ? negMatch[1].trim() : '';
    if (promptText) {
      results.push({ variantName, promptText, negativeText, type, width, height });
    }
  }

  // 2. Dual-prompt files
  if (results.length === 0) {
    const draftRegex = /##{1,2} Prompt \(Draft\)\n([\s\S]*?)(?=##{1,2} (?:Prompt|Negative Prompt|Sheet|Variations)|$)/g;
    let draftMatch;
    while ((draftMatch = draftRegex.exec(content)) !== null) {
      const promptText = draftMatch[1].trim();
      const afterDraft = content.slice(draftMatch.index + draftMatch[0].length);
      const negMatch = afterDraft.match(/##{1,2} Negative Prompt\n([\s\S]*?)(?=##{1,2} |$)/);
      const negativeText = negMatch ? negMatch[1].trim() : '';
      if (promptText) {
        results.push({ variantName: 'default', promptText, negativeText, type, width, height });
      }
    }
  }

  // 3. Fallback
  if (results.length === 0) {
    const singleMatch = content.match(/##{1,2} Prompt\n([\s\S]*?)(?=##{1,2} Negative Prompt|$)/);
    if (singleMatch) {
      const promptText = singleMatch[1].trim();
      const negMatch = content.match(/##{1,2} Negative Prompt\n([\s\S]*?)(?=##{1,2} |$)/);
      const negativeText = negMatch ? negMatch[1].trim() : '';
      if (promptText) {
        results.push({ variantName: 'default', promptText, negativeText, type, width, height });
      }
    }
  }

  return results;
}

// ── Pollinations Generation ─────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 60000 }, res => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function generatePollinations(variant, outPath) {
  const encoded = encodeURIComponent(variant.promptText);
  const negParam = variant.negativeText ? `&negative_prompt=${encodeURIComponent(variant.negativeText)}` : '';
  const url = `${POLLINATIONS_BASE}/${encoded}?width=${variant.width}&height=${variant.height}&nologo=true${negParam}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const buffer = await httpGet(url);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buffer);

      if (isErrorFile(outPath)) {
        fs.unlinkSync(outPath);
        throw new Error('error file');
      }
      return { ok: true, size: buffer.length };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(5000);
      } else {
        return { ok: false, error: err.message.substring(0, 80) };
      }
    }
  }
  return { ok: false, error: 'max retries exceeded' };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { filter: null, force: false, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--filter': opts.filter = args[++i]; break;
      case '--force': opts.force = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h':
        console.log(`
generate-pollinations-drafts.mjs — Generate draft images via Pollinations

Usage:
  node generate-pollinations-drafts.mjs
  node generate-pollinations-drafts.mjs --filter tile,overlay
  node generate-pollinations-drafts.mjs --force
  node generate-pollinations-drafts.mjs --dry-run
`);
        process.exit(0);
    }
  }
  if (opts.filter) opts.filterSet = new Set(opts.filter.split(',').map(s => s.trim().toLowerCase()));
  return opts;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log(`\n🎨 Pollinations Draft Generator\n`);
  console.log(`  Roots: ${PROMPT_ROOTS.join(', ')}`);
  if (opts.filter) console.log(`  Filter: ${Array.from(opts.filterSet).join(', ')}`);
  if (opts.force) console.log(`  Force: regenerate all`);
  if (opts.dryRun) console.log(`  Dry run — no downloads\n`);

  const promptFiles = [];
  function walk(dir) {
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
  for (const root of PROMPT_ROOTS) {
    if (fs.existsSync(root)) walk(root);
  }

  const workItems = [];
  for (const promptFile of promptFiles) {
    const variants = parsePromptFile(promptFile);
    const filtered = opts.filterSet ? variants.filter(v => opts.filterSet.has(v.type)) : variants;
    if (filtered.length === 0) continue;

    const promptDir = path.dirname(promptFile);
    const draftDir = path.join(promptDir, 'assets');
    const baseName = path.basename(promptFile, '.prompt.md');

    for (const variant of filtered) {
      const fileName = `${baseName}__${slugify(variant.variantName)}`;
      const basePath = path.join(draftDir, `${fileName}.png`);
      workItems.push({ relPath: baseName, variant, basePath, draftDir, fileName });
    }
  }

  console.log(`  Found ${workItems.length} prompt variants\n`);

  if (opts.dryRun) {
    for (const item of workItems) {
      console.log(`  📄 ${item.relPath} [${item.variant.variantName}] ${item.variant.width}×${item.variant.height}`);
    }
    return;
  }

  let ok = 0, skipped = 0, failed = 0;
  let nextAvailable = 0;

  for (const item of workItems) {
    const { relPath, variant, basePath, draftDir, fileName } = item;
    const label = `[${variant.variantName}]`;

    if (!opts.force && fs.existsSync(basePath) && !isErrorFile(basePath)) {
      console.log(`  ⏭️  ${relPath} ${label} — exists`);
      skipped++;
      continue;
    }

    let outPath = basePath;
    if (fs.existsSync(basePath) || opts.force) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      outPath = path.join(draftDir, `${fileName}__${ts}.png`);
    }

    const now = Date.now();
    if (now < nextAvailable) {
      const waitMs = nextAvailable - now;
      console.log(`  ⏳ Cooldown: ${Math.ceil(waitMs / 1000)}s...`);
      await sleep(waitMs);
    }

    console.log(`\n  📄 ${relPath} ${label}`);
    const result = await generatePollinations(variant, outPath);
    nextAvailable = Date.now() + COOLDOWN_MS;

    if (result.ok) {
      console.log(`     ✅ ${path.basename(outPath)} (${result.size} bytes)`);
      ok++;
    } else {
      console.log(`     ❌ Failed: ${result.error}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total prompts:  ${workItems.length}`);
  console.log(`  ✅ Generated:   ${ok}`);
  console.log(`  ⏭️  Skipped:    ${skipped}`);
  console.log(`  ❌ Failed:      ${failed}`);
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});