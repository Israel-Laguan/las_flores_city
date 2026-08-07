#!/usr/bin/env node

/**
 * generate-images.mjs
 *
 * Reads scripts/asset-pipeline/output/non-i2i-prompts.json (produced by
 * extract-prompts.mjs) and generates one default image per prompt entry using
 * a provider fallback chain:
 *
 *   1. NIM  (NVIDIA text-to-image, same call pattern as generateImageBuffer)
 *   2. Akool (akool-cli --json image generate, text-to-image)
 *   3. Pollinations (free GET endpoint; new API when POLLINATIONS_API_KEY set)
 *
 * Output files are written flat (no sub-directories) into
 * scripts/asset-pipeline/output/images/<slugified-name>__default.png,
 * matching the naming convention used by generate-prompt.mjs.
 *
 * Usage:
 *   node generate-images.mjs
 *   node generate-images.mjs --input path/to/non-i2i-prompts.json --output-dir path/to/images
 *
 * Environment (all optional — a provider is skipped when unconfigured):
 *   NVIDIA_API_KEY            -> enables NIM
 *   AKOOL_CLIENT_ID + AKOOL_CLIENT_SECRET (or AKOOL_API_KEY) -> enables Akool
 *   POLLINATIONS_API_KEY      -> switches Pollinations to the gen.pollinations.ai API
 *
 * Resume/progress: entries whose output file already exists are skipped
 * ([SKIP]). A single failure logs [FAIL] and moves on; it never aborts the run.
 *
 * No runtime npm dependencies — Node built-ins + child_process for akool-cli.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ── Config / constants ──────────────────────────────────────────────────────

const NIM_INVOKE_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';
const POLLINATIONS_LEGACY_BASE = 'https://image.pollinations.ai/prompt';
const POLLINATIONS_NEW_BASE = 'https://gen.pollinations.ai/image';

// NIM retry/backoff. The server (AssetGenerationService) uses 6 retries with a
// 60s initial backoff; for a batch script we tune it down so one slow prompt
// cannot stall the whole queue. Override with env if needed.
const NIM_MAX_RETRIES = Number(process.env.NIM_MAX_RETRIES || 3);
const NIM_INITIAL_BACKOFF_MS = Number(process.env.NIM_INITIAL_BACKOFF_MS || 5000);
const NIM_MAX_BACKOFF_MS = 120000;
const NIM_TIMEOUT_MS = 60000;

const MIN_FILE_SIZE = 5000;
const DEFAULT_SIZE = { width: 1024, height: 1024 };

const AKOOL_SCALES = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'];
// ── Small helpers ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same slugifier as generate-prompt.mjs. */
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Derive a stable base slug for an entry. Prefers the human name; otherwise
 * falls back to the file path's basename with any known prompt-file suffix
 * stripped (e.g. content/characters/foo/foo.prompt.md -> foo).
 */
export function entrySlug(entry) {
  if (entry.name) return slugify(entry.name);
  const base = path.basename(entry.file || '');
  const stripped = base
    .replace(/\.prompt\.md$/i, '')
    .replace(/\.prompt$/i, '')
    .replace(/\.md$/i, '');
  return slugify(stripped || 'untitled');
}

/** Mirror of AssetGenerationService.cleanNegativePrompt(). */
function cleanNegativePrompt(text) {
  let t = (text || '').trim();
  if (!t) return '';
  t = t.replace(/^--no\s+/, 'no ');
  t = t.replace(/^--no$/, 'no');
  return t.trim();
}

function isErrorBuffer(buffer) {
  if (buffer.length < MIN_FILE_SIZE) return true;
  try {
    const head = buffer.toString('utf-8', 0, 400);
    if (head.includes('Too Many Requests') || head.includes('error')) return true;
  } catch {
    // binary file, probably fine
  }
  return false;
}

async function download(url, timeoutMs = 120000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (isErrorBuffer(buffer)) {
    throw new Error('downloaded error response (buffer below size threshold or text payload)');
  }
  return buffer;
}
// ── Dimension / scale resolution ────────────────────────────────────────────

/** Parse "1024x1024" or "1280x768" (also accepts ×). */
function parseSize(size) {
  if (!size) return null;
  const m = String(size).match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

/** Largest dimension ≤ 1024 preserving an aspect ratio like "3:4" / "16:9". */
function dimsFromAspect(ratio) {
  if (!ratio) return null;
  const m = String(ratio).match(/^(\d+)\s*[:/]\s*(\d+)$/);
  if (!m) return null;
  const rw = Number(m[1]);
  const rh = Number(m[2]);
  if (!rw || !rh) return null;
  const scale = 1024 / Math.max(rw, rh);
  return { width: Math.max(1, Math.round(rw * scale)), height: Math.max(1, Math.round(rh * scale)) };
}

function resolveDims(entry) {
  return parseSize(entry.size)
    || dimsFromAspect(entry.aspect_ratio)
    || { ...DEFAULT_SIZE };
}

function isSupportedScale(ratio) {
  return AKOOL_SCALES.includes(String(ratio || '').trim());
}

/** Nearest supported Akool scale for a given width/height. */
function scaleFromDims(width, height) {
  const target = width / height;
  let best = '1:1';
  let bestDiff = Infinity;
  for (const s of AKOOL_SCALES) {
    const [a, b] = s.split(':').map(Number);
    const diff = Math.abs(a / b - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

// ── Provider: NIM ───────────────────────────────────────────────────────────

async function generateNim(prompt, negativePrompt, width, height) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set');

  const fullPrompt = negativePrompt
    ? `${prompt}\n\nNO ${cleanNegativePrompt(negativePrompt)}`
    : prompt;

  const payload = {
    prompt: fullPrompt,
    width,
    height,
    seed: 0,
    steps: 4,
  };

  let wait = NIM_INITIAL_BACKOFF_MS;
  let lastError = null;

  for (let attempt = 1; attempt <= NIM_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(NIM_INVOKE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(NIM_TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const body = await res.json();
      const artifact = body.artifacts?.[0];

      if (artifact?.finishReason === 'CONTENT_FILTERED') {
        throw new Error('NIM content filtered');
      }

      const b64 = artifact?.base64;
      if (!b64) throw new Error('no base64 artifact in NIM response');

      const buffer = Buffer.from(b64, 'base64');
      if (isErrorBuffer(buffer)) throw new Error('NIM returned error response');

      return buffer;
    } catch (err) {
      lastError = err;
      if (attempt >= NIM_MAX_RETRIES) break;
      await sleep(wait);
      wait = Math.min(wait * 1.5, NIM_MAX_BACKOFF_MS);
    }
  }

  throw new Error(`NIM failed after ${NIM_MAX_RETRIES} attempts: ${lastError?.message || 'unknown error'}`);
}
// ── Provider: Akool (CLI) ───────────────────────────────────────────────────

function isAkoolConfigured() {
  return Boolean(
    (process.env.AKOOL_CLIENT_ID && process.env.AKOOL_CLIENT_SECRET)
    || process.env.AKOOL_API_KEY
  );
}

/** Single-quote a string for safe shell interpolation. */
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** Pull the first complete JSON object out of mixed CLI output. */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON object found in akool-cli output');
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function generateAkool(prompt, negativePrompt, scale) {
  if (!isAkoolConfigured()) throw new Error('akool not configured (need AKOOL_CLIENT_ID + AKOOL_CLIENT_SECRET or AKOOL_API_KEY)');

  const fullPrompt = negativePrompt
    ? `${prompt}\n\nNO ${cleanNegativePrompt(negativePrompt)}`
    : prompt;

  // Note: akool-cli generate has no --model flag; text-to-image uses
  // wavespeed-ai/flux-krea-dev-lora by default.
  const cmd = `akool-cli --json image generate --prompt ${shellQuote(fullPrompt)} --scale ${shellQuote(scale || '1:1')} --wait`;

  let stdout;
  try {
    stdout = execSync(cmd, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 300000, // 5 min; --wait uses Fibonacci backoff (~30-50s typical)
    });
  } catch (err) {
    const stderr = (err.stderr || '').toString();
    const out = (err.stdout || '').toString();
    throw new Error(`akool-cli failed: ${stderr || out || err.message}`);
  }

  const parsed = extractJson(stdout);
  const urls = parsed?.data?.upscaled_urls;
  const url = Array.isArray(urls) && urls.length ? urls[0] : null;
  if (!url) {
    throw new Error(`no upscaled_urls in akool response: ${stdout.slice(0, 300)}`);
  }

  return download(url);
}

// ── Provider: Pollinations ──────────────────────────────────────────────────

async function generatePollinations(prompt, negativePrompt, width, height) {
  const encoded = encodeURIComponent(prompt);
  const key = process.env.POLLINATIONS_API_KEY;

  let url;
  if (key) {
    // New API (requires key from enter.pollinations.ai)
    url = `${POLLINATIONS_NEW_BASE}/${encoded}?model=flux&width=${width}&height=${height}&key=${encodeURIComponent(key)}`;
  } else {
    // Legacy API (free, no auth)
    url = `${POLLINATIONS_LEGACY_BASE}/${encoded}?width=${width}&height=${height}&nologo=true&model=flux`;
  }

  const cleaned = cleanNegativePrompt(negativePrompt);
  if (cleaned) {
    url += `&negative_prompt=${encodeURIComponent(cleaned)}`;
  }

  return download(url, 60000);
}
// ── Output path handling ────────────────────────────────────────────────────

/** Return the existing output path if <base> already exists, else null. */
function existingOutput(outputDir, base) {
  const candidate = path.join(outputDir, base);
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Return a non-colliding path for writing. Starts at <base>; if that name is
 * already taken it appends -1, -2, ... so we never overwrite an existing image.
 */
function uniqueOutputPath(outputDir, base) {
  const parsed = path.parse(base);
  let candidate = path.join(outputDir, base);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${parsed.name}-${n}${parsed.ext}`);
    n += 1;
  }
  return candidate;
}

// ── CLI / main ──────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`Usage:
  node generate-images.mjs [--input <path>] [--output-dir <path>] [--stop-on-fail]

Options:
  --input <path>       Path to non-i2i-prompts.json
                       (default: scripts/asset-pipeline/output/non-i2i-prompts.json)
  --output-dir <path>  Directory for generated images
                       (default: scripts/asset-pipeline/output/images)
  --stop-on-fail       Stop the batch after the first failure instead of
                       continuing. Errors are still saved next to the output
                       in <output-dir>/generation-errors.log.
  -h, --help           Show this help

Providers are tried in order NIM -> Akool -> Pollinations. A provider is
skipped automatically when its env keys are missing.

Resume: re-running the same command skips any image that already exists and
retries entries that previously failed.`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: 'scripts/asset-pipeline/output/non-i2i-prompts.json',
    outputDir: 'scripts/asset-pipeline/output/images',
    stopOnFail: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input': opts.input = args[++i]; break;
      case '--output-dir': opts.outputDir = args[++i]; break;
      case '--stop-on-fail': opts.stopOnFail = true; break;
      case '--help': case '-h': printHelp(); process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }
  return opts;
}

/** Append an error line to <outputDir>/generation-errors.log (creates if needed). */
function logError(outputDir, message) {
  try {
    const logPath = path.join(outputDir, 'generation-errors.log');
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.mkdirSync(outputDir, { recursive: true });
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (err) {
    // Never let a logging failure abort the batch.
    console.warn(`  ⚠️  Could not write error log: ${err.message}`);
  }
}

async function generateOne(entry, outputDir) {
  const baseName = `${entrySlug(entry)}__default.png`;

  // Resume: skip if the default image already exists.
  if (existingOutput(outputDir, baseName)) {
    console.log(`[SKIP] ${baseName}`);
    return 'skip';
  }

  const { width, height } = resolveDims(entry);
  const scale = isSupportedScale(entry.aspect_ratio)
    ? entry.aspect_ratio.trim()
    : scaleFromDims(width, height);

  const label = entry.name || baseName;
  let buffer = null;
  let provider = null;

  // 1) NIM
  if (process.env.NVIDIA_API_KEY) {
    try {
      buffer = await generateNim(entry.prompt, entry.negative_prompt, width, height);
      provider = 'NIM';
    } catch (err) {
      console.warn(`  ${label}: NIM failed (${err.message})`);
    }
  } else {
    console.warn(`  ${label}: NVIDIA_API_KEY unset, skipping NIM`);
  }

  // 2) Akool
  if (!buffer) {
    if (isAkoolConfigured()) {
      try {
        buffer = await generateAkool(entry.prompt, entry.negative_prompt, scale);
        provider = 'Akool';
      } catch (err) {
        console.warn(`  ${label}: Akool failed (${err.message})`);
      }
    } else {
      console.warn(`  ${label}: Akool unconfigured, skipping`);
    }
  }

  // 3) Pollinations (always available as last resort)
  if (!buffer) {
    buffer = await generatePollinations(entry.prompt, entry.negative_prompt, width, height);
    provider = 'Pollinations';
  }

  // Never overwrite an existing file; append a numeric suffix if needed.
  const outPath = uniqueOutputPath(outputDir, baseName);
  fs.writeFileSync(outPath, buffer);
  console.log(`[OK] ${path.basename(outPath)} (${provider})`);
  return 'ok';
}

async function main() {
  const opts = parseArgs();
  const inputPath = path.resolve(opts.input);
  const outputDir = path.resolve(opts.outputDir);

  if (!fs.existsSync(inputPath)) {
    console.error(`[FAIL] Input not found: ${inputPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (err) {
    console.error(`[FAIL] Could not parse ${inputPath}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(raw)) {
    console.error('[FAIL] Input JSON must be an array of prompt entries.');
    process.exit(1);
  }

  console.log(`\nGenerating ${raw.length} images from ${path.basename(inputPath)} -> ${outputDir}\n`);

  let ok = 0;
  let skipCount = 0;
  let fail = 0;

  for (const entry of raw) {
    try {
      const result = await generateOne(entry, outputDir);
      if (result === 'skip') skipCount += 1;
      else ok += 1;
    } catch (err) {
      const baseName = `${entrySlug(entry)}__default.png`;
      const msg = `[FAIL] ${baseName}: ${err.message}`;
      console.error(msg);
      logError(outputDir, msg);
      fail += 1;
      if (opts.stopOnFail) {
        console.error(`\nStopping on failure (--stop-on-fail). Errors saved to ${path.join(outputDir, 'generation-errors.log')}.`);
        console.error(`Re-run the same command to resume (${ok} ok, ${skipCount} skipped so far).`);
        break;
      }
    }
  }

  console.log(`\nDone. ${ok} ok, ${skipCount} skipped, ${fail} failed.`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});