/**
 * CSS Color Literal Guard
 * Exits 1 if any admin/src or client/src CSS file contains a hex color
 * literal (#hex) or rgba() outside the @las-flores/ui allowlist.
 *
 * Usage: node scripts/check-css-color-literals.mjs
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const ALLOWLIST = ['ui/src/styles', 'node_modules'];
const HEX_RE = /(?:^|[^\w-])(#[0-9a-fA-F]{3,8})\b/;
const RGBA_RE = /\brgba\(/;

function isAllowed(filePath) {
  return ALLOWLIST.some(prefix => filePath.includes(prefix));
}

let exitCode = 0;

for (const dir of ['admin/src', 'client/src']) {
  try {
    const result = execSync(`find ${dir} -name '*.css' 2>/dev/null || true`, {
      encoding: 'utf8',
    });
    const files = result.trim().split('\n').filter(Boolean);

    for (const file of files) {
      if (isAllowed(file)) continue;
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hexMatch = line.match(HEX_RE);
        const rgbaMatch = line.match(RGBA_RE);
        if (hexMatch || rgbaMatch) {
          const match = hexMatch ? hexMatch[1] : 'rgba(...)';
          console.log(`${file}:${i + 1}: ${match}`);
          exitCode = 1;
        }
      }
    }
  } catch {
    // dir may not exist
  }
}

if (exitCode === 0) {
  console.log('✓ No color literals found in app CSS');
} else {
  console.error('\n✗ Color literals found in app CSS. Use CSS custom properties from @las-flores/ui instead.');
}
process.exit(exitCode);
