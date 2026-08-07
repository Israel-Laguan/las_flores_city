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
import { load as loadYaml } from 'js-yaml';

const CONTENT_DIR = path.resolve('content');
const DRY_RUN = process.argv.includes('--dry-run');

// Content types: folder-based entities with YAML files.
// expectMd: whether folders of this type are expected to have <slug>.md and <slug>.prompt.md.
// assets/ is always checked (warning only) regardless of expectMd.
const FOLDER_TYPES = [
  { dir: 'characters', prefix: 'char_', expectMd: true },
  { dir: 'scenes', prefix: 'scene_', expectMd: true },
  { dir: 'locations', prefix: 'location_', expectMd: true },
  { dir: 'overlays', prefix: 'overlay_', expectMd: true },
  { dir: 'missions', prefix: 'mission_', expectMd: false },
  { dir: 'stories', prefix: '', expectMd: true },
  { dir: 'story_beats', prefix: 'story_beat_', expectMd: false },
  { dir: 'dialogues', prefix: 'dialogue_', expectMd: true },
];

// Which YAML array field carries expression-tagged asset entries per type.
// Convention: `portrait_urls[].expression` (characters) and
// `background_urls[].expression` (scenes) tag image variants whose local
// staging file must be `<slug>__<expression>.png` in assets/.
// See docs/ASSET_EXPRESSION_VOCABULARY.md.
const EXPRESSION_FIELD = {
  characters: 'portrait_urls',
  scenes: 'background_urls',
};

/**
 * Cross-reference expression-tagged asset entries (portrait_urls /
 * background_urls) against local staging files in assets/.
 *
 * Returns `{ warnings, parseErrors }`:
 *  - `warnings` for any expression-tagged entry with no matching
 *    `<slug>__<expression>.png` file (a genuine missing-asset signal).
 *  - `parseErrors` for an unparseable YAML file, kept separate so a malformed
 *    scene/character file is reported as a parse failure (an authoring error)
 *    rather than as a missing staging image.
 */
function checkExpressionAssets(typeDef, folder, slug, displayPath) {
  const yamlFile = path.join(folder, `${typeDef.prefix}${slug}.yaml`);
  const field = EXPRESSION_FIELD[typeDef.dir];
  if (!field || !fs.existsSync(yamlFile)) return { warnings: [], parseErrors: [] };

  let data;
  try {
    data = loadYaml(fs.readFileSync(yamlFile, 'utf-8'));
  } catch (err) {
    return { warnings: [], parseErrors: [`${displayPath}: unparseable YAML (${err.message})`] };
  }

  const entries = Array.isArray(data && data[field]) ? data[field] : [];
  if (entries.length === 0) return { warnings: [], parseErrors: [] };

  const assetsDir = path.join(folder, 'assets');
  const defaultPng = path.join(assetsDir, `${slug}__default.png`);
  const warnings = [];
  for (const entry of entries) {
    const expression = entry && typeof entry.expression === 'string' && entry.expression.trim()
      ? entry.expression.trim()
      : null;
    if (!expression) continue; // default entry — covered by `<slug>__default.png`

    const variantPng = path.join(assetsDir, `${slug}__${expression}.png`);
    // A `neutral` expression is satisfied by the base image staged as
    // `<slug>__default.png` when no dedicated `<slug>__neutral.png` exists.
    if (!fs.existsSync(variantPng) && !(expression.toLowerCase() === 'neutral' && fs.existsSync(defaultPng))) {
      warnings.push(
        `${displayPath}: ${field}[] expression "${expression}" has no asset assets/${slug}__${expression}.png`
      );
    }
  }
  return { warnings, parseErrors: [] };
}

function scanFolder(typeDef, folder, slug, displayPath) {
  const yamlFile = path.join(folder, `${typeDef.prefix}${slug}.yaml`);
  const mdFile = path.join(folder, `${slug}.md`);
  const assetsDir = path.join(folder, 'assets');
  const defaultPng = path.join(assetsDir, `${slug}__default.png`);

  // Accept any `*.prompt.md` in the folder as satisfying the prompt-file
  // requirement. This supports typed variants — e.g. `<slug>.<type>.prompt.md`
  // (biometric, character-sheet, map) alongside the primary `<slug>.prompt.md`.
  // Convention: docs/PROMPT_FILE_LAYOUT.md.
  const hasPrompt = fs.existsSync(path.join(folder, `${slug}.prompt.md`))
    || fs.readdirSync(folder, { withFileTypes: true })
        .some(e => e.isFile() && e.name.endsWith('.prompt.md'));

  const hasYaml = fs.existsSync(yamlFile);
  const hasMd = fs.existsSync(mdFile);
  const hasAssets = fs.existsSync(assetsDir);
  const hasDefaultPng = fs.existsSync(defaultPng);

  const counts = { yaml: 0, md: 0, promptMd: 0, assets: 0, defaultPng: 0 };
  const errors = [];
  const warnings = [];
  const expressionWarnings = [];
  const expressionParseErrors = [];

  if (hasYaml) counts.yaml++;
  if (hasMd) counts.md++;
  if (hasPrompt) counts.promptMd++;
  if (hasAssets) counts.assets++;
  if (hasDefaultPng) counts.defaultPng++;

  if (hasYaml && typeDef.expectMd !== false && (!hasMd || !hasPrompt)) {
    const missing = [];
    if (!hasMd) missing.push('.md');
    if (!hasPrompt) missing.push('.prompt.md');
    errors.push(`${displayPath}: missing ${missing.join(', ')}`);
  }

  if (!hasAssets) {
    warnings.push(`${displayPath}: missing assets/`);
  }

  const exprResult = checkExpressionAssets(typeDef, folder, slug, displayPath);
  expressionWarnings.push(...exprResult.warnings);
  expressionParseErrors.push(...exprResult.parseErrors);

  return { counts, errors, warnings, expressionWarnings, expressionParseErrors };
}

function scanType(typeDef) {
  if (typeDef.dir === 'locations') {
    const districtsDir = path.join(CONTENT_DIR, 'districts');
    if (!fs.existsSync(districtsDir)) return null;

    const totalCounts = { folders: 0, yaml: 0, md: 0, promptMd: 0, assets: 0, defaultPng: 0 };
    const allErrors = [];
    const allWarnings = [];
    const allExpressionWarnings = [];
    const allExpressionParseErrors = [];

    const districtEntries = fs.readdirSync(districtsDir, { withFileTypes: true })
      .filter(e => e.isDirectory());
      
    for (const d of districtEntries) {
      const typeDir = path.join(districtsDir, d.name, 'locations');
      if (!fs.existsSync(typeDir)) continue;
      
      const entries = fs.readdirSync(typeDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
        
      for (const slug of entries) {
        totalCounts.folders++;
        const folder = path.join(typeDir, slug);
        const { counts, errors, warnings, expressionWarnings, expressionParseErrors } = scanFolder(typeDef, folder, slug, `districts/${d.name}/locations/${slug}`);
        totalCounts.yaml += counts.yaml;
        totalCounts.md += counts.md;
        totalCounts.promptMd += counts.promptMd;
        totalCounts.assets += counts.assets;
        totalCounts.defaultPng += counts.defaultPng;
        allErrors.push(...errors);
        allWarnings.push(...warnings);
        allExpressionWarnings.push(...expressionWarnings);
        allExpressionParseErrors.push(...expressionParseErrors);
      }
    }
    return { type: typeDef.dir, counts: totalCounts, errors: allErrors, warnings: allWarnings, expressionWarnings: allExpressionWarnings, expressionParseErrors: allExpressionParseErrors };
  }

  const typeDir = path.join(CONTENT_DIR, typeDef.dir);
  if (!fs.existsSync(typeDir)) return null;

  const entries = fs.readdirSync(typeDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  const totalCounts = { folders: 0, yaml: 0, md: 0, promptMd: 0, assets: 0, defaultPng: 0 };
  const allErrors = [];
  const allWarnings = [];
  const allExpressionWarnings = [];
  const allExpressionParseErrors = [];

  for (const slug of entries) {
    totalCounts.folders++;
    const folder = path.join(typeDir, slug);
    const { counts, errors, warnings, expressionWarnings, expressionParseErrors } = scanFolder(typeDef, folder, slug, `${typeDef.dir}/${slug}`);
    totalCounts.yaml += counts.yaml;
    totalCounts.md += counts.md;
    totalCounts.promptMd += counts.promptMd;
    totalCounts.assets += counts.assets;
    totalCounts.defaultPng += counts.defaultPng;
    allErrors.push(...errors);
    allWarnings.push(...warnings);
    allExpressionWarnings.push(...expressionWarnings);
    allExpressionParseErrors.push(...expressionParseErrors);
  }

  return { type: typeDef.dir, counts: totalCounts, errors: allErrors, warnings: allWarnings, expressionWarnings: allExpressionWarnings, expressionParseErrors: allExpressionParseErrors };
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
let totalExpressionWarnings = 0;
let totalExpressionParseErrors = 0;

for (const typeDef of FOLDER_TYPES) {
  const result = scanType(typeDef);
  if (result) {
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    totalExpressionWarnings += result.expressionWarnings.length;
    totalExpressionParseErrors += result.expressionParseErrors.length;
  }
}

if (results.length === 0) {
  console.log('No content type directories found.');
  process.exit(0);
}

printTable(results);

console.log('');

if (totalErrors > 0 || totalExpressionParseErrors > 0) {
  if (totalErrors > 0) {
    console.log(`❌ Errors: ${totalErrors} folders missing .md or .prompt.md`);
    if (!DRY_RUN) {
      for (const r of results) {
        for (const e of r.errors) console.log(`   ${e}`);
      }
    }
  }
  if (totalExpressionParseErrors > 0) {
    console.log(`❌ Malformed YAML: ${totalExpressionParseErrors} file(s) failed to parse`);
    if (!DRY_RUN) {
      for (const r of results) {
        for (const e of r.expressionParseErrors) console.log(`   ${e}`);
      }
    }
  }
  process.exitCode = 1;
} else {
  console.log('✅ No errors — all expected files present.');
}

if (totalWarnings > 0 || totalExpressionWarnings > 0) {
  console.log('⚠️  Warnings:');
  if (totalWarnings > 0) {
    console.log(`  ${totalWarnings} folder(s) missing assets/`);
    for (const r of results) for (const w of r.warnings) console.log(`   ${w}`);
  }
  if (totalExpressionWarnings > 0) {
    console.log(`  ${totalExpressionWarnings} tagged asset(s) missing a matching staging file`);
    for (const r of results) for (const w of r.expressionWarnings) console.log(`   ${w}`);
  }
} else {
  console.log('✅ No warnings — assets/ present and expression files match.');
}
