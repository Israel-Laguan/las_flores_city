#!/usr/bin/env node

/**
 * normalize-prompt-frontmatter.mjs
 *
 * Makes frontmatter the single source of truth for `.prompt.md` metadata and
 * removes the duplicated body metadata block that it supersedes.
 *
 * Strategy per file:
 *   1. Parse the YAML frontmatter block (if present).
 *   2. If frontmatter carries an authoritative `type:` (+ optionally `size:`),
 *      strip the legacy body metadata LINES that duplicate it:
 *        - `[CONSUMER: ...]`
 *        - `**Type:** ...`
 *        - `**Source:** ...`
 *        - `**Target field:** ...` / `**Target:** ...`
 *        - `**Dimensions:** WxH`
 *      Only whole, standalone lines are removed. Inline occurrences inside a
 *      prose/prompt paragraph (e.g. `[CONSUMER: biometric] 5-panel ...` in a
 *      draft prompt) are left untouched.
 *   3. Keep human-reference lines: `**Tool:**`, `**Pipeline stage:**`,
 *      `**Recommended tools:**`, etc., and every `##` / `###` section.
 *   4. If frontmatter is absent entirely, the file is left unchanged (no strip,
 *      no backfill) so nothing is destroyed. Reported as "skipped (no fm)".
 *
 * Dry-run by default. Pass --apply to write. Idempotent.
 *
 * Usage:
 *   node scripts/asset-pipeline/scripts/normalize-prompt-frontmatter.mjs          # dry-run
 *   node scripts/asset-pipeline/scripts/normalize-prompt-frontmatter.mjs --apply
 *   node scripts/asset-pipeline/scripts/normalize-prompt-frontmatter.mjs --apply --filter content/characters
 */

import fs from 'node:fs';
import path from 'node:path';

const CONTENT_ROOT = path.resolve('content');
const APPLY = process.argv.includes('--apply');
const filterIdx = process.argv.indexOf('--filter');
const FILTER = filterIdx >= 0 ? path.resolve(process.argv[filterIdx + 1]) : null;

// Legacy body metadata lines — standalone full-line matches only.
// Groups are numbered so a line is removed only when its leading key is one
// of the metadata keys. `**Target:` matches `**Target:**` and `**Target field:**`.
const BODY_META_RE = /^[ \t]*(?:\[CONSUMER:|\*\*Type:\*\*|\*\*Source:\*\*|\*\*Target(?: field)?:\*\*|\*\*Dimensions:\*\*)[^\n]*\n?/gm;
// Human-reference lines we must NOT strip (any bold key not in the strip list survives anyway).
const KEEP_KEYS = ['Tool', 'Pipeline stage', 'Recommended tools', 'Body reference'];

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { frontmatter: null, meta: {}, body: content };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) meta[k] = v;
  }
  return { frontmatter: m[1], meta, body: content.slice(m[0].length) };
}

/**
 * Strip body metadata lines (CONSUMER / Type / Source / Target / Dimensions)
 * that are duplicated by authoritative frontmatter. Only whole standalone
 * lines are removed; inline occurrences inside a prompt paragraph survive
 * (e.g. `[CONSUMER: biometric] 5-panel ...` at the start of a draft prompt).
 */
function stripDuplicateBodyMetadata(content) {
  return content.replace(BODY_META_RE, '');
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, meta } = parseFrontmatter(content);

  if (!frontmatter) {
    return { status: 'skipped-no-frontmatter', from: filePath, to: null };
  }
  if (!meta.type) {
    return { status: 'skipped-no-type', from: filePath, to: null };
  }

  const cleaned = stripDuplicateBodyMetadata(content);
  const changed = cleaned !== content;
  return {
    status: changed ? 'stripped' : 'unchanged',
    from: filePath,
    to: cleaned,
  };
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.prompt.md')) {
      acc.push(full);
    }
  }
  return acc;
}

function main() {
  const files = walk(CONTENT_ROOT).filter(
    (f) => !FILTER || f === FILTER || f.startsWith(FILTER + path.sep),
  );

  let stripped = 0;
  let skippedNoFm = 0;
  let skippedNoType = 0;
  let unchanged = 0;
  let errors = 0;

  for (const f of files) {
    let result;
    try {
      result = processFile(f);
    } catch (err) {
      console.error(`  ❌ ${path.relative(process.cwd(), f)}: ${err.message}`);
      errors++;
      continue;
    }
    switch (result.status) {
      case 'stripped':
        stripped++;
        if (APPLY) {
          fs.writeFileSync(f, result.to, 'utf-8');
          console.log(`  ✓ stripped ${path.relative(process.cwd(), f)}`);
        } else {
          console.log(`  • would strip ${path.relative(process.cwd(), f)}`);
        }
        break;
      case 'unchanged':
        unchanged++;
        break;
      case 'skipped-no-frontmatter':
        skippedNoFm++;
        break;
      case 'skipped-no-type':
        skippedNoType++;
        break;
      default:
        skippedNoFm++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 normalize-prompt-frontmatter (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  console.log(`  Files scanned:   ${files.length}`);
  console.log(`  ${APPLY ? '✓' : '•'} Would strip body metadata: ${stripped}`);
  console.log(`  ⏭️  Unchanged:        ${unchanged}`);
  console.log(`  ⏭️  Skipped (no fm):  ${skippedNoFm}`);
  console.log(`  ⏭️  Skipped (no type):${skippedNoType}`);
  console.log(`  ❌ Errors:           ${errors}`);
}

main();
