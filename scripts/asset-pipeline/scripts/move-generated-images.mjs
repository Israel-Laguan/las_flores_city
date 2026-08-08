#!/usr/bin/env node
/*
 * move-generated-images.mjs
 *
 * Moves the flat generated images from
 *   scripts/asset-pipeline/output/images/<slug>__default.png
 * into their owning content folder's assets/ directory, derived from each
 * entry's `file` field (the .prompt.md path).
 *
 *   content/<type>/<slug>/<slug>.prompt.md  ->  content/<type>/<slug>/assets/<slug>__default.png
 *
 * Rename-on-collision (never overwrite): if the destination name already
 * exists, the incoming file is renamed with a numeric suffix (-2, -3, ...).
 *
 * Idempotent: if the source image is already in the right place under the
 * exact target name, it is left alone.
 *
 * Usage:
 *   node scripts/asset-pipeline/scripts/move-generated-images.mjs \
 *     [--input <prompts.json>] [--images-dir <dir>] [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  const opts = {
    input: 'scripts/asset-pipeline/output/non-i2i-prompts.json',
    imagesDir: 'scripts/asset-pipeline/output/images',
    dryRun: false,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--input') opts.input = process.argv[++i];
    else if (a === '--images-dir') opts.imagesDir = process.argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

// Must match generate-images.mjs's slugify EXACTLY so filenames line up.
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Mirror of the generator's entrySlug so filenames line up exactly. */
function entrySlug(entry) {
  if (entry.name) return slugify(entry.name);
  const base = path.basename(entry.file || '')
    .replace(/\.prompt\.md$/i, '')
    .replace(/\.prompt$/i, '')
    .replace(/\.md$/i, '');
  return slugify(base || 'untitled');
}

function uniqueName(targetDir, base) {
  const parsed = path.parse(base);
  let candidate = path.join(targetDir, base);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(targetDir, `${parsed.name}-${n}${parsed.ext}`);
    n += 1;
  }
  return candidate;
}

function main() {
  const opts = parseArgs();
  const inputPath = path.resolve(opts.input);
  const imagesDir = path.resolve(opts.imagesDir);

  const entries = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  console.log(
    `\nMoving generated images: ${entries.length} entries, source=${imagesDir}` +
      (opts.dryRun ? '  [DRY RUN — no files written]' : ''),
  );

  let moved = 0;
  let renamed = 0;
  let skipped = 0;
  let missing = 0;

  for (const entry of entries) {
    const srcName = `${entrySlug(entry)}__default.png`;
    const src = path.join(imagesDir, srcName);
    if (!fs.existsSync(src)) {
      missing += 1;
      console.warn(`  [MISSING SOURCE] ${srcName}`);
      continue;
    }

    const targetDir = path.join(path.dirname(path.resolve(entry.file)), 'assets');
    const dest = uniqueName(targetDir, srcName);
    const destBase = path.basename(dest);

    if (dest === path.resolve(src)) {
      skipped += 1;
      continue;
    }

    if (fs.existsSync(path.join(targetDir, srcName)) && destBase !== srcName) {
      renamed += 1;
      console.log(`  [RENAME] ${srcName} -> ${path.relative(process.cwd(), dest)}`);
    } else {
      moved += 1;
      console.log(`  [MOVE]   ${srcName} -> ${path.relative(process.cwd(), dest)}`);
    }

    if (!opts.dryRun) {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.renameSync(src, dest);
    }
  }

  console.log(
    `\nDone. moved=${moved} renamed=${renamed} skipped=${skipped} missing_source=${missing}`,
  );
  if (opts.dryRun) console.log('(dry run — no changes made)');
}

main();
