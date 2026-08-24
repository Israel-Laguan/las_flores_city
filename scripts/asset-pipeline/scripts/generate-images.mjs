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
import { pathToFileURL } from 'node:url';
import os from 'node:os';
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

// Hard prompt-length caps enforced by the providers. NIM (flux.2-klein-4b)
// rejects anything over 800 characters with HTTP 422 string_too_long, and the
// Pollinations URL-based API degrades on very long query strings.
export const NIM_PROMPT_LIMIT = 800;
export const POLLINATIONS_PROMPT_LIMIT = 2000;

const AKOOL_SCALES = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'];

/**
 * Thrown when NIM rejects a prompt via its content guardrails
 * (finishReason === 'CONTENT_FILTERED'). This is NOT retried — the prompt is
 * inherently blocked, so retrying is pointless. The provider chain skips
 * straight to the next provider (Akool, then Pollinations).
 */
export class NimContentFilteredError extends Error {
  constructor(message = 'NIM content filtered (guardrails)') {
    super(message);
    this.name = 'NimContentFilteredError';
    this.retryable = false;
  }
}
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
export function cleanNegativePrompt(text) {
  let t = (text || '').trim();
  if (!t) return '';
  t = t.replace(/^--no\s+/, 'no ');
  t = t.replace(/^--no$/, 'no');
  return t.trim();
}

/** Truncate at a word boundary so we never cut a word in half. */
function truncateAtWord(text, limit) {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const cut = slice.lastIndexOf(' ');
  return (cut > limit * 0.5 ? slice.slice(0, cut) : slice).trim();
}

export { truncateAtWord };

/**
 * Build a prompt that fits inside a provider's hard character limit.
 *
 * The positive prompt always takes priority: it carries the actual subject and
 * is never sacrificed for the negative prompt. The appended "NO ..." clause is
 * a refinement, so it is trimmed first, then dropped entirely, and only if the
 * positive prompt alone still overflows do we truncate it (at a word boundary).
 *
 * Returns { prompt, negativeApplied, truncated } so callers can report what
 * happened without silently changing the request.
 */
export function fitPrompt(prompt, negativePrompt, limit) {
  const base = (prompt || '').trim();
  const cleaned = cleanNegativePrompt(negativePrompt);

  if (!cleaned) {
    const fitted = truncateAtWord(base, limit);
    return { prompt: fitted, negativeApplied: false, truncated: fitted.length < base.length };
  }

  const suffix = `\n\nNO ${cleaned}`;
  if (base.length + suffix.length <= limit) {
    return { prompt: base + suffix, negativeApplied: true, truncated: false };
  }

  // Try to keep a shortened negative clause if a useful amount still fits.
  const room = limit - base.length - '\n\nNO '.length;
  if (room >= 24) {
    const shortNeg = truncateAtWord(cleaned, room);
    if (shortNeg) {
      return { prompt: `${base}\n\nNO ${shortNeg}`, negativeApplied: true, truncated: true };
    }
  }

  // Otherwise drop the negative prompt entirely, trimming the base if needed.
  const fitted = truncateAtWord(base, limit);
  return { prompt: fitted, negativeApplied: false, truncated: true };
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
export function dimsFromAspect(ratio) {
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

export function isSupportedScale(ratio) {
  return AKOOL_SCALES.includes(String(ratio || '').trim());
}

/** Nearest supported Akool scale for a given width/height. */
export function scaleFromDims(width, height) {
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

/**
 * NIM (flux.2-klein-4b) only accepts widths/heights in steps of 16
 * (HTTP 422 literal_error otherwise). Snap to the closest valid size,
 * clamped to a sane [256, 1024] range.
 */
export function snapDimsForNim(width, height) {
  const snap = (n) => Math.min(1024, Math.max(256, Math.round(Number(n) / 16) * 16));
  return { width: snap(width), height: snap(height) };
}

export async function generateNim(prompt, negativePrompt, width, height) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set');

  const fitted = fitPrompt(prompt, negativePrompt, NIM_PROMPT_LIMIT);
  const fullPrompt = fitted.prompt;
  const dims = snapDimsForNim(width, height);
  if (fitted.truncated || (negativePrompt && !fitted.negativeApplied)) {
    console.warn(
      `    nim: prompt trimmed to ${fullPrompt.length}/${NIM_PROMPT_LIMIT} chars`
      + `${fitted.negativeApplied ? ' (negative shortened)' : ' (negative dropped)'}`,
    );
  }
  if (dims.width !== width || dims.height !== height) {
    console.warn(`    nim: dims snapped ${width}x${height} -> ${dims.width}x${dims.height} (multiple of 16)`);
  }

  const payload = {
    prompt: fullPrompt,
    ...dims,
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
        // Guardrail rejection: do NOT retry — the prompt is blocked. Throw a
        // non-retryable error so the provider chain moves to Akool, then
        // Pollinations, immediately (no pointless NIM backoff/retries).
        throw new NimContentFilteredError();
      }

      const b64 = artifact?.base64;
      if (!b64) throw new Error('no base64 artifact in NIM response');

      const buffer = Buffer.from(b64, 'base64');
      if (isErrorBuffer(buffer)) throw new Error('NIM returned error response');

      return buffer;
    } catch (err) {
      // Non-retryable errors (e.g. content guardrails) bail out immediately;
      // all other errors are retried with backoff up to NIM_MAX_RETRIES.
      if (err instanceof NimContentFilteredError || err.retryable === false) {
        throw err;
      }
      lastError = err;
      if (attempt >= NIM_MAX_RETRIES) break;
      await sleep(wait);
      wait = Math.min(wait * 1.5, NIM_MAX_BACKOFF_MS);
    }
  }

  throw new Error(`NIM failed after ${NIM_MAX_RETRIES} attempts: ${lastError?.message || 'unknown error'}`);
}
// ── Provider: Akool (CLI) ───────────────────────────────────────────────────

export function isAkoolConfigured() {
  // Env vars take precedence (AKOOL_CLIENT_ID + AKOOL_CLIENT_SECRET, or AKOOL_API_KEY).
  if (
    (process.env.AKOOL_CLIENT_ID && process.env.AKOOL_CLIENT_SECRET)
    || process.env.AKOOL_API_KEY
  ) {
    return true;
  }

  // The CLI stores login credentials in ~/.akool/config.json (via `akool-cli login`).
  try {
    const confPath = path.join(os.homedir(), '.akool', 'config.json');
    if (fs.existsSync(confPath)) {
      const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
      if (conf && (conf.clientId || conf.clientSecret || conf.apiKey)) return true;
    }
  } catch {
    // fall through to false
  }
  return false;
}

/** Single-quote a string for safe shell interpolation. */
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Pull a usable JSON object out of mixed akool-cli output.
 *
 * `akool-cli --json ... --wait` emits more than one JSON document: the initial
 * submit response, progress lines, then the final completed task, followed by a
 * decorative box. Slicing from the first '{' to the last '}' therefore spans
 * several documents and fails to parse. Instead we scan for every complete,
 * brace-balanced object (ignoring braces inside strings) and return the last
 * one that carries the finished payload.
 */
function extractJson(text) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          try {
            objects.push(JSON.parse(text.slice(start, i + 1)));
          } catch {
            // Not valid JSON (e.g. an ANSI-decorated fragment) — ignore it.
          }
          start = -1;
        }
      }
    }
  }

  if (!objects.length) {
    throw new Error('no JSON object found in akool-cli output');
  }

  // Prefer the last object that actually contains the generated image URLs.
  for (let i = objects.length - 1; i >= 0; i--) {
    const urls = objects[i]?.data?.upscaled_urls;
    if (Array.isArray(urls) && urls.length) return objects[i];
  }

  return objects[objects.length - 1];
}

export async function generateAkool(prompt, negativePrompt, scale) {
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

export async function generatePollinations(prompt, negativePrompt, width, height) {
  // Pollinations puts the prompt in the URL path, so keep it within budget.
  // The negative prompt travels as its own query param here, so it does not
  // compete with the positive prompt for the same character budget.
  const fittedPrompt = truncateAtWord((prompt || '').trim(), POLLINATIONS_PROMPT_LIMIT);
  if (fittedPrompt.length < (prompt || '').trim().length) {
    console.warn(`    pollinations: prompt trimmed to ${fittedPrompt.length}/${POLLINATIONS_PROMPT_LIMIT} chars`);
  }
  const encoded = encodeURIComponent(fittedPrompt);
  const key = process.env.POLLINATIONS_API_KEY;

  let url;
  if (key) {
    // New API (requires key from enter.pollinations.ai)
    url = `${POLLINATIONS_NEW_BASE}/${encoded}?model=flux&width=${width}&height=${height}&key=${encodeURIComponent(key)}`;
  } else {
    // Legacy API (free, no auth)
    url = `${POLLINATIONS_LEGACY_BASE}/${encoded}?width=${width}&height=${height}&nologo=true&model=flux`;
  }

  const cleaned = truncateAtWord(cleanNegativePrompt(negativePrompt), POLLINATIONS_PROMPT_LIMIT);
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
  node generate-images.mjs [--input <path>] [--output-dir <path>] [--stop-on-fail] [--batch <i>/<n>]

Options:
  --input <path>       Path to non-i2i-prompts.json
                       (default: scripts/asset-pipeline/output/non-i2i-prompts.json)
  --output-dir <path>  Directory for generated images
                       (default: scripts/asset-pipeline/output/images)
  --stop-on-fail       Stop the batch after the first failure instead of
                       continuing. Errors are still saved next to the output
                       in <output-dir>/generation-errors.log.
  --batch <i>/<n>      Process only slice i of n (0-based) of the input, so
                       multiple processes can run in parallel on disjoint
                       ranges. Example: --batch 0/4, --batch 1/4, ...
  --provider <name>    Primary provider tried first for this run/batch:
                       nim (default), akool, or pollinations. The next provider
                       in the chain is used on failure; Pollinations is always
                       the last resort. Use it to rotate load across batches
                       (e.g. batch 0 = nim, batch 1 = akool, batch 2 = nim ...).
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
    batch: null, // { index, total }
    provider: 'nim', // primary provider for this run/batch
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input': opts.input = args[++i]; break;
      case '--output-dir': opts.outputDir = args[++i]; break;
      case '--stop-on-fail': opts.stopOnFail = true; break;
      case '--batch': {
        const m = String(args[++i] || '').match(/^(\d+)\s*\/\s*(\d+)$/);
        if (!m || Number(m[2]) < 1 || Number(m[1]) >= Number(m[2])) {
          console.error('[FAIL] --batch must be <i>/<n> with 0 <= i < n');
          process.exit(1);
        }
        opts.batch = { index: Number(m[1]), total: Number(m[2]) };
        break;
      }
      case '--provider': {
        const v = String(args[++i] || '').toLowerCase();
        if (!['nim', 'akool', 'pollinations'].includes(v)) {
          console.error('[FAIL] --provider must be one of: nim, akool, pollinations');
          process.exit(1);
        }
        opts.provider = v;
        break;
      }
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

/**
 * Build the ordered provider chain for a run. The primary provider is tried
 * first; the other non-Pollinations provider is the middle fallback; and
 * Pollinations is always last (last resort on failure).
 * Examples:
 *   nim       -> ['nim', 'akool', 'pollinations']
 *   akool     -> ['akool', 'nim', 'pollinations']
 *   pollinations -> ['nim', 'akool', 'pollinations']  (forced to last)
 */
export function buildProviderChain(primary) {
  const others = ['nim', 'akool'].filter((p) => p !== primary);
  if (primary === 'pollinations') return [...others, 'pollinations'];
  return [primary, ...others, 'pollinations'];
}

/** Try a single provider for an entry. Returns a Buffer or throws. */
async function runProvider(name, entry, width, height, scale) {
  switch (name) {
    case 'nim':
      return generateNim(entry.prompt, entry.negative_prompt, width, height);
    case 'akool':
      return generateAkool(entry.prompt, entry.negative_prompt, scale);
    case 'pollinations':
      return generatePollinations(entry.prompt, entry.negative_prompt, width, height);
    default:
      throw new Error(`unknown provider: ${name}`);
  }
}

async function generateOne(entry, outputDir, providerChain) {
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

  for (const name of providerChain) {
    if (buffer) break;

    // Skip providers that are not configured (except Pollinations, always free).
    if (name !== 'pollinations') {
      if (name === 'nim' && !process.env.NVIDIA_API_KEY) {
        console.warn(`  ${label}: NVIDIA_API_KEY unset, skipping NIM`);
        continue;
      }
      if (name === 'akool' && !isAkoolConfigured()) {
        console.warn(`  ${label}: Akool unconfigured, skipping`);
        continue;
      }
    }

    try {
      buffer = await runProvider(name, entry, width, height, scale);
      provider = name;
    } catch (err) {
      console.warn(`  ${label}: ${name} failed (${err.message})`);
    }
  }

  if (!buffer) {
    throw new Error('all providers failed for this entry');
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

  // Resolve the slice of entries this process should handle.
  let entries = raw;
  let sliceLabel = 'all';
  if (opts.batch) {
    const { index, total } = opts.batch;
    const size = Math.ceil(raw.length / total);
    const start = index * size;
    entries = raw.slice(start, start + size);
    sliceLabel = `batch ${index}/${total} (${entries.length} entries)`;
    console.log(`[BATCH] Processing ${sliceLabel}\n`);
    if (entries.length === 0) {
      console.log('Nothing to do for this slice.');
      return;
    }
  }

  // Ordered provider chain for this run (primary first, Pollinations last).
  const providerChain = buildProviderChain(opts.provider);
  console.log(`[PROVIDERS] primary=${opts.provider} chain=${providerChain.join(' -> ')} (Pollinations only on failure)\n`);

  let ok = 0;
  let skipCount = 0;
  let fail = 0;

  for (const entry of entries) {
    try {
      const result = await generateOne(entry, outputDir, providerChain);
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

// Only auto-run when executed directly; importing this module (e.g. from
// generate-scene-variants.mjs) must not trigger a generation batch.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error('[FATAL]', err);
    process.exit(1);
  });
}