#!/usr/bin/env node

/**
 * generate-nim-drafts.mjs
 *
 * Reads .prompt.md files from docs/lore/assets/ui-concepts/ and generates
 * first-draft images via NVIDIA NIM (FLUX.2 Klein) for each prompt variant.
 *
 * Drafts are saved to a `drafts/` subdirectory next to each prompt file.
 *
 * Usage:
 *   node generate-nim-drafts.mjs
 *   node generate-nim-drafts.mjs --filter tile
 *   node generate-nim-drafts.mjs --filter portrait,background
 *   node generate-nim-drafts.mjs --force
 *   node generate-nim-drafts.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';

const PROMPT_ROOT = path.resolve('docs/lore/assets/ui-concepts');
const NVIDIA_API_KEY = (() => {
  const envPath = path.resolve(process.cwd(), '.env');
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const m = content.match(/^NVIDIA_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return process.env.NVIDIA_API_KEY || null;
  }
})();

const INVOKE_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';
const SUPPORTED_RESOLUTIONS = [
  { width: 672, height: 1568 },
  { width: 688, height: 1504 },
  { width: 720, height: 1456 },
  { width: 752, height: 1392 },
  { width: 800, height: 1328 },
  { width: 832, height: 1248 },
  { width: 880, height: 1184 },
  { width: 944, height: 1104 },
  { width: 1024, height: 1024 },
  { width: 1104, height: 944 },
  { width: 1184, height: 880 },
  { width: 1248, height: 832 },
  { width: 1328, height: 800 },
  { width: 1392, height: 752 },
  { width: 1456, height: 720 },
  { width: 1504, height: 688 },
  { width: 1568, height: 672 },
];

function pickSupportedResolution(width, height) {
  if (!width || !height) return { width: 1024, height: 1024 };
  const inputRatio = width / height;
  let best = SUPPORTED_RESOLUTIONS[0];
  let bestDiff = Math.abs(inputRatio - best.width / best.height);
  for (const r of SUPPORTED_RESOLUTIONS) {
    const diff = Math.abs(inputRatio - r.width / r.height);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

const DEFAULT_DIMENSIONS = {
  tile: { width: 1024, height: 1024 },
  overlay: { width: 1024, height: 1024 },
  background: { width: 1392, height: 752 },
  'html-background': { width: 1248, height: 832 },
  portrait: { width: 832, height: 1248 },
  'phone-wallpaper': { width: 752, height: 1392 },
  'app-icon': { width: 1024, height: 1024 },
};

const REQUEST_DELAY_MS = 2000;
const MAX_RETRIES = 6;
const INITIAL_BACKOFF_MS = 60000;
const MIN_FILE_SIZE = 5000;
const RPM_LIMIT = 35;
const WINDOW_MS = 60000;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { filter: null, force: false, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--filter': opts.filter = args[++i]; break;
      case '--force': opts.force = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h':
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
generate-nim-drafts.mjs — Generate drafts via NVIDIA NIM FLUX.2 Klein

Usage:
  node generate-nim-drafts.mjs
  node generate-nim-drafts.mjs --filter tile
  node generate-nim-drafts.mjs --filter portrait,background
  node generate-nim-drafts.mjs --force
  node generate-nim-drafts.mjs --dry-run
  node generate-nim-drafts.mjs --help

Options:
  --filter <types>   Comma-separated asset types to generate
  --force            Regenerate drafts even if valid files already exist
  --dry-run          Preview what would be generated without downloading
  --help, -h         Show this help
`);
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function cleanNegativePrompt(text) {
  let t = (text || '').trim();
  if (!t) return '';
  t = t.replace(/^--no\s+/, 'no ');
  t = t.replace(/^--no$/, 'no');
  return t.trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class TokenBucket {
  constructor(rate, perMs) {
    this.rate = rate;
    this.perMs = perMs;
    this.tokens = rate;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const toAdd = Math.floor((elapsed / this.perMs) * this.rate);
    if (toAdd > 0) {
      this.tokens = Math.min(this.rate, this.tokens + toAdd);
      this.lastRefill = now;
    }
  }

  async take() {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    const waitMs = (this.perMs / this.rate) * (1 - this.tokens / this.rate);
    await sleep(waitMs);
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
}

const bucket = new TokenBucket(RPM_LIMIT, WINDOW_MS);

function parsePromptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const results = [];

  const typeMatch = content.match(/\*\*Type:\*\* (\S+)/);
  const type = typeMatch ? typeMatch[1].trim() : 'unknown';

  const dimMatch = content.match(/\*\*Dimensions:\*\* (\d+)×(\d+)/);
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
      width = 1024;
      height = 1024;
    }
  }

  const resolved = pickSupportedResolution(width, height);
  width = resolved.width;
  height = resolved.height;

  const promptRegex = /## Prompt — ([^\n]+)\n([\s\S]*?)(?=## Prompt — |## Negative Prompt |$)/g;
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
  return results;
}

async function httpGet(url) {
  const res = await fetch(url, { timeout: 30000 });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
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

async function generateNIM(promptData, outDir, baseName, force) {
  const fileName = `${baseName}__${slugify(promptData.variantName)}.png`;
  const outPath = path.join(outDir, fileName);

  if (!force && fs.existsSync(outPath) && !isErrorFile(outPath)) {
    return { status: 'skipped', path: outPath };
  }

  const negativePrompt = cleanNegativePrompt(promptData.negativeText);
  const prompt = negativePrompt
    ? `${promptData.promptText}\n\nNO ${negativePrompt}`
    : promptData.promptText;

  const payload = {
    prompt,
    width: promptData.width,
    height: promptData.height,
    seed: 0,
    steps: 4,
  };

  fs.mkdirSync(outDir, { recursive: true });

  let lastError;
  let wait = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await bucket.take();

      const res = await fetch(INVOKE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log(`DEBUG: NIM status ${res.status}`);

      if (res.status === 429) {
        const errText = await res.text();
        lastError = new Error(`rate limited (429): ${errText}`);
        console.log(`DEBUG: attempt ${attempt} rate limited, backing off ${wait/1000}s...`);
        await sleep(wait);
        wait = Math.min(wait * 1.5, 300000);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const body = await res.json();
      const artifact = body.artifacts?.[0];
      if (artifact?.finishReason === 'CONTENT_FILTERED') {
        console.warn(`    ⚠️  content filtered (seed: ${artifact.seed || '?'})`);
        return { status: 'failed', path: outPath, error: 'content_filtered' };
      }
      const b64 = artifact?.base64;
      if (!b64) {
        console.error('DEBUG: NIM response body:', JSON.stringify(body, null, 2).slice(0, 2000));
        throw new Error('no base64 artifact in response');
      }

      const buffer = Buffer.from(b64, 'base64');
      fs.writeFileSync(outPath, buffer);

      if (isErrorFile(outPath)) {
        fs.unlinkSync(outPath);
        throw new Error('downloaded file looks like an error response');
      }

      return { status: 'ok', path: outPath, size: buffer.length };
    } catch (err) {
      lastError = err;
      console.log(`DEBUG: attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(wait);
        wait = Math.min(wait * 1.5, 300000);
      }
    }
  }

  return { status: 'failed', path: outPath, error: lastError.message };
}

async function main() {
  if (!NVIDIA_API_KEY) {
    console.error('ERROR: NVIDIA_API_KEY missing. Add it to .env or environment.');
    process.exit(1);
  }

  const opts = parseArgs();

  console.log(`\n🎨 NVIDIA NIM Draft Generator (FLUX.2 Klein)`);
  console.log(`  Root: ${PROMPT_ROOT}`);
  console.log(`  RPM client-side limit: ${RPM_LIMIT}/min`);
  if (opts.filterSet) console.log(`  Filter: ${Array.from(opts.filterSet).join(', ')}`);
  if (opts.force) console.log(`  Force: regenerate all`);
  if (opts.dryRun) console.log(`  Dry run — no downloads\n`);

  const promptFiles = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.prompt.md')) promptFiles.push(full);
    }
  }
  walk(PROMPT_ROOT);

  let totalPrompts = 0;
  let skipped = 0;
  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const promptFile of promptFiles) {
    const relFromRoot = path.relative(PROMPT_ROOT, promptFile);
    const variants = parsePromptFile(promptFile);
    const filtered = opts.filterSet ? variants.filter(v => opts.filterSet.has(v.type)) : variants;
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

      const result = await generateNIM(variant, draftDir, baseName, opts.force);
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

      if (result.status !== 'skipped') {
        console.log(`    ⏳ Waiting ${REQUEST_DELAY_MS / 1000}s before next request...`);
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }

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
    failures.forEach(f => console.log(`  - ${f.file} [${f.variant}]: ${f.error}`));
    console.log();
    process.exitCode = 1;
  } else if (ok > 0) {
    console.log('All drafts generated successfully. ✅');
  }

  console.log(`\n💡 Tip: Run with --filter to generate specific types, e.g.:`);
  console.log(`   node ${process.argv[1]} --filter tile`);
  console.log(`   node ${process.argv[1]} --filter portrait,background`);
  console.log();
}

main();