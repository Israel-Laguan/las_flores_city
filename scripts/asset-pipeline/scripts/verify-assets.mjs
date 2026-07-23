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
 *   node verify-assets.mjs --source content/locations/
 *   node verify-assets.mjs --minio http://localhost:9000
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

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
  node verify-assets.mjs --source content/locations/
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

function extractUrls(obj, results = []) {
  if (!obj || typeof obj !== 'object') return results;

  if (Array.isArray(obj)) {
    for (const item of obj) extractUrls(item, results);
    return results;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'url' && typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
      results.push(value);
    } else if (key.endsWith('_url') && typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
      results.push(value);
    } else if (typeof value === 'object' && value !== null) {
      extractUrls(value, results);
    }
  }

  return results;
}

function checkUrl(url, minioBase, checkMime, checkDimensions) {
  return new Promise((resolve) => {
    // If it's already a full MinIO URL, check it directly
    // Otherwise, assume it's a relative MinIO path
    const targetUrl = url.startsWith('http') ? url : `${minioBase}/${url.replace(/^\//, '')}`;

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
      
      // Simple YAML URL extraction pattern: look for *_url: "http..." (including nested list items)
      const urlPattern = /(?:^|\n)\s*(?:-\s*)?(?:scene:\s*)?(?:background_url|portrait_url|ambient_sound_url|base_image_url|overlay_image_url|url|audio_url):\s*["']?(https?:\/\/[^"'\s]+)["']?/g;
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

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Summary`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Files checked:    ${yamlFiles.length}`);
  console.log(`  URLs found:       ${totalUrls}`);
  console.log(`  ✅ Present:       ${okCount}`);
  console.log(`  ❌ Missing:       ${missingCount}`);
  console.log(`  ⚠️  Errors:       ${errorCount}`);
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