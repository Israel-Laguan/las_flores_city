#!/usr/bin/env node

/**
 * cleanup-duplicate-text.mjs
 *
 * Fixes duplicated suffix in Draft prompts caused by the fix-vst-prompts.mjs
 * regex appending instead of replacing.
 */

import fs from 'node:fs';
import path from 'node:path';

const FIGURES_DIR = path.resolve('docs/lore/figures');
const DRY_RUN = !process.argv.includes('--apply');

function main() {
  const files = fs.readdirSync(FIGURES_DIR)
    .filter(f => f.endsWith('.prompt.md'))
    .sort();

  let fixed = 0;

  for (const file of files) {
    const filePath = path.join(FIGURES_DIR, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;

    // Fix Draft prompt: detect the repeated block pattern
    // The draft line ends with "...512×768." then has duplicated content
    // We look for the pattern: content + "  Photorealistic" + same content again
    // using a simple approach: find all occurrences of the Photorealistic tag
    // and remove everything between the first complete prompt end and the duplicate

    // Strategy: For each line, if it contains "Photorealistic portrait" twice,
    // extract the first complete prompt and discard the duplicate.
    const lines = content.split('\n');
    const fixedLines = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Count occurrences of the Photorealistic tag in this line
      const photoCount = (line.match(/Photorealistic portrait/g) || []).length;

      if (photoCount >= 2) {
        // Split on the SECOND occurrence of "Photorealistic portrait"
        // and keep only the first part + technical specs from first occurrence
        const firstIdx = line.indexOf('Photorealistic portrait');
        const secondIdx = line.indexOf('Photorealistic portrait', firstIdx + 1);

        // Find the first "512×768." after the first Photorealistic
        const specEnd1 = line.indexOf('512', firstIdx);
        const endOfFirst = line.indexOf('.', specEnd1 + 4) + 1;

        // Keep everything up to the end of the first complete prompt
        line = line.substring(0, endOfFirst);
      }

      // Also fix lines with double "calm and determined." in the Full prompt section
      if (line.trim() === 'calm and determined.') {
        // Check if next lines form a duplicate block
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === 'calm and determined.') {
          j++;
        }
        if (j > i + 1) {
          // Skip duplicate calm-and-determined lines (keep only first)
          // But we need to also skip the duplicated content between them
          // Just keep the first one and skip until we hit a different content line
          i++; // skip the duplicate
          while (i < lines.length && (lines[i].trim() === 'calm and determined.' || lines[i].startsWith('Dressed in practical') || lines[i].startsWith('Background:') === false)) {
            if (lines[i].startsWith('Background:') || lines[i].startsWith('Lighting:') || lines[i].startsWith('Photorealistic') || lines[i].trim() === '' || lines[i].startsWith('#') || lines[i].startsWith('[')) {
              break;
            }
            i++;
          }
        }
      }

      fixedLines.push(line);
    }

    content = fixedLines.join('\n');

    if (content !== original) {
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, content, 'utf-8');
      }
      fixed++;
      if (process.argv.includes('--verbose')) {
        console.log(`  Fixed: ${file}`);
      }
    }
  }

  console.log(`\n📊 Cleanup Summary:`);
  console.log(`  Files with duplicated text fixed: ${fixed}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (use --apply to write)' : 'APPLIED'}`);
}

main();
