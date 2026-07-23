#!/usr/bin/env node
/**
 * content-audit.mjs
 *
 * Scans all entity folders under content/ and reports per-type file completeness.
 * Exits non-zero if any folder has a YAML but is missing .md or .prompt.md.
 * Warns (exit 0) for missing assets/ directories.
 *
 * Usage: node scripts/content-audit.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = path.resolve('content');
const DRY_RUN = process.argv.includes('--dry-run');

// Content types: folder-based entities with YAML files.
// expectMd: whether folders of this type are expected to have <slug>.md and <slug>.prompt.md
const FOLDER_TYPES = [
  { dir: 'characters', prefix: 'char_', expectMd: true },
  { dir: 'scenes', prefix: 'scene_', expectMd: false },
  { dir: 'locations', prefix: 'location_', expectMd: false },
  { dir: 'overlays', prefix: 'overlay_', expectMd: false },
  { dir: 'missions', prefix: 'mission_', expectMd: false },
  { dir: 'stories', prefix: '', expectMd: true },
  { dir: 'story_beats', prefix: 'story_beat_', expectMd: false },
  { dir: 'dialogues', prefix: 'dialogue_', expectMd: false },
];

function scanType(typeDef) {
  const typeDir = path.join(CONTENT_DIR, typeDef.dir);
  if (!fs.existsSync(typeDir)) return null;

  const entries = fs.readdirSync(typeDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  const counts = { folders: 0, yaml: 0, md: 0, promptMd: 0, assets: 0, defaultPng: 0 };
  const errors = [];
  const warnings = [];

  for (const slug of entries) {
    counts.folders++;

    const folder = path.join(typeDir, slug);
    const yamlFile = path.join(folder, `${typeDef.prefix}${slug}.yaml`);
    const mdFile = path.join(folder, `${slug}.md`);
    const promptFile = path.join(folder, `${slug}.prompt.md`);
    const assetsDir = path.join(folder, 'assets');
    const defaultPng = path.join(assetsDir, `${slug}__default.png`);

    const hasYaml = fs.existsSync(yamlFile);
    const hasMd = fs.existsSync(mdFile);
    const hasPrompt = fs.existsSync(promptFile);
    const hasAssets = fs.existsSync(assetsDir);
    const hasDefaultPng = fs.existsSync(defaultPng);

    if (hasYaml) counts.yaml++;
    if (hasMd) counts.md++;
    if (hasPrompt) counts.promptMd++;
    if (hasAssets) counts.assets++;
    if (hasDefaultPng) counts.defaultPng++;

    if (hasYaml && typeDef.expectMd && (!hasMd || !hasPrompt)) {
      const missing = [];
      if (!hasMd) missing.push('.md');
      if (!hasPrompt) missing.push('.prompt.md');
      errors.push(`${typeDef.dir}/${slug}: missing ${missing.join(', ')}`);
    }

    if (!hasAssets) {
      warnings.push(`${typeDef.dir}/${slug}: missing assets/`);
    }
  }

  return { type: typeDef.dir, counts, errors, warnings };
}

function printTable(results) {
  const pad = (s, n) => String(s).padStart(n);
  const cols = [
    { label: 'Type', width: 12 },
    { label: 'Folders', width: 7 },
    { label: 'YAML', width: 4 },
    { label: '.md', width: 4 },
    { label: '.prompt.md', width: 9 },
    { label: 'assets/', width: 7 },
    { label: '__default.png', width: 13 },
  ];

  const header = '| ' + cols.map(c => pad(c.label, c.width)).join(' | ') + ' |';
  const sep = '|' + cols.map(c => '-'.repeat(c.width + 2)).join('|') + '|';

  console.log(header);
  console.log(sep);

  for (const r of results) {
    const c = r.counts;
    const row = '| '
      + pad(r.type, cols[0].width) + ' | '
      + pad(c.folders, cols[1].width) + ' | '
      + pad(c.yaml, cols[2].width) + ' | '
      + pad(c.md, cols[3].width) + ' | '
      + pad(c.promptMd, cols[4].width) + ' | '
      + pad(c.assets, cols[5].width) + ' | '
      + pad(c.defaultPng, cols[6].width) + ' |';
    console.log(row);
  }
}

// --- Main ---

console.log('\n📊 Content Audit');
console.log('================\n');

const results = [];
let totalErrors = 0;
let totalWarnings = 0;

for (const typeDef of FOLDER_TYPES) {
  const result = scanType(typeDef);
  if (result) {
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }
}

if (results.length === 0) {
  console.log('No content type directories found.');
  process.exit(0);
}

printTable(results);

console.log('');

if (totalErrors > 0) {
  console.log(`❌ Errors: ${totalErrors} folders missing .md or .prompt.md`);
  if (!DRY_RUN) {
    for (const r of results) {
      for (const e of r.errors) console.log(`   ${e}`);
    }
  }
  process.exitCode = 1;
} else {
  console.log('✅ No errors — all expected files present.');
}

if (totalWarnings > 0) {
  console.log(`⚠️  Warnings: ${totalWarnings} folders missing assets/`);
} else {
  console.log('✅ All folders have assets/');
}
