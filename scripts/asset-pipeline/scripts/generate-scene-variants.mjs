#!/usr/bin/env node

/**
 * generate-scene-variants.mjs
 *
 * Text-to-image generation queue for scene background variants.
 *
 * Reads scripts/asset-pipeline/output/scene_background_variants.csv
 * (regenerate with gen-scene-variant-csv.mjs) and generates one PNG per
 * pending row (`done` = 0) using the mixed `t2i_prompt` column:
 *
 *   1. NIM          (NVIDIA text-to-image, flux.2-klein-4b)
 *   2. Akool        (akool-cli text-to-image)
 *   3. Pollinations (free GET endpoint, always last resort)
 *
 * Unlike the older i2i plan ("use the base image as reference"), this explores
 * pure text-to-image: each row's t2i_prompt mixes the base scene description,
 * the variant relighting prose and the negative prompt into one self-contained
 * prompt that fits NIM's 800-char cap — see gen-scene-variant-csv.mjs.
 *
 * Output files are written to each row's `path`
 * (content/scenes/<slug>/assets/<slug>__<variant>.png) and the row's `done`
 * flag is flipped to 1 in the CSV after every success (resume-safe).
 *
 * Usage:
 *   node generate-scene-variants.mjs                  # all pending rows
 *   node generate-scene-variants.mjs --dry-run        # show prompts, no calls
 *   node generate-scene-variants.mjs --limit 5        # first 5 pending rows
 *   node generate-scene-variants.mjs --only acuario:night
 *   node generate-scene-variants.mjs --provider akool # rotate primary provider
 *   node generate-scene-variants.mjs --batch 1/4      # shard across terminals
 *
 * Environment: same as generate-images.mjs (NVIDIA_API_KEY, AKOOL_*,
 * POLLINATIONS_API_KEY). A provider is skipped when unconfigured;
 * Pollinations always works as the final fallback.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildProviderChain,
  dimsFromAspect,
  scaleFromDims,
  isSupportedScale,
  generateNim,
  generateAkool,
  generatePollinations,
} from './generate-images.mjs';

const ROOT = path.resolve(process.cwd());
const CSV_PATH = path.join(ROOT, 'scripts', 'asset-pipeline', 'output', 'scene_background_variants.csv');

// ── Minimal CSV parse/serialize (RFC-4180-ish, quoted fields supported) ─────

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function serializeCSV(header, rows) {
  const body = rows.map((r) => header.map((h) => csvEscape(r[h])).join(',')).join('\n');
  return `${header.join(',')}\n${body}\n`;
}

/** Parse a CSV file into an array of row objects (first record = header). */
function loadCSV(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n');
  const records = [];
  let rec = '';
  let inQuotes = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === '\n' && !inQuotes) { records.push(rec); rec = ''; }
    else rec += ch;
  }
  if (rec.trim() !== '') records.push(rec);
  const header = parseCSVLine(records[0]);
  return records.slice(1)
    .filter((r) => r.trim() !== '')
    .map((r) => {
      const cells = parseCSVLine(r);
      const obj = {};
      header.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
      return obj;
    });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`Usage: node generate-scene-variants.mjs [options]

Options:
  --dry-run             Print resolved prompts/targets without calling providers
  --limit <n>           Process at most n pending rows this run
  --only <slug:variant> Process a single row (e.g. acuario:night)
  --provider <name>     Primary provider: nim (default), akool, pollinations
  --batch <i>/<n>       Shard pending rows across n runs (0-indexed)
  -h, --help            Show this help`);
}

function parseArgs() {
  const opts = { dryRun: false, limit: Infinity, only: null, provider: 'nim', batch: null };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run': opts.dryRun = true; break;
      case '--limit': opts.limit = Math.max(1, Number(args[++i]) || 1); break;
      case '--only': opts.only = String(args[++i] || ''); break;
      case '--provider': {
        const v = String(args[++i] || '').toLowerCase();
        if (!['nim', 'akool', 'pollinations'].includes(v)) {
          console.error('[FAIL] --provider must be one of: nim, akool, pollinations');
          process.exit(1);
        }
        opts.provider = v;
        break;
      }
      case '--batch': {
        const m = String(args[++i] || '').match(/^(\d+)\s*\/\s*(\d+)$/);
        if (!m || Number(m[2]) < 1 || Number(m[1]) >= Number(m[2])) {
          console.error('[FAIL] --batch must be <i>/<n> with 0 <= i < n');
          process.exit(1);
        }
        opts.batch = { index: Number(m[1]), total: Number(m[2]) };
        break;
      }
      case '-h': case '--help': printHelp(); process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }
  return opts;
}

// ── Generation loop ──────────────────────────────────────────────────────────

async function runProvider(name, prompt, ratio) {
  const { width, height } = dimsFromAspect(ratio) || { width: 1024, height: 1024 };
  const scale = isSupportedScale(ratio) ? ratio.trim() : scaleFromDims(width, height);
  // Negative prompts are pre-mixed into t2i_prompt ("NO ..." clause), so the
  // providers' separate negative fields are intentionally left empty here.
  switch (name) {
    case 'nim': return generateNim(prompt, '', width, height);
    case 'akool': return generateAkool(prompt, '', scale);
    case 'pollinations': return generatePollinations(prompt, '', width, height);
    default: throw new Error(`unknown provider: ${name}`);
  }
}

async function main() {
  const opts = parseArgs();

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[FAIL] CSV not found: ${CSV_PATH}`);
    console.error('       Regenerate it with: node scripts/asset-pipeline/scripts/gen-scene-variant-csv.mjs');
    process.exit(1);
  }

  const rows = loadCSV(CSV_PATH);
  const header = Object.keys(rows[0]);
  const pending = rows.filter((r) => r.done !== '1');

  console.log(`\nScene background variants: ${rows.length} rows, ${pending.length} pending.\n`);

  let selected = pending;
  if (opts.only) {
    const [slug, variant] = opts.only.split(':');
    selected = pending.filter((r) => r.slug === slug && (!variant || r.variant === variant));
    if (!selected.length) {
      console.error(`[FAIL] No pending row matches --only ${opts.only}`);
      process.exit(1);
    }
  }
  if (opts.batch) {
    const { index, total } = opts.batch;
    const size = Math.ceil(selected.length / total);
    selected = selected.slice(index * size, (index + 1) * size);
    console.log(`[BATCH] Processing slice ${index}/${total} (${selected.length} rows)\n`);
  }
  selected = selected.slice(0, opts.limit);

  const chain = buildProviderChain(opts.provider);
  console.log(`[PROVIDERS] primary=${opts.provider} chain=${chain.join(' -> ')} (Pollinations last resort)\n`);

  if (opts.dryRun) {
    for (const r of selected) {
      console.log(`[DRY] ${r.path} (${r.slug}:${r.variant}, ratio ${r.ratio})`);
      console.log(`      ${r.t2i_prompt}\n`);
    }
    console.log(`Dry run: ${selected.length} row(s) inspected, nothing generated.`);
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const row of selected) {
    const label = `${row.slug}:${row.variant}`;
    const outPath = path.join(ROOT, row.path);

    // Resume: skip (and mark done) when the target image already exists.
    if (fs.existsSync(outPath)) {
      console.log(`[SKIP] ${label} — file exists, marking done`);
      row.done = '1';
      fs.writeFileSync(CSV_PATH, serializeCSV(header, rows), 'utf8');
      continue;
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    let buffer = null;
    let usedProvider = null;
    for (const name of chain) {
      try {
        buffer = await runProvider(name, row.t2i_prompt, row.ratio);
        usedProvider = name;
        break;
      } catch (err) {
        console.warn(`  ${label}: ${name} failed (${err.message})`);
      }
    }

    if (!buffer) {
      console.error(`[FAIL] ${label}: all providers failed`);
      fail += 1;
      continue;
    }

    fs.writeFileSync(outPath, buffer);
    row.done = '1';
    // Checkpoint after every success so a re-run resumes where we left off.
    fs.writeFileSync(CSV_PATH, serializeCSV(header, rows), 'utf8');
    console.log(`[OK] ${row.path} (${usedProvider})`);
    ok += 1;
  }

  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
