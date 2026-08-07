#!/usr/bin/env node
/**
 * generate-base-defaults.mjs
 *
 * M6 Part B - base-only portrait generation (art-lock compliant).
 * For every character folder lacking assets/<slug>__default.png, parse the
 * base portrait prose (refined ## Prompt / ## Prompt - Final / ## Prompt - Base)
 * and generate exactly ONE image: assets/<slug>__default.png. It does NOT
 * append the photorealistic style suffix (Master §2). NIM first, Pollinations
 * fallback.
 *
 * Usage:
 *   node scripts/asset-pipeline/scripts/generate-base-defaults.mjs --dry-run
 *   node scripts/asset-pipeline/scripts/generate-base-defaults.mjs
 *   node scripts/asset-pipeline/scripts/generate-base-defaults.mjs --limit 5
 *   node scripts/asset-pipeline/scripts/generate-base-defaults.mjs --only jianhua,xue
 */

import fs from 'node:fs';
import path from 'node:path';

const NIM_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';

const NVIDIA_API_KEY = (() => {
  try {
    const c = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    const m = c.match(/^NVIDIA_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return process.env.NVIDIA_API_KEY || null; }
})();

const NIM_SIZES = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344];
const MAX_PIXELS = 1062400;
const SUPPORTED_RESOLUTIONS = [];
for (const w of NIM_SIZES) for (const h of NIM_SIZES) if (w * h <= MAX_PIXELS) SUPPORTED_RESOLUTIONS.push({ width: w, height: h });

const MIN_FILE_SIZE = 5000;
const POLLINATIONS_COOLDOWN_MS = 30000;
const NIM_DELAY_MS = 1200;
const CHARACTER_ROOT = path.resolve('content/characters');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
    if (score < bestScore) { bestScore = score; best = r; }
  }
  return best;
}

function isErrorFile(filePath) {
  if (!fs.existsSync(filePath)) return true;
  if (fs.statSync(filePath).size < MIN_FILE_SIZE) {
    try {
      const head = fs.readFileSync(filePath, 'utf8').slice(0, 400);
      if (head.includes('Too Many Requests') || head.includes('error') || head.includes('String should')) return true;
    } catch { /* binary, fine */ }
  }
  return false;
}

// A real portrait default is well over 8KB; anything smaller is a corrupt/error
// stub. Used by --fill to decide whether a default is usable.
function defaultIsUsable(filePath) {
  if (!fs.existsSync(filePath)) return false;
  if (fs.statSync(filePath).size < 8000) return false;
  return true;
}

function parseDims(content) {
  const m = content.match(/^---\n[\s\S]*?^size:\s*(\d+)\s*[x×]\s*(\d+)\s*$/m);
  if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
  const d = content.match(/\*\*Dimensions:\*\*\s*(\d+)\s*[x×]\s*(\d+)/i);
  if (d) return { width: parseInt(d[1], 10), height: parseInt(d[2], 10) };
  return { width: 1024, height: 1024 };
}

function extractBasePrompt(content, slug) {
  const cands = [
    /^## Prompt\n([\s\S]*?)(?=\n## |\n# |\Z)/m,
    /^## Prompt — Final\n([\s\S]*?)(?=\n## |\n# |\Z)/m,
    /^## Prompt — Base\n([\s\S]*?)(?=\n## |\n# |\Z)/m,
    /^## Prompt \(Draft\)\n([\s\S]*?)(?=\n## |\n# |\Z)/m,
    new RegExp(`^## Portrait \\(${slug}__default\\.png\\)\\n([\\s\\S]*?)(?=\\n## |\\n# |\\Z)`, 'm'),
  ];
  for (const re of cands) {
    const m = content.match(re);
    if (m && m[1] && m[1].trim().length >= 20) {
      return m[1]
        .replace(/\s*(?:photorealistic|Photorealistic) portrait, hyper-detailed[\s\S]*$/i, '')
        .replace(/\s*NO\s+(?:photorealistic|3D render)[\s\S]*$/i, '')
        .replace(/\s+grounded human anatomy with natural asymmetry, 8k\.?\s*$/i, '')
        .trim();
    }
  }
  return null;
}

function extractNegativePrompt(content) {
  const m = content.match(/^## Negative Prompt\n([\s\S]*?)(?=\n## |\n# |\Z)/m);
  return m && m[1] ? m[1].trim().replace(/^--no\s+/i, '').replace(/\s+/g, ' ') : '';
}

function buildGenerationPrompt(baseText, negativeText) {
  let p = baseText;
  if (negativeText) {
    const suffix = ` NO ${negativeText}`;
    if ((p + suffix).length <= 800) {
      p += suffix;
    } else {
      const room = 800 - suffix.length;
      if (room > 100) {
        p = p.substring(0, room).replace(/\s+\S*$/, '') + suffix;
      } else {
        p = p.substring(0, 790).replace(/\s+\S*$/, '');
      }
    }
  } else if (p.length > 800) {
    p = p.substring(0, 800).replace(/\s+\S*$/, '');
  }
  return p;
}

async function generateNIM(prompt, width, height, outPath) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(NIM_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${NVIDIA_API_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width, height, seed: 0, steps: 4 }),
      });
      if (res.status === 429) { if (attempt < 2) await sleep(5000 * attempt); else return { ok: false, error: 'rate limited' }; continue; }
      if (!res.ok) { const t = (await res.text()).substring(0, 120); return { ok: false, error: `HTTP ${res.status}: ${t}` }; }
      const body = await res.json();
      const a = body.artifacts && body.artifacts[0];
      if (a && a.finishReason === 'CONTENT_FILTERED') return { ok: false, error: 'content_filtered' };
      const b64 = a && a.base64;
      if (!b64) return { ok: false, error: 'no base64 artifact' };
      const buf = Buffer.from(b64, 'base64');
      const tmpPath = outPath + '.tmp';
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(tmpPath, buf);
      if (isErrorFile(tmpPath)) { fs.unlinkSync(tmpPath); return { ok: false, error: 'error file' }; }
      fs.renameSync(tmpPath, outPath);
      return { ok: true, size: buf.length };
    } catch (err) { if (attempt < 2) await sleep(5000 * attempt); else return { ok: false, error: err.message.substring(0, 80) }; }
  }
  return { ok: false, error: 'max retries exceeded' };
}

async function httpGet(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function generatePollinations(prompt, negativeText, width, height, outPath) {
  const neg = negativeText ? `&negative_prompt=${encodeURIComponent(negativeText)}` : '';
  const url = `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true${neg}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const buf = await httpGet(url);
      const tmpPath = outPath + '.tmp';
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(tmpPath, buf);
      if (isErrorFile(tmpPath)) { fs.unlinkSync(tmpPath); throw new Error('error file'); }
      fs.renameSync(tmpPath, outPath);
      return { ok: true, size: buf.length };
    } catch (err) { if (attempt < 2) await sleep(5000); else return { ok: false, error: err.message.substring(0, 80) }; }
  }
  return { ok: false, error: 'max retries exceeded' };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, force: false, limit: Infinity, only: null, fill: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run': opts.dryRun = true; break;
      case '--force': opts.force = true; break;
      case '--fill': opts.fill = true; break;
      case '--limit': opts.limit = parseInt(args[++i], 10); break;
      case '--only': opts.only = new Set(args[++i].split(',').map((s) => s.trim()).filter(Boolean)); break;
      case '--help': case '-h': console.log('generate-base-defaults.mjs - M6 Part B base-only portraits'); process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const folders = fs.readdirSync(CHARACTER_ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const targets = [];
  for (const slug of folders) {
    if (opts.only && !opts.only.has(slug)) continue;
    const dir = path.join(CHARACTER_ROOT, slug);
    if (!fs.existsSync(path.join(dir, `${slug}.prompt.md`))) continue;
    const assetsDir = path.join(dir, 'assets');
    const outFile = path.join(assetsDir, `${slug}__default.png`);
    if (opts.fill) {
      // --fill: target folders lacking a usable <slug>__default.png, including
      // the verify-only group and any corrupt/small stub. Additive only.
      if (defaultIsUsable(outFile)) continue;
    } else {
      // Default scope: only folders WITHOUT an assets/ dir (M6 Part B target).
      if (fs.existsSync(assetsDir)) continue;
    }
    targets.push({ slug, promptFile: path.join(dir, `${slug}.prompt.md`), outFile });
  }
  console.log(`\n M6 Part B - base-only defaults (NIM -> Pollinations)`);
  console.log(`   targets: ${targets.length}`);
  if (!NVIDIA_API_KEY) console.log('   ! No NVIDIA_API_KEY - NIM skipped');
  if (opts.dryRun) { for (const t of targets.slice(0, opts.limit)) console.log(`   ${t.slug}`); return; }

  let okCount = 0, failCount = 0, pollNext = 0;
  for (const t of targets.slice(0, opts.limit)) {
    const content = fs.readFileSync(t.promptFile, 'utf8').replace(/\r\n/g, '\n');
    const baseText = extractBasePrompt(content, t.slug);
    if (!baseText) { console.log(`   ! ${t.slug} - no base prompt, skipped`); failCount++; continue; }
    const neg = extractNegativePrompt(content);
    const prompt = buildGenerationPrompt(baseText, neg);
    const dims = pickSupportedResolution(parseDims(content).width, parseDims(content).height);
    console.log(`\n   ${t.slug} (${dims.width}x${dims.height})`);
    let outPath = t.outFile;
    if (fs.existsSync(outPath)) {
      // Never overwrite an existing asset: write to a new timestamped name.
      const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      outPath = path.join(path.dirname(outPath), `${t.slug}__default__${ts}.png`);
    }
    if (NVIDIA_API_KEY) {
      const res = await generateNIM(prompt, dims.width, dims.height, outPath);
      if (res.ok) { console.log(`     NIM ok: ${path.basename(outPath)} (${res.size} bytes)`); okCount++; await sleep(NIM_DELAY_MS); continue; }
      console.log(`     NIM failed: ${res.error}`);
    }
    if (Date.now() < pollNext) { const w = pollNext - Date.now(); console.log(`     poll cooldown ${Math.ceil(w / 1000)}s`); await sleep(w); }
    const pr = await generatePollinations(prompt, neg, dims.width, dims.height, outPath);
    pollNext = Date.now() + POLLINATIONS_COOLDOWN_MS;
    if (pr.ok) { console.log(`     Pollinations ok: ${path.basename(outPath)} (${pr.size} bytes)`); okCount++; }
    else { console.log(`     Pollinations failed: ${pr.error}`); failCount++; }
  }
  console.log(`\n=== OK: ${okCount} | Fail: ${failCount} ===\n`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
