#!/usr/bin/env node

/**
 * generate-nim-drafts.mjs
 *
 * DEPRECATED — use generate-drafts-unified.mjs instead.
 * This script is kept for backward compatibility with generate-drafts.sh
 * and any external tooling that references it.
 *
 * Delegates to the unified generator with NIM-only mode (no Pollinations).
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const unified = path.join(__dirname, 'generate-drafts-unified.mjs');

const args = process.argv.slice(2).join(' ');

console.log(`⚠️  generate-nim-drafts.mjs is deprecated — delegating to generate-drafts-unified.mjs\n`);

try {
  execSync(`node "${unified}" ${args}`, { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status || 1);
}
