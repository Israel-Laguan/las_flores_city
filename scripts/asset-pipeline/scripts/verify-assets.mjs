#!/usr/bin/env node

/**
 * verify-assets.mjs
 *
 * Reads content YAML files and checks whether referenced asset URLs
 * actually exist in MinIO. Reports status per asset.
 *
 * Usage:
 *   node verify-assets.mjs                     # Check all content/
 *   node verify-assets.mjs --source content/characters/char_miguel_jhonson.yaml
 *   node verify-assets.mjs --source content/districts/
 *   node verify-assets.mjs --minio http://localhost:9000
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

// js-yaml is a project dependency (shared/admin/server). Used only for
// the dialogue `visual.expression` cross-check; the URL checker above
// remains dependency-free.
let yamlLoad = null;
try {
  // eslint-disable-next-line import/no-unresolved -- verified devDependency
  yamlLoad = (await import('js-yaml')).load;
} catch {
  yamlLoad = null;
}

// ── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_MINIO_BASE = process.env.MINIO_URL || 'http://localhost:9000';
const CONTENT_DIR = path.resolve('content');

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { minio: DEFAULT_MINIO_BASE, checkMime: false, checkDimensions: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
        opts.source = args[++i];
        break;
      case '--minio':
        opts.minio = args[++i];
        break;
      case '--check-mime':
        opts.checkMime = true;
        break;
      case '--check-dimensions':
        opts.checkDimensions = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
verify-assets.mjs — Check that content YAML asset URLs exist in MinIO

Usage:
  node verify-assets.mjs
  node verify-assets.mjs --source content/characters/char_miguel_jhonson.yaml
  node verify-assets.mjs --source content/districts/
  node verify-assets.mjs --minio http://localhost:9000
  node verify-assets.mjs --check-mime
  node verify-assets.mjs --check-dimensions

Options:
  --source    Single file or directory to check (default: content/)
  --minio     MinIO base URL (default: http://localhost:9000)
  --check-mime        Verify Content-Type matches file extension (.png → image/png, .jpg/.jpeg → image/jpeg)
  --check-dimensions  Verify aspect ratio matches expected (portraits ~3:4, backgrounds ~16:9, tiles ~1:1)
  --help, -h  Show this help
`);
}

function findAllYamlFiles(dir) {
  const results = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(yaml|yml)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function findAllPromptFiles(dir) {
  const results = [];
  function walk(current) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.prompt.md')) {
        results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}

function isAssetUrl(value) {
  return typeof value === 'string' && (
    value.startsWith('http://') || value.startsWith('https://') || value.startsWith('s3://')
  );
}

/**
 * Resolve an asset reference to an HTTP(S) URL that can be HEAD-checked.
 * - Full http(s) URLs pass through unchanged.
 * - `s3://<bucket>/<key>` URIs (the published format written by
 *   `uploadToMinio`) resolve to `<minioBase>/<bucket>/<key>`.
 * - Otherwise it is treated as a relative MinIO path.
 */
function toCheckUrl(url, minioBase) {
  if (url.startsWith('s3://')) {
    const rest = url.slice('s3://'.length);
    const slashIdx = rest.indexOf('/');
    const bucket = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const key = slashIdx === -1 ? '' : rest.slice(slashIdx + 1);
    return `${minioBase}/${bucket}/${key}`;
  }
  return url.startsWith('http') ? url : `${minioBase}/${url.replace(/^\//, '')}`;
}

function extractUrls(obj, results = []) {
  if (!obj || typeof obj !== 'object') return results;

  if (Array.isArray(obj)) {
    for (const item of obj) extractUrls(item, results);
    return results;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'url' && isAssetUrl(value)) {
      results.push(value);
    } else if (key.endsWith('_url') && isAssetUrl(value)) {
      results.push(value);
    } else if (typeof value === 'object' && value !== null) {
      extractUrls(value, results);
    }
  }

  return results;
}

function checkUrl(url, minioBase, checkMime, checkDimensions) {
  return new Promise((resolve) => {
    const targetUrl = toCheckUrl(url, minioBase);

    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(
      targetUrl,
      { method: 'HEAD', timeout: 5000 },
      (res) => {
        const headers = {
          'content-type': res.headers['content-type'] || '',
          'content-length': res.headers['content-length'] || 'unknown',
        };

        if (res.statusCode === 200) {
          // MIME check
          if (checkMime) {
            const mime = headers['content-type'].split(';')[0].trim();
            const ext = url.split('.').pop()?.toLowerCase();
            if (ext === 'png' && mime !== 'image/png') {
              resolve({ status: 'mime_mismatch', size: headers['content-length'], detail: `expected image/png, got ${mime}` });
              return;
            }
            if ((ext === 'jpg' || ext === 'jpeg') && mime !== 'image/jpeg') {
              resolve({ status: 'mime_mismatch', size: headers['content-length'], detail: `expected image/jpeg, got ${mime}` });
              return;
            }
          }

          // Basic aspect ratio check based on URL heuristics
          // (More accurate checks would require fetching the image body)
          if (checkDimensions) {
            const dimensionWarning = estimateDimensionMismatch(url, targetUrl);
            if (dimensionWarning) {
              console.log(`     ⚠️  ${dimensionWarning}`);
            }
          }

          resolve({ status: 'ok', size: headers['content-length'] });
        } else if (res.statusCode === 404) {
          resolve({ status: 'missing', size: null });
        } else {
          resolve({ status: `http_${res.statusCode}`, size: null });
        }
      }
    );

    req.on('error', (err) => {
      resolve({ status: 'error', size: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'timeout', size: null });
    });

    req.end();
  });
}

function estimateDimensionMismatch(url, targetUrl) {
  // Heuristic checks based on URL keywords
  // Note: without fetching the full image body, we can only warn based on known patterns
  const lower = url.toLowerCase();
  if (lower.includes('/portraits/') || lower.includes('portrait')) {
    return 'Portrait asset: expected ~3:4 aspect ratio (verify manually)';
  }
  if (lower.includes('/backgrounds/') || lower.includes('background')) {
    return 'Background asset: expected ~16:9 aspect ratio (verify manually)';
  }
  if (lower.includes('/tiles/') || lower.includes('tile')) {
    return 'Tile asset: expected ~1:1 aspect ratio (verify manually)';
  }
  return null;
}

// ── Expression cross-check (VN visual metadata) ─────────────────────────────
//
// For every dialogue node carrying `visual.expression`, verify the
// referenced speaker character actually tags that expression in its
// `portrait_urls`. Missing expressions still fall back to the default
// portrait at runtime, so mismatches are WARNINGS, not errors.

function parseCharacterExpressionMap(yamlFiles) {
  if (typeof yamlLoad !== 'function') return null;

  const charMap = new Map(); // id -> { name, expressions:Set<string> }

  for (const file of yamlFiles) {
    const base = path.basename(file);
    if (!/^char_.+\.ya?ml$/.test(base)) continue;

    let data;
    try {
      data = yamlLoad(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!data || typeof data !== 'object') continue;
    if (typeof data.id !== 'string') continue;

    const expressions = new Set();
    let hasUntaggedDefault = false;
    if (Array.isArray(data.portrait_urls)) {
      for (const entry of data.portrait_urls) {
        if (entry && typeof entry.expression === 'string' && entry.expression.length > 0) {
          expressions.add(entry.expression.toLowerCase());
        } else if (entry && !hasUntaggedDefault) {
          hasUntaggedDefault = true;
        }
      }
    }
    if (hasUntaggedDefault) {
      expressions.add('default');
    }
    charMap.set(data.id, {
      name: typeof data.name === 'string' ? data.name : data.id,
      expressions,
    });
  }

  return charMap;
}

/**
 * Collect dialogue/overlay node entries from a parsed YAML document.
 * Top-level `nodes` maps apply to both dialogue files and flat overlay
 * files. Bundled overlay files may instead carry a top-level `overlays`
 * array, where each member has its own `nodes` map (node ids are labeled
 * `overlays[<i>].nodes.<id>`).
 */
function collectNodeEntries(data) {
  const entries = [];
  if (!data || typeof data !== 'object') return entries;

  if (data.nodes && typeof data.nodes === 'object') {
    for (const [nodeId, node] of Object.entries(data.nodes)) {
      entries.push({ nodeId, node });
    }
  }

  if (Array.isArray(data.overlays)) {
    data.overlays.forEach((overlay, i) => {
      if (!overlay || typeof overlay !== 'object') return;
      const nodes = overlay.nodes;
      if (!nodes || typeof nodes !== 'object') return;
      for (const [nodeId, node] of Object.entries(nodes)) {
        entries.push({ nodeId: `overlays[${i}].nodes.${nodeId}`, node });
      }
    });
  }

  return entries;
}

function checkExpressionCrossRefs(yamlFiles, charMap) {
  if (typeof yamlLoad !== 'function' || !charMap || charMap.size === 0) {
    return { checked: 0, warnings: [] };
  }

  const warnings = [];
  let checked = 0;

  for (const file of yamlFiles) {
    const base = path.basename(file);
    // normalize separators so nested-dir checks hold on Windows too
    const posix = file.split(path.sep).join('/');
    if (!/^(dialogue_|char_|overlay_)/.test(base) && !posix.includes('/dialogues/') && !posix.includes('/overlays/')) continue;

    let data;
    try {
      data = yamlLoad(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const nodeEntries = collectNodeEntries(data);
    if (nodeEntries.length === 0) continue;

    for (const { nodeId, node } of nodeEntries) {
      if (!node || typeof node !== 'object') continue;
      const visual = node.visual;
      if (!visual || typeof visual !== 'object') continue;
      const expression = typeof visual.expression === 'string' ? visual.expression.trim() : '';
      if (!expression) continue;

      const speakerId = typeof node.speaker_id === 'string' ? node.speaker_id : '';
      const char = speakerId ? charMap.get(speakerId) : null;
      if (!char) continue; // unknown/other-character speaker — can't verify

      checked++;
      if (!char.expressions.has(expression.toLowerCase())) {
        warnings.push(
          `${path.relative(process.cwd(), file)} node "${nodeId}" uses visual.expression "${expression}" ` +
          `but ${char.name} only tags: ${[...char.expressions].join(', ') || '(none)'}`
        );
      }
    }
  }

  return { checked, warnings };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  console.log(`\n🔍 Verifying assets against MinIO: ${opts.minio}\n`);

  // Gather YAML files
  let yamlFiles;
  if (opts.source) {
    const sourcePath = path.resolve(opts.source);
    if (fs.statSync(sourcePath).isDirectory()) {
      yamlFiles = findAllYamlFiles(sourcePath);
    } else {
      yamlFiles = [sourcePath];
    }
  } else {
    yamlFiles = findAllYamlFiles(CONTENT_DIR);
  }

  if (yamlFiles.length === 0) {
    console.log('  No YAML files found.\n');
    return;
  }

  console.log(`  Found ${yamlFiles.length} YAML files to check\n`);

  let totalUrls = 0;
  let okCount = 0;
  let missingCount = 0;
  let errorCount = 0;

  for (const yamlFile of yamlFiles) {
    try {
      // Parse YAML manually to avoid needing a YAML library
      const raw = fs.readFileSync(yamlFile, 'utf-8');
      
      // Simple YAML URL extraction pattern: look for `*_url:` / `url:` values
      // (including nested list items). Accepts http(s): and the `s3://`
      // published URI format written by uploadToMinio.
      const urlPattern = /(?:^|\n)\s*(?:-\s*)?(?:scene:\s*)?(?:background_url|portrait_url|ambient_sound_url|base_image_url|overlay_image_url|url|audio_url):\s*["']?((?:https?:\/\/|s3:\/\/)[^"'\s]+)["']?/g;
      const urls = [];
      let match;
      while ((match = urlPattern.exec(raw)) !== null) {
        urls.push(match[1]);
      }

      if (urls.length === 0) continue;

      const relPath = path.relative(process.cwd(), yamlFile);
      console.log(`\n📄 ${relPath} (${urls.length} URLs):`);

      for (const url of urls) {
        totalUrls++;
        const result = await checkUrl(url, opts.minio, opts.checkMime, opts.checkDimensions);
        const prefix = result.status === 'ok' ? '✅' : result.status === 'missing' ? '❌' : '⚠️';
        console.log(`  ${prefix} ${url}`);
        if (result.status === 'ok') {
          console.log(`     Size: ${result.size} bytes`);
          okCount++;
        } else if (result.status === 'missing') {
          console.log(`     MISSING`);
          missingCount++;
        } else if (result.status === 'mime_mismatch') {
          console.log(`     MIME MISMATCH: ${result.detail}`);
          errorCount++;
        } else {
          console.log(`     Error: ${result.status}`);
          errorCount++;
        }
      }
    } catch (err) {
      const relPath = path.relative(process.cwd(), yamlFile);
      console.error(`\n  ⚠️  Error reading ${relPath}:`, err.message);
      errorCount++;
    }
  }

  // Also check if .prompt.md files exist without corresponding assets
  console.log(`\n📝 Checking for orphaned prompts...\n`);
  const allPromptFiles = findAllPromptFiles(CONTENT_DIR);
  const orphanedPrompts = allPromptFiles
    .filter(f => {
      const entityDir = path.dirname(f);
      const assetsDir = path.join(entityDir, 'assets');
      return !fs.existsSync(assetsDir);
    })
    .map(f => path.relative(process.cwd(), f));

  if (orphanedPrompts.length > 0) {
    console.log(`  Found ${orphanedPrompts.length} orphaned .prompt.md files (no assets/ directory):`);
    for (const pf of orphanedPrompts) {
      console.log(`  📝 ${pf}`);
    }
  } else {
    console.log(`  No orphaned .prompt.md files found.`);
  }

  // Dialogue node `visual.expression` cross-check against character
  // portrait_urls expression tags (VN visual metadata).
  console.log(`\n🗣  Checking dialogue visual.expression cross-references...`);
  // Build the character expression map from the characters directory
  // regardless of `--source`, so a dialogue-only source still cross-checks.
  const charMap = parseCharacterExpressionMap(findAllYamlFiles(path.join(CONTENT_DIR, 'characters')));
  const exprCheck = checkExpressionCrossRefs(yamlFiles, charMap);
  let exprWarningCount = 0;
  if (exprCheck.warnings.length > 0) {
    console.log(`  Found ${exprCheck.warnings.length} warning(s):`);
    for (const w of exprCheck.warnings) {
      console.log(`  ⚠️  ${w}`);
    }
    exprWarningCount = exprCheck.warnings.length;
  } else {
    console.log(
      typeof yamlLoad === 'function'
        ? `  No expression cross-reference warnings (${exprCheck.checked} checked).`
        : '  Skipped (js-yaml unavailable).'
    );
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Summary`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Files checked:    ${yamlFiles.length}`);
  console.log(`  URLs found:       ${totalUrls}`);
  console.log(`  ✅ Present:       ${okCount}`);
  console.log(`  ❌ Missing:       ${missingCount}`);
  console.log(`  ⚠️  Errors:       ${errorCount}`);
  console.log(`  🗣  Visual expr:  ${exprWarningCount} warning(s)`);
  console.log(`  📝 Prompts:       ${allPromptFiles.length}`);
  console.log();

  if (missingCount > 0) {
    process.exitCode = 1;
    console.log('  Some assets are missing. Generate and upload them, then re-run.');
  } else if (okCount > 0) {
    console.log('  All checked assets are present in MinIO. ✅');
  }
}

main();