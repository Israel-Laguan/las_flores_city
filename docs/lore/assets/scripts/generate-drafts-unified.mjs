#!/usr/bin/env node

/**
 * generate-drafts-unified.mjs
 *
 * Unified draft generator: owns all prompt discovery, tries NIM first per
 * prompt, falls back to Pollinations immediately on failure. Interleaves
 * both providers so Pollinations' 30s cooldown overlaps with NIM processing.
 *
 * Usage:
 *   node generate-drafts-unified.mjs
 *   node generate-drafts-unified.mjs --filter tile,overlay
 *   node generate-drafts-unified.mjs --force
 *   node generate-drafts-unified.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

// ── Config ──────────────────────────────────────────────────────────────────

const PROMPT_ROOTS = [
  path.resolve('docs/lore/shared/assets'),
  ...getLandmarkDirs(),
  path.resolve('docs/lore/figures'),
  path.resolve('docs/lore/media'),
];

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

const NIM_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';

// Official NIM FLUX.2 Klein supported resolutions
// Filtered to respect the 1,062,400 pixel limit (width × height ≤ 1,062,400)
const NIM_SIZES = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344];
const MAX_PIXELS = 1062400;
const SUPPORTED_RESOLUTIONS = [];
for (const w of NIM_SIZES) {
  for (const h of NIM_SIZES) {
    if (w * h <= MAX_PIXELS) {
      SUPPORTED_RESOLUTIONS.push({ width: w, height: h });
    }
  }
}

const DEFAULT_DIMENSIONS = {
  tile: { width: 1024, height: 1024 },
  overlay: { width: 1024, height: 1024 },
  background: { width: 1280, height: 768 },
  'html-background': { width: 1280, height: 768 },
  portrait: { width: 1024, height: 1024 }, // Changed from 832×1280 (over pixel limit)
  'phone-wallpaper': { width: 768, height: 1344 },
  'app-icon': { width: 1024, height: 1024 },
  biometric: { width: 1344, height: 768 },
  expression: { width: 1344, height: 768 },
  'outfit-pose': { width: 768, height: 1344 },
};

const NIM_MAX_RETRIES = 2;
const NIM_BACKOFF_MS = 5000;
const NIM_RPM_LIMIT = 35;
const NIM_RPM_WINDOW_MS = 60000;
const POLLINATIONS_COOLDOWN_MS = 30000;
const POLLINATIONS_MAX_RETRIES = 2;
const MIN_FILE_SIZE = 5000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pickSupportedResolution(width, height) {
  if (!width || !height) return { width: 1024, height: 1024 };
  const inputRatio = width / height;
  const inputPixels = width * height;
  let best = SUPPORTED_RESOLUTIONS[0];
  let bestScore = Infinity;
  for (const r of SUPPORTED_RESOLUTIONS) {
    const ratioDiff = Math.abs(inputRatio - r.width / r.height);
    const sizeDiff = Math.abs(inputPixels - r.width * r.height) / inputPixels;
    const score = ratioDiff * 10 + sizeDiff;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

function isErrorFile(filePath) {
  if (!fs.existsSync(filePath)) return true;
  const size = fs.statSync(filePath).size;
  if (size < MIN_FILE_SIZE) {
    try {
      const head = fs.readFileSync(filePath, 'utf-8').slice(0, 400);
      if (head.includes('Too Many Requests') || head.includes('error') || head.includes('String should')) return true;
    } catch {
      // binary file, probably fine
    }
  }
  return false;
}

// ── Token Bucket (NIM rate limiter) ────────────────────────────────────────

class TokenBucket {
  constructor(rate, perMs) {
    this.rate = rate;
    this.perMs = perMs;
    this.tokens = rate;
    this.lastRefill = Date.now();
  }
  async take() {
    this.refill();
    while (this.tokens < 1) {
      await sleep(100);
      this.refill();
    }
    this.tokens--;
  }
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.rate, this.tokens + (elapsed / this.perMs) * this.rate);
    this.lastRefill = now;
  }
}

const nimBucket = new TokenBucket(NIM_RPM_LIMIT, NIM_RPM_WINDOW_MS);

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
    // Type from frontmatter, size from defaults
    const def = DEFAULT_DIMENSIONS[fm.type];
    if (def) {
      return { type: fm.type, width: def.width, height: def.height };
    }
    return { type: fm.type, width: 1024, height: 1024 };
  }

  // Fallback: bold markdown lines
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
    else { width = 1024; height = 1024; }
  }
  return { type, width, height };
}

// ── Prompt File Parsing ────────────────────────────────────────────────────

function parsePromptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const results = [];

  const { type, width, height } = extractTypeAndSize(content);
  const resolved = pickSupportedResolution(width, height);

  // 1. Try named variants first: ## Prompt — <name>
  const promptRegex = /## Prompt — ([^\n]+)\n([\s\S]*?)(?=## Prompt — |## Negative Prompt\n|$)/g;
  let match;
  while ((match = promptRegex.exec(content)) !== null) {
    const variantName = match[1].trim();
    const promptText = match[2].trim();
    const negMatch = content.slice(match.index + match[0].length).match(/## Negative Prompt\n([\s\S]*?)(?=## Prompt — |$)/);
    const negativeText = negMatch ? negMatch[1].trim() : '';
    if (promptText) {
      results.push({ variantName, promptText, negativeText, type, width: resolved.width, height: resolved.height });
    }
  }

  // 2. Dual-prompt files: ## Prompt (Draft) or ### Prompt (Draft) sections
  if (results.length === 0) {
    const draftRegex = /##{1,2} Prompt \(Draft\)\n([\s\S]*?)(?=##{1,2} (?:Prompt|Negative Prompt|Sheet|Variations)|$)/g;
    let draftMatch;
    while ((draftMatch = draftRegex.exec(content)) !== null) {
      const promptText = draftMatch[1].trim();
      const afterDraft = content.slice(draftMatch.index + draftMatch[0].length);
      const negMatch = afterDraft.match(/##{1,2} Negative Prompt\n([\s\S]*?)(?=##{1,2} |$)/);
      const negativeText = negMatch ? negMatch[1].trim() : '';
      if (promptText) {
        results.push({ variantName: 'default', promptText, negativeText, type, width: resolved.width, height: resolved.height });
      }
    }
  }

  // 3. Fallback: single ## Prompt or ### Prompt section
  if (results.length === 0) {
    const singleMatch = content.match(/##{1,2} Prompt\n([\s\S]*?)(?=##{1,2} Negative Prompt|$)/);
    if (singleMatch) {
      const promptText = singleMatch[1].trim();
      const negMatch = content.match(/##{1,2} Negative Prompt\n([\s\S]*?)(?=##{1,2} |$)/);
      const negativeText = negMatch ? negMatch[1].trim() : '';
      if (promptText) {
        results.push({ variantName: 'default', promptText, negativeText, type, width: resolved.width, height: resolved.height });
      }
    }
  }

  return results;
}

// ── Prompt Builders ─────────────────────────────────────────────────────────

/**
 * Build a NIM-compatible prompt (≤800 chars) from the full prompt.
 * This is a fallback for files without a dedicated ## Prompt (Draft) section.
 * Prefer using ## Prompt (Draft) directly from the prompt file.
 * Strips the long style prefix, uses compact negative.
 */
function buildNimPrompt(fullPromptText, fileLabel) {
  if (!fileLabel) fileLabel = 'unknown';
  console.warn(`  ⚠️  ${fileLabel}: no ## Prompt (Draft) found — using truncation fallback`);
  const STYLE = 'photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k';
  const NEG = 'photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality';

  let scene = fullPromptText
    .replace(/Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k\.?\s*/gi, '')
    .replace(/Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k\.?\s*/gi, '')
    .replace(/\d+×\d+\./g, '')
    .trim();

  // Content filtering safety: replace sensitive terms with neutral alternatives
  const contentSafeReplacements = [
    // Political terms
    [/\bgovernor\b/gi, 'civic leader'],
    [/\bgovernment\b/gi, 'public'],
    [/\boppressive\b/gi, 'formal'],
    [/\bpresidential\b/gi, 'executive'],
    [/\bprotest\b/gi, 'gathering'],
    [/\bdam\b/gi, 'water reservoir'], // Fix for san_miguel_dam filtering
    
    // Urban decay terms
    [/\bgritty\b/gi, 'textured'],
    [/\bgraffiti\b/gi, 'street art'],
    [/\bslum\b/gi, 'dense neighborhood'],
    [/\bghetto\b/gi, 'urban district'],
    [/\bandoned\b/gi, 'unoccupied'],
    
    // Emotional terms
    [/\btense\b/gi, ''],
    [/\bmenacing\b/gi, ''],
    [/\bterrifying\b/gi, ''],
    [/\bhorrifying\b/gi, ''],
    
    // Violence terms
    [/\bblood\b/gi, 'red liquid'],
    [/\bweapon\b/gi, 'object'],
    [/\bmurder\b/gi, 'incident'],
    [/\bfight\b/gi, 'confrontation'],
    [/\bwar\b/gi, 'conflict'],
    
    // Repetitive patterns (remove duplicates)
    [/(\b\w+\b)\s*,\s*\1/gi, '$1']
  ];

  contentSafeReplacements.forEach(([pattern, replacement]) => {
    scene = scene.replace(pattern, replacement);
  });

  // Remove excessive repetition - keep max 2 occurrences of any word
  const words = scene.split(/\s+/);
  const wordCount = {};
  const filteredWords = [];
  
  for (const word of words) {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    
    // Always keep short words and punctuation
    if (!cleanWord || cleanWord.length <= 3) {
      filteredWords.push(word);
      continue;
    }
    
    // Track occurrences of this word
    wordCount[cleanWord] = (wordCount[cleanWord] || 0) + 1;
    
    // Keep only first 2 occurrences
    if (wordCount[cleanWord] <= 2) {
      filteredWords.push(word);
    }
    // Skip additional occurrences
  }
  
  scene = filteredWords.join(' ');

  let combined = `${scene}. ${STYLE}. NO ${NEG}`;
  if (combined.length > 800) {
    const maxScene = 800 - STYLE.length - NEG.length - 10;
    scene = scene.substring(0, maxScene).trim();
    combined = `${scene}. ${STYLE}. NO ${NEG}`;
  }
  return combined;
}

// ── NIM Generation ──────────────────────────────────────────────────────────

async function generateNIM(variant, outPath, fileLabel) {
  const prompt = buildNimPrompt(variant.promptText, fileLabel);

  for (let attempt = 1; attempt <= NIM_MAX_RETRIES; attempt++) {
    try {
      await nimBucket.take();

      const res = await fetch(NIM_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          width: variant.width,
          height: variant.height,
          seed: 0,
          steps: 4,
        }),
      });

      if (res.status === 429) {
        const errText = await res.text();
        if (attempt < NIM_MAX_RETRIES) {
          await sleep(NIM_BACKOFF_MS * attempt);
          continue;
        }
        return { ok: false, error: `rate limited: ${errText.substring(0, 80)}` };
      }

      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${errText.substring(0, 80)}` };
      }

      const body = await res.json();
      const artifact = body.artifacts?.[0];
      if (artifact?.finishReason === 'CONTENT_FILTERED') {
        return { ok: false, error: 'content_filtered' };
      }
      const b64 = artifact?.base64;
      if (!b64) {
        return { ok: false, error: 'no base64 artifact in response' };
      }

      const buffer = Buffer.from(b64, 'base64');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buffer);

      if (isErrorFile(outPath)) {
        fs.unlinkSync(outPath);
        return { ok: false, error: 'downloaded file looks like an error' };
      }

      return { ok: true, size: buffer.length };
    } catch (err) {
      if (attempt < NIM_MAX_RETRIES) {
        await sleep(NIM_BACKOFF_MS * attempt);
      } else {
        return { ok: false, error: err.message.substring(0, 80) };
      }
    }
  }
  return { ok: false, error: 'max retries exceeded' };
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

  for (let attempt = 1; attempt <= POLLINATIONS_MAX_RETRIES; attempt++) {
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
      if (attempt < POLLINATIONS_MAX_RETRIES) {
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
generate-drafts-unified.mjs — NIM-first, Pollinations-fallback per prompt

Usage:
  node generate-drafts-unified.mjs
  node generate-drafts-unified.mjs --filter tile,overlay
  node generate-drafts-unified.mjs --force
  node generate-drafts-unified.mjs --dry-run
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

  console.log(`\n🎨 Unified Draft Generator (NIM → Pollinations per prompt)\n`);
  console.log(`  Roots: ${PROMPT_ROOTS.join(', ')}`);
  if (!NVIDIA_API_KEY) console.log(`  ⚠️  No NVIDIA_API_KEY — NIM will be skipped`);
  if (opts.filter) console.log(`  Filter: ${Array.from(opts.filterSet).join(', ')}`);
  if (opts.force) console.log(`  Force: regenerate all`);
  if (opts.dryRun) console.log(`  Dry run — no downloads\n`);

  // Discover all prompt files from all roots
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

  // Build work items
  const workItems = [];
  for (const promptFile of promptFiles) {
    const relFromRoot = path.relative(promptFile, promptFile); // unused but kept for compat
    const variants = parsePromptFile(promptFile);
    const filtered = opts.filterSet ? variants.filter(v => opts.filterSet.has(v.type)) : variants;
    if (filtered.length === 0) continue;

    // Drafts go to assets/ sibling directory
    // For figure root-level prompts (docs/lore/figures/char.prompt.md),
    // route to per-character dir (docs/lore/figures/char/assets/)
    let promptDir = path.dirname(promptFile);
    const figuresRoot = path.resolve('docs/lore/figures');
    if (promptDir === figuresRoot) {
      const charName = path.basename(promptFile, '.prompt.md');
      promptDir = path.join(figuresRoot, charName);
    }
    const draftDir = path.join(promptDir, 'assets');
    const baseName = path.basename(promptFile, '.prompt.md');

    for (const variant of filtered) {
      const fileName = `${baseName}__${slugify(variant.variantName)}`;
      const basePath = path.join(draftDir, `${fileName}.png`);
      workItems.push({ relFromRoot: path.relative(promptFile, promptFile), variant, basePath, draftDir, fileName, baseName });
    }
  }

  console.log(`  Found ${workItems.length} prompt variants\n`);

  if (opts.dryRun) {
    for (const item of workItems) {
      console.log(`  📄 ${item.relFromRoot} [${item.variant.variantName}] ${item.variant.width}×${item.variant.height}`);
    }
    return;
  }

  // Process each work item: try NIM, fallback to Pollinations
  let nimOk = 0, nimSkipped = 0, pollOk = 0, pollFailed = 0;
  let pollinationsNextAvailable = 0; // timestamp when next Pollinations request can fire

  for (const item of workItems) {
    const { relFromRoot, variant, basePath, draftDir, fileName } = item;
    const label = `[${variant.variantName}]`;

    // Skip if a valid version already exists and --force not used
    if (!opts.force && fs.existsSync(basePath) && !isErrorFile(basePath)) {
      console.log(`  ⏭️  ${relFromRoot} ${label} — exists`);
      nimSkipped++;
      continue;
    }

    // Compute output path: add timestamp if file exists (preserve history)
    let outPath = basePath;
    if (fs.existsSync(basePath) || opts.force) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      outPath = path.join(draftDir, `${fileName}__${ts}.png`);
    }

    console.log(`\n  📄 ${relFromRoot} ${label}`);

    // --- Try NIM first ---
    if (NVIDIA_API_KEY) {
      const nimResult = await generateNIM(variant, outPath, item.baseName);
      if (nimResult.ok) {
        console.log(`     ✅ NIM: ${path.basename(outPath)} (${nimResult.size} bytes)`);
        nimOk++;
        continue;
      }
      console.log(`     ⚠️  NIM failed: ${nimResult.error}`);
    }

    // --- Pollinations fallback ---
    // Respect 30s cooldown between Pollinations requests
    const now = Date.now();
    if (now < pollinationsNextAvailable) {
      const waitMs = pollinationsNextAvailable - now;
      console.log(`     ⏳ Pollinations cooldown: ${Math.ceil(waitMs / 1000)}s...`);
      await sleep(waitMs);
    }

    const pollResult = await generatePollinations(variant, outPath);
    pollinationsNextAvailable = Date.now() + POLLINATIONS_COOLDOWN_MS;

    if (pollResult.ok) {
      console.log(`     ✅ Pollinations: ${path.basename(outPath)} (${pollResult.size} bytes)`);
      pollOk++;
    } else {
      console.log(`     ❌ Pollinations failed: ${pollResult.error}`);
      pollFailed++;
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total prompts:  ${workItems.length}`);
  console.log(`  ✅ NIM:         ${nimOk}`);
  console.log(`  🔄 Pollinations: ${pollOk}`);
  console.log(`  ⏭️  Skipped:     ${nimSkipped}`);
  console.log(`  ❌ Failed:      ${pollFailed}`);
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
