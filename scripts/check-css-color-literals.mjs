/**
 * CSS Color Literal Guard
 * Exits 1 if any admin/src or client/src CSS file contains a hex color
 * literal (#hex) or disallowed rgba() outside the @las-flores/ui allowlist.
 *
 * Rules:
 * 1. Hex literals (#hex) are forbidden in ALL app CSS files (except allowlisted).
 * 2. rgba() literals are forbidden in admin/src (except decorative shadows).
 * 3. rgba() in client/src are allowed (decorative neon effects, shadows).
 *
 * Usage: node scripts/check-css-color-literals.mjs
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const ALLOWLIST_PREFIXES = ['ui/src/styles', 'node_modules'];

// Files that are intentionally allowed to contain color literals:
// - glitch.css: CRT scanline overlay effects (static decorative)
// - phone.css: :root --neon-* variable definitions (theme system)
const ALLOWLIST_FILES = [
  'client/src/styles/glitch.css',
  'client/src/styles/phone.css',
];

// Allowlisted rgba patterns in admin CSS (decorative shadows only):
// - AdminShell.module.css: backdrop overlay
// - Sidebar.module.css: mobile drawer shadow
const ALLOWLIST_RGBA_PATTERNS = [
  /rgba\(0,\s*0,\s*0,\s*0\.6\)/,  // AdminShell backdrop
  /rgba\(0,\s*0,\s*0,\s*0\.5\)/,  // Sidebar mobile shadow
];

const HEX_RE = /(?:^|[^\w-])(#[0-9a-fA-F]{3,8})\b/;
const RGBA_RE = /rgba\(/g;

let exitCode = 0;
let totalFiles = 0;

for (const dir of ['admin/src', 'client/src']) {
  const fullDir = resolve(ROOT, dir);
  let findResult;
  try {
    findResult = execFileSync('find', [fullDir, '-name', '*.css'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // dir may not exist (e.g. in CI without content checkout)
    if (existsSync(fullDir)) {
      // Directory exists but find failed
      console.error(`  ERROR: Failed to scan ${fullDir}`);
      exitCode = 1;
    }
    // Directory does not exist — skip
    continue;
  }
  const files = findResult.trim().split('\n').filter(Boolean);

  for (const file of files) {
    if (ALLOWLIST_PREFIXES.some(p => file.includes(p))) continue;
    if (ALLOWLIST_FILES.some(f => file.endsWith(f))) continue;

    totalFiles++;
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check hex — forbidden everywhere in app CSS
      const hexMatch = line.match(HEX_RE);
      if (hexMatch) {
        console.log(`  ${file}:${i + 1}: HEX ${hexMatch[1]}`);
        exitCode = 1;
      }

      // Check rgba — forbidden in admin/src (except allowlisted shadows)
      // Validate each rgba() occurrence independently
      if (file.includes('/admin/')) {
        let rgbaMatch;
        RGBA_RE.lastIndex = 0;
        while ((rgbaMatch = RGBA_RE.exec(line)) !== null) {
          const rgbaValue = line.slice(rgbaMatch.index, line.indexOf(')', rgbaMatch.index) + 1);
          if (!ALLOWLIST_RGBA_PATTERNS.some(pat => pat.test(rgbaValue))) {
            console.log(`  ${file}:${i + 1}: rgba(...)`);
            exitCode = 1;
          }
        }
      }
    }
  }
}

if (exitCode === 0) {
  console.log(`✓ No disallowed color literals found in ${totalFiles} app CSS files`);
} else {
  console.error(`\n✗ Disallowed color literals found. Use CSS custom properties from @las-flores/ui instead.`);
}
process.exit(exitCode);
