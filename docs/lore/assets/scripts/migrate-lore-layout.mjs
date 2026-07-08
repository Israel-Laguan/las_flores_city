#!/usr/bin/env node

/**
 * migrate-lore-layout.mjs
 *
 * Unifies docs/lore/figures and docs/lore/landmarks into per-entity folders:
 *
 *   figures/<name>/<name>.md + <name>.prompt.md + assets/
 *   landmarks/<region>/<name>/<name>.md + <name>.prompt.md + assets/
 *
 * Also rewrites .prompt.md frontmatter `source:` paths and landmarks/README.md links.
 *
 * Usage:
 *   node migrate-lore-layout.mjs --dry-run
 *   node migrate-lore-layout.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('docs/lore');
const FIGURES_ROOT = path.join(ROOT, 'figures');
const LANDMARKS_ROOT = path.join(ROOT, 'landmarks');
const README_PATH = path.join(LANDMARKS_ROOT, 'README.md');

const DRY_RUN = process.argv.includes('--dry-run');

function log(...args) {
  console.log(...args);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (DRY_RUN) {
      log(`  [dry-run] mkdir ${dir}`);
    } else {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function moveFile(src, dest) {
  if (DRY_RUN) {
    log(`  [dry-run] move ${src} -> ${dest}`);
    return;
  }
  ensureDir(path.dirname(dest));
  fs.renameSync(src, dest);
}

function rewritePromptSource(promptPath, newSource) {
  if (!fs.existsSync(promptPath)) return;
  let content = fs.readFileSync(promptPath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return;

  const frontmatter = frontmatterMatch[1];
  const updated = frontmatter.replace(
    /^(source:\s*)(.+)$/m,
    `$1${newSource}`
  );

  if (frontmatter !== updated) {
    if (DRY_RUN) {
      log(`  [dry-run] update source in ${promptPath} -> ${newSource}`);
    } else {
      content = content.replace(frontmatter, updated);
      fs.writeFileSync(promptPath, content, 'utf-8');
    }
  }
}

// ── Figures ──────────────────────────────────────────────────────────────────

function migrateFigures() {
  log('\n=== Figures ===');
  if (!fs.existsSync(FIGURES_ROOT)) {
    log('No figures directory found.');
    return;
  }

  const entries = fs.readdirSync(FIGURES_ROOT, { withFileTypes: true });
  let moved = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const base = path.basename(entry.name, path.extname(entry.name));
    const ext = path.extname(entry.name);

    if (ext !== '.md') continue;
    if (base.endsWith('.prompt')) continue;

    const loreFile = path.join(FIGURES_ROOT, `${base}.md`);
    const promptFile = path.join(FIGURES_ROOT, `${base}.prompt.md`);
    const targetDir = path.join(FIGURES_ROOT, base);
    const targetLore = path.join(targetDir, `${base}.md`);
    const targetPrompt = path.join(targetDir, `${base}.prompt.md`);

    if (!fs.existsSync(loreFile)) continue;

    ensureDir(targetDir);

    if (fs.existsSync(loreFile)) {
      moveFile(loreFile, targetLore);
    }
    if (fs.existsSync(promptFile)) {
      moveFile(promptFile, targetPrompt);
      rewritePromptSource(
        targetPrompt,
        `docs/lore/figures/${base}/${base}.md`
      );
    }

    moved++;
  }

  log(`Figures processed: ${moved}`);
}

// ── Landmarks ────────────────────────────────────────────────────────────────

function migrateLandmarks() {
  log('\n=== Landmarks ===');
  if (!fs.existsSync(LANDMARKS_ROOT)) {
    log('No landmarks directory found.');
    return;
  }

  const regions = fs.readdirSync(LANDMARKS_ROOT, { withFileTypes: true });
  let moved = 0;

  for (const region of regions) {
    if (!region.isDirectory()) continue;
    const regionPath = path.join(LANDMARKS_ROOT, region.name);

    const files = fs.readdirSync(regionPath, { withFileTypes: true });
    const mdFiles = files.filter(f => f.isFile() && f.name.endsWith('.md') && !f.name.endsWith('.prompt.md'));

    for (const md of mdFiles) {
      const base = path.basename(md.name, '.md');
      const loreFile = path.join(regionPath, md.name);
      const promptFile = path.join(regionPath, `${base}.prompt.md`);
      const targetDir = path.join(regionPath, base);
      const targetLore = path.join(targetDir, `${base}.md`);
      const targetPrompt = path.join(targetDir, `${base}.prompt.md`);

      ensureDir(targetDir);

      if (fs.existsSync(loreFile)) {
        moveFile(loreFile, targetLore);
      }
      if (fs.existsSync(promptFile)) {
        moveFile(promptFile, targetPrompt);
        rewritePromptSource(
          targetPrompt,
          `docs/lore/landmarks/${region.name}/${base}/${base}.md`
        );
      }

      moved++;
    }
  }

  log(`Landmarks processed: ${moved}`);
}

// ── README links ─────────────────────────────────────────────────────────────

function rewriteReadme() {
  if (!fs.existsSync(README_PATH)) {
    log('\nNo landmarks/README.md found.');
    return;
  }

  let content = fs.readFileSync(README_PATH, 'utf-8');
  const original = content;

  content = content.replace(
    /(\([^)]*?)(\w+\/[\w_]+)\.md(\))/g,
    (match, prefix, rest, suffix) => {
      const parts = rest.split('/');
      if (parts.length === 2) {
        return `${prefix}${parts[0]}/${parts[1]}/${parts[1]}.md${suffix}`;
      }
      return match;
    }
  );

  if (content !== original) {
    if (DRY_RUN) {
      log('\n[dry-run] Would rewrite links in landmarks/README.md');
    } else {
      fs.writeFileSync(README_PATH, content, 'utf-8');
      log('\nRewrote links in landmarks/README.md');
    }
  } else {
    log('\nNo README link changes needed.');
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  log(DRY_RUN ? '=== DRY RUN ===' : '=== MIGRATING ===');
  migrateFigures();
  migrateLandmarks();
  rewriteReadme();
  log('\nDone.');
}

main();
