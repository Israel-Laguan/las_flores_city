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
  path.resolve('docs/lore/shared/assets'),
  ...getLandmarkDirs(),
  path.resolve('docs/lore/figures'),
];

const DEFAULT_DIMENSIONS = {
  tile: { width: 512, height: 512 },
  overlay: { width: 512, height: 512 },
  background: { width: 1280, height: 720 },
  'html-background': { width: 1280, height: 720 },
  portrait: { width: 512, height: 768 },
  'phone-wallpaper': { width: 1080, height: 1920 },
  'app-icon': { width: 128, height: 128 },
};

const REQUEST_DELAY_MS = 30000; // 30s between requests (Pollinations rate limit)
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 15000;
const MIN_FILE_SIZE = 5000;

// ── CLI Flags ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { filter: null, force: false, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--filter':
        opts.filter = args[++i];
        break;
      case '--force':
        opts.force = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  if (opts.filter) {
    opts.filterSet = new Set(opts.filter.split(',').map(s => s.trim().toLowerCase()));
  }

  return opts;
}

function printHelp() {
  console.log(`
generate-pollinations-drafts.mjs — Generate Pollinations drafts from .prompt.md files

Usage:
  node generate-pollinations-drafts.mjs
  node generate-pollinations-drafts.mjs --filter tile
  node generate-pollinations-drafts.mjs --filter portrait,background
  node generate-pollinations-drafts.mjs --force
  node generate-pollinations-drafts.mjs --dry-run
  node generate-pollinations-drafts.mjs --help

Options:
  --filter <types>   Comma-separated asset types to generate (tile, overlay, background, portrait, phone-wallpaper, app-icon)
  --force            Regenerate drafts even if valid files already exist
  --dry-run          Preview what would be generated without downloading
  --help, -h         Show this help
`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 30000 }, res => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`Request failed with status code ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

// ── Frontmatter / Metadata Helpers ─────────────────────────────────────────

/**
 * Parse YAML frontmatter from content. Returns null if no frontmatter found.
 */
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

/**
 * Extract type and dimensions from content, checking frontmatter first,
 * then falling back to bold markdown lines.
 */
function extractTypeAndSize(content) {
  const fm = parseFrontmatter(content);

  // Try frontmatter first
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
    return { type: fm.type, width: 512, height: 512 };
  }

  // Fallback: bold markdown lines
  const typeMatch = content.match(/\*\*Type:\*\* (\S+)/);
  const type = typeMatch ? typeMatch[1].trim() : 'unknown';

  const dimMatch = content.match(/\*\*Dimensions:\*\* (\d+)\s*[x×]\s*(\d+)/i);
  let width = null;
  let height = null;
  if (dimMatch) {
    width = parseInt(dimMatch[1], 10);
    height = parseInt(dimMatch[2], 10);
  }

  if (!width || !height) {
    const def = DEFAULT_DIMENSIONS[type];
    if (def) {
      width = def.width;
      height = def.height;
    } else {
      width = 512;
      height = 512;
    }
  }
  return { type, width, height };
}

// ── Prompt File Parsing ─────────────────────────────────────────────────────

function parsePromptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const results = [];

  const { type, width, height } = extractTypeAndSize(content);

  // Extract all prompt variants: ## Prompt — <name> ... until next ## Prompt — or ## Negative Prompt
  const promptRegex = /## Prompt — ([^\n]+)\n([\s\S]*?)(?=## Prompt — |## Negative Prompt\n|$)/g;
  let match;

  while ((match = promptRegex.exec(content)) !== null) {
    const variantName = match[1].trim();
    const promptText = match[2].trim();

    // Find the negative prompt that follows this prompt section
    const negMatch = content.slice(match.index + match[0].length).match(/## Negative Prompt\n([\s\S]*?)(?=## Prompt — |$)/);
    const negativeText = negMatch ? negMatch[1].trim() : '';

    if (promptText) {
      results.push({
        variantName,
        promptText,
        negativeText,
        type,
        width,
        height,
      });
    }
  }

  // Fallback: if no named variants found, try single ## Prompt section
  if (results.length === 0) {
    const singlePromptMatch = content.match(/## Prompt\n([\s\S]*?)(?=## Negative Prompt|$)/);
    if (singlePromptMatch) {
      const promptText = singlePromptMatch[1].trim();
      const negMatch = content.match(/## Negative Prompt\n([\s\S]*?)(?=## |$)/);
      const negativeText = negMatch ? negMatch[1].trim() : '';
      if (promptText) {
        results.push({
          variantName: 'default',
          promptText,
          negativeText,
          type,
          width,
          height,
        });
      }
    }
  }

  return results;
}

// ── Download ────────────────────────────────────────────────────────────────

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

async function downloadDraft(promptData, outDir, baseName, force) {
  const fileName = `${baseName}__${slugify(promptData.variantName)}.png`;
  const outPath = path.join(outDir, fileName);

  if (!force && fs.existsSync(outPath) && !isErrorFile(outPath)) {
    return { status: 'skipped', path: outPath };
  }

  // Ensure the drafts directory exists
  fs.mkdirSync(outDir, { recursive: true });

  // Build prompt string: positive only, negative passed separately
  const fullPrompt = promptData.promptText;

  const encoded = encodeURIComponent(fullPrompt);
  const url = `${POLLINATIONS_BASE}/${encoded}?width=${promptData.width}&height=${promptData.height}&nologo=true${promptData.negativeText ? `&negative_prompt=${encodeURIComponent(promptData.negativeText)}` : ''}`;


  let lastError;
  let wait = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const buffer = await httpGet(url);

      fs.writeFileSync(outPath, buffer);

      if (isErrorFile(outPath)) {
        fs.unlinkSync(outPath);
        throw new Error('downloaded file looks like an error response');
      }

      return { status: 'ok', path: outPath, size: buffer.length };
    } catch (err) {
      lastError = err;

      if (attempt < MAX_RETRIES) {
        console.log(`    ⚠️  attempt ${attempt}/${MAX_RETRIES} failed: ${err.message.substring(0, 80)}`);
        console.log(`    ⏳ retrying in ${wait / 1000}s...`);
        await sleep(wait);
        wait = Math.min(wait * 1.5, 60000);
      }
    }
  }

  return { status: 'failed', path: outPath, error: lastError.message };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log(`\n🎨 Pollinations Draft Generator\n`);
  console.log(`  Roots: ${PROMPT_ROOTS.join(', ')}`);
  if (opts.filterSet) {
    console.log(`  Filter: ${Array.from(opts.filterSet).join(', ')}`);
  }
  if (opts.force) console.log(`  Force: regenerate all`);
  if (opts.dryRun) console.log(`  Dry run — no downloads\n`);

  // Walk all .prompt.md files
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

  let totalPrompts = 0;
  let skipped = 0;
  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const promptFile of promptFiles) {
    const relFromRoot = path.basename(promptFile);
    const variants = parsePromptFile(promptFile);

    // Filter by type if specified
    const filtered = opts.filterSet
      ? variants.filter(v => opts.filterSet.has(v.type))
      : variants;

    if (filtered.length === 0) continue;

    const promptBase = promptFile.replace(/\.md$/, '');
    const draftDir = path.join(promptBase, 'drafts');
    const baseName = path.basename(promptFile, '.prompt.md');

    console.log(`\n📄 ${relFromRoot} (${filtered.length} prompt(s))`);

    for (const variant of filtered) {
      totalPrompts++;
      const label = `  [${variant.variantName}]`;

      if (opts.dryRun) {
        console.log(`${label} would download ${variant.width}x${variant.height}`);
        skipped++;
        continue;
      }

      const result = await downloadDraft(variant, draftDir, baseName, opts.force);

      switch (result.status) {
        case 'ok':
          console.log(`${label} ✅ ${path.basename(result.path)} (${result.size} bytes)`);
          ok++;
          break;
        case 'skipped':
          console.log(`${label} ⏭️  skipped (exists)`);
          skipped++;
          break;
        case 'failed':
          console.log(`${label} ❌ failed: ${result.error}`);
          failed++;
          failures.push({ file: relFromRoot, variant: variant.variantName, error: result.error });
          break;
      }

      // Delay between requests to respect rate limits
        // 30s delay between non-skipped requests to respect Pollinations rate limits
      if (result.status !== 'skipped') {
        console.log(`    ⏳ Waiting ${REQUEST_DELAY_MS / 1000}s before next request...`);
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Prompt files scanned: ${promptFiles.length}`);
  console.log(`  Total prompt variants: ${totalPrompts}`);
  console.log(`  ✅ Generated:         ${ok}`);
  console.log(`  ⏭️  Skipped:          ${skipped}`);
  console.log(`  ❌ Failed:            ${failed}`);
  console.log();

  if (failures.length > 0) {
    console.log('Failed assets:');
    for (const f of failures) {
      console.log(`  - ${f.file} [${f.variant}]: ${f.error}`);
    }
    console.log();
    process.exitCode = 1;
  } else if (ok > 0) {
    console.log('All drafts generated successfully. ✅');
  }

  console.log(`\n💡 Tip: Run with --filter to generate specific types, e.g.:`);
  console.log(`   node ${process.argv[1]} --filter tile`);
  console.log(`   node ${process.argv[1]} --filter portrait,background`);
  console.log(`   node ${process.argv[1]} --filter overlay`);
  console.log();
}

main();