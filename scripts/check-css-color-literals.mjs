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

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

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
const RGBA_RE = /\brgba\(/;

let exitCode = 0;
let totalFiles = 0;

for (const dir of ['admin/src', 'client/src']) {
  try {
    const result = execSync(`find ${dir} -name '*.css' 2>/dev/null || true`, {
      encoding: 'utf8',
    });
    const files = result.trim().split('\n').filter(Boolean);

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
        if (file.startsWith('admin/')) {
          const rgbaMatch = line.match(RGBA_RE);
          if (rgbaMatch) {
            if (ALLOWLIST_RGBA_PATTERNS.some(pat => pat.test(line))) continue;
            console.log(`  ${file}:${i + 1}: rgba(...)`);
            exitCode = 1;
          }
        }
      }
    }
  } catch {
    // dir may not exist (e.g. in CI)
  }
}

if (exitCode === 0) {
  console.log(`✓ No disallowed color literals found in ${totalFiles} app CSS files`);
} else {
  console.error(`\n✗ Disallowed color literals found. Use CSS custom properties from @las-flores/ui instead.`);
}
process.exit(exitCode);
