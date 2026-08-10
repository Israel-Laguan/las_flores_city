#!/usr/bin/env node
/**
 * verify-missing-expression-variants.mjs
 *
 * Companion to `output/missing_expression_variants.csv`. Re-scans every target
 * path in the manifest, sets `done=1` when a healthy file is present, rewrites
 * the CSV in place, and prints an M6 Part B acceptance summary.
 *
 * "Healthy" = file exists, is >= 8000 bytes, and has a real PNG signature
 * (rejects the common `.png`-named-JPEG case and HTML error stubs that NIM/
 * Pollinations sometimes return). No network, no deletions, no provider calls.
 *
 * Usage:
 *   node scripts/asset-pipeline/scripts/verify-missing-expression-variants.mjs
 *   node scripts/asset-pipeline/scripts/verify-missing-expression-variants.mjs --csv <path>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = path.resolve(__dirname, '../output/missing_expression_variants.csv');
const MIN_OK = 8000;

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { csv: DEFAULT_CSV };
  for (let i = 0; i < a.length; i++) if (a[i] === '--csv') o.csv = path.resolve(a[++i]);
  return o;
}

function isHealthyPng(p) {
  if (!fs.existsSync(p)) return false;
  if (fs.statSync(p).size < MIN_OK) return false;
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(8);
  try { fs.readSync(fd, buf, 0, 8, 0); } finally { fs.closeSync(fd); }
  return buf.toString('ascii', 1, 4) === 'PNG';
}

function parseCsv(text) {
  const lines = text.split('\n').filter((l) => l.length > 0);
  const header = lines.shift();
  const rows = [];
  for (const line of lines) {
    const m = line.match(/^([^,]+),"(.*)","(.*)",([0-9]+:[0-9]+),(\d)$/);
    if (!m) { rows.push({ raw: line }); continue; }
    rows.push({ path: m[1], prompt: m[2], nim_safe_prompt: m[3], ratio: m[4], done: Number(m[5]) });
  }
  return { header, rows };
}

function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.csv)) { console.error(`CSV not found: ${opts.csv}`); process.exit(1); }
  const { header, rows } = parseCsv(fs.readFileSync(opts.csv, 'utf8'));
  const declared = rows.filter((r) => r.raw === undefined);

  let done = 0, changed = 0;
  for (const r of declared) {
    const healthy = isHealthyPng(r.path);
    const want = healthy ? 1 : 0;
    if (r.done !== want) { r.done = want; changed++; }
    if (want) done++;
  }

  const rebuilt = [
    header,
    ...declared.map((r) =>
      `${r.path},"${r.prompt.replace(/"/g, '""')}","${r.nim_safe_prompt.replace(/"/g, '""')}",${r.ratio},${r.done}`
    ),
  ].join('\n') + '\n';
  fs.writeFileSync(opts.csv, rebuilt);

  const total = declared.length;
  const remaining = total - done;
  const pct = ((done / total) * 100).toFixed(1);
  console.log('\n📊 M6 Part B — expression-variant disk coverage');
  console.log(`   Declared variants : ${total}`);
  console.log(`   Present & healthy : ${done} (${pct}%)`);
  console.log(`   Missing/corrupt   : ${remaining}`);
  console.log(`   CSV status updates: ${changed}`);
  console.log(`   Manifest          : ${opts.csv}\n`);
  console.log(remaining === 0
    ? '   ✅ All expression variants present — M6 Part B can be marked DONE.'
    : `   ⏳ ${remaining} variant(s) still need generation (done=0 rows).`);
}

main();
