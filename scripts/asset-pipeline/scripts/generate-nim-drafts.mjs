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

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const unified = path.join(__dirname, 'generate-drafts-unified.mjs');

const args = process.argv.slice(2);

console.log(`⚠️  generate-nim-drafts.mjs is deprecated — delegating to generate-drafts-unified.mjs\n`);

const result = spawnSync('node', [unified, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
