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

// Full 8-byte PNG signature: 89 50 4e 47 0d 0a 1a 0a
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseArgs(argv = process.argv.slice(2)) {
  const a = argv;
  const o = { csv: DEFAULT_CSV };
  for (let i = 0; i < a.length; i++) {
    const arg = a[i];
    if (arg !== '--csv') throw new Error(`Unknown option: ${arg}`);
    const value = a[++i];
    if (!value || value.startsWith('--')) throw new Error('--csv requires a path');
    o.csv = path.resolve(value);
  }
  return o;
}

function isHealthyPng(p) {
  if (!fs.existsSync(p)) return false;
  if (fs.statSync(p).size < MIN_OK) return false;
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(8);
  try { fs.readSync(fd, buf, 0, 8, 0); } finally { fs.closeSync(fd); }
  return buf.equals(PNG_SIGNATURE);
}

/**
 * RFC 4180-compatible CSV parser.
 *
 * Returns an array of row arrays, where each row is an array of field strings.
 * Decodes escaped quotes ("") within quoted fields. Throws on malformed input
 * (stray quote outside a quoted field).
 */
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let atFieldStart = true;
  let hasData = false;

  const flushRow = () => {
    if (hasData || row.length > 0) {
      rows.push(row);
    }
    row = [];
    field = '';
    atFieldStart = true;
    hasData = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      if (!atFieldStart) throw new Error('Unexpected quote in CSV field');
      inQuotes = true;
      hasData = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      atFieldStart = true;
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      flushRow();
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      flushRow();
    } else {
      field += ch;
      atFieldStart = false;
      hasData = true;
    }
  }
  // Flush last row if the file doesn't end with a newline
  if (hasData || field !== '') {
    row.push(field);
    flushRow();
  }
  return rows;
}

/**
 * RFC 4180-compatible field serializer. Quotes a field only when it contains
 * a comma, double-quote, or newline, and doubles any embedded double quotes.
 */
function serializeField(field) {
  const s = field !== null && field !== undefined ? String(field) : '';
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Serialize a parsed CSV (array of row arrays) back to text. */
function serializeCsv(rows) {
  return rows.map((row) => row.map(serializeField).join(',')).join('\n') + '\n';
}

/**
 * Core processing: parse CSV text, check PNG health for each manifest entry,
 * update the `done` column, and return the processed rows + summary stats.
 */
function processRows(csvText, csvDir) {
  const rows = parseCsv(csvText);
  if (rows.length < 1) throw new Error('CSV has no header row');

  const header = rows[0];
  const pathIdx = header.findIndex((h) => h === 'path');
  const doneIdx = header.findIndex((h) => h === 'done');

  let done = 0;
  let changed = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (pathIdx < 0 || doneIdx < 0) continue;
    const rawPath = row[pathIdx];
    if (!rawPath) continue;
    const resolvedPath = path.isAbsolute(rawPath)
      ? rawPath
      : path.resolve(csvDir, rawPath);
    const healthy = isHealthyPng(resolvedPath);
    const want = healthy ? 1 : 0;
    const current = Number(row[doneIdx]) || 0;
    if (current !== want) {
      row[doneIdx] = String(want);
      changed++;
    }
    if (want) done++;
  }

  return { rows, done, changed, total: rows.length - 1 };
}

function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.csv)) { console.error(`CSV not found: ${opts.csv}`); process.exit(1); }
  const csvText = fs.readFileSync(opts.csv, 'utf8');
  const csvDir = path.dirname(opts.csv);
  const { rows, done, changed, total } = processRows(csvText, csvDir);

  // Re-serialize preserving header and ALL data rows (no dropped records)
  const rebuilt = serializeCsv(rows);
  fs.writeFileSync(opts.csv, rebuilt);

  const remaining = total - done;
  const pct = total === 0 ? 'N/A' : `${((done / total) * 100).toFixed(1)}%`;
  console.log('\n📊 M6 Part B — expression-variant disk coverage');
  console.log(`   Declared variants : ${total}`);
  console.log(`   Present & healthy : ${done} (${pct})`);
  console.log(`   Missing/corrupt   : ${remaining}`);
  console.log(`   CSV status updates: ${changed}`);
  console.log(`   Manifest          : ${opts.csv}\n`);
  console.log(remaining === 0
    ? '   ✅ All expression variants present — M6 Part B can be marked DONE.'
    : `   ⏳ ${remaining} variant(s) still need generation (done=0 rows).`);
}

// Run main only when executed directly (allows importing functions for tests)
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  main();
}

export { parseArgs, parseCsv, serializeCsv, serializeField, isHealthyPng, processRows };
