#!/usr/bin/env node

/**
 * fix-prompt-placeholders.mjs
 *
 * Directly replaces the two generic placeholder lines in the Full Prompt section
 * of all portrait .prompt.md files. Uses simple string matching against the exact
 * format found in these files.
 *
 * Usage:
 *   node fix-prompt-placeholders.mjs                  # dry run
 *   node fix-prompt-placeholders.mjs --apply          # write changes
 *   node fix-prompt-placeholders.mjs --apply --verbose
 */

import fs from 'node:fs';
import path from 'node:path';

const FIGURES_DIR = path.resolve('docs/lore/figures');
const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

function extractSection(content, sectionName) {
  const regex = new RegExp(`(?:##|###)\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n###\\s|$)`);
  const m = content.match(regex);
  return m ? m[1].trim() : null;
}

function extractClothing(lore) {
  // Strategy 1: Style field
  const styleMatch = lore.match(/[-*]\s*\*\*Style:\*\*\s*(.+)/i);
  if (styleMatch) {
    const raw = styleMatch[1].trim();
    if (raw.length > 5 && !/Color Palette|Symbol|Shape|Texture|Visual Metaphor/i.test(raw)) {
      return raw;
    }
  }

  // Strategy 2: "wears" / "dressed in" sentences anywhere in the file
  const wearPatterns = [
    /\bwears?\s+[^.!?\n]{10,120}[.!?]/gi,
    /\bdressed?\s+in\s+[^.!?\n]{10,120}[.!?]/gi,
  ];

  for (const pat of wearPatterns) {
    const m = pat.exec(lore);
    if (m) {
      const sentence = m[0].trim();
      if (!/lithium|investigation|discovered|controls|illegal|relationship|ambitions|integrity|heritage/i.test(sentence)) {
        return sentence;
      }
    }
  }

  // Strategy 3: Look for clothing items in Physical Description / Appearance sections
  const clothingWords = 'jeans|hoodie|sneakers|boots|jacket|shirt|pants|suit|uniform|dress|skirt|blouse|coat|cap|sweater|cardigan|vest|apron|guayabera|blazer';
  for (const sec of ['Physical Appearance', 'Appearance', 'Physical Description', 'Overview']) {
    const text = extractSection(lore, sec);
    if (!text) continue;
    const sentences = text.split(/[.!?]+/);
    for (const s of sentences) {
      if (new RegExp('\\b(?:' + clothingWords + ')\\b', 'i').test(s) && s.trim().length > 15) {
        return s.trim() + '.';
      }
    }
  }

  return null;
}

function extractMood(lore) {
  // Strategy 1: Expression field
  const expr = lore.match(/[-*]\s*\*\*Expression:\*\*\s*(.+)/i);
  if (expr) {
    const raw = expr[1].trim();
    if (raw.length > 3) return raw;
  }
  // Strategy 2: Presence field
  const pres = lore.match(/[-*]\s*\*\*Presence:\*\*\s*(.+)/i);
  if (pres) {
    const raw = pres[1].trim();
    if (raw.length > 3) return raw;
  }
  // Strategy 3: Personality adjectives from Overview or first paragraph
  const moodWords = [
    'warm', 'friendly', 'kind', 'approachable', 'gentle', 'caring',
    'stern', 'serious', 'focused', 'intense', 'determined', 'driven',
    'calm', 'composed', 'patient', 'steady', 'grounded',
    'energetic', 'lively', 'passionate', 'fiery',
    'quiet', 'reserved', 'thoughtful', 'pensive',
    'confident', 'bold', 'assertive', 'strong', 'commanding',
    'tired', 'weary', 'weathered',
    'suspicious', 'guarded', 'cautious',
    'cheerful', 'optimistic', 'hopeful',
    'melancholy', 'somber', 'grieving',
    'resourceful', 'fiercely independent', 'competitive',
    'charismatic', 'smooth-talking', 'manipulative',
    'direct', 'honest', 'straightforward',
    'protective', 'loyal', 'brave',
  ];

  // Get first 500 chars of lore for quick scan
  const preview = lore.substring(0, 1000);
  const found = moodWords.filter(w => new RegExp('\\b' + w + '\\b', 'i').test(preview));

  if (found.length >= 2) return found[0] + ' and ' + found[1];
  if (found.length === 1) return found[0];
  return null;
}

function processFile(promptPath, lorePath) {
  const prompt = fs.readFileSync(promptPath, 'utf-8');
  const lore = fs.existsSync(lorePath) ? fs.readFileSync(lorePath, 'utf-8') : '';
  const name = prompt.match(/# Prompt: (.+?) \(/)?.[1] || path.basename(promptPath, '.prompt.md');

  let updated = prompt;
  let changes = [];

  // 1. Replace mood line in Full Prompt section
  //    The exact format is: "calm and determined.\n"
  const mood = extractMood(lore);
  if (mood && updated.includes('calm and determined.\n')) {
    updated = updated.replace('calm and determined.\n', mood + '.\n');
    changes.push(`mood: ${mood}`);
  }

  // 2. Replace clothing line in Full Prompt section
  //    The exact format is: "Dressed in practical clothing suited to their environment, with personal items reflecting their role.\n"
  const clothing = extractClothing(lore);
  const clothingTarget = 'Dressed in practical clothing suited to their environment, with personal items reflecting their role.';
  if (clothing && updated.includes(clothingTarget)) {
    updated = updated.replace(clothingTarget, clothing);
    changes.push(`clothing: ${clothing.substring(0, 60)}`);
  }

  // 3. Also replace in Draft prompt section
  if (mood) {
    updated = updated.replace(/\. calm and determined\./, '. ' + mood + '.');
  }
  if (clothing) {
    updated = updated.replace(/practical clothing suited to their environment, personal items reflecting their role/, clothing);
  }

  // 4. Clean stray "-- " prefix on asymmetry lines
  updated = updated.replace(/\n-- ([A-Z])/g, '\n$1');

  // 5. Remove stray "atmospheric. \n" lines (bare atmospheric followed by newline)
  updated = updated.replace(/\natmospheric\. \n/g, '\n');

  // 6. Remove abstract Build: lines with Color Palette or Symbol
  updated = updated.replace(/^Build:.*(?:Color Palette|Symbol|Shape:|Texture:).*--\.\n?/gm, '');

  return { updated, changes };
}

// ── Main ────────────────────────────────────────────────────────────────────

const files = fs.readdirSync(FIGURES_DIR).filter(f => f.endsWith('.prompt.md')).sort();
let modified = 0, skipped = 0;
const results = [];

for (const file of files) {
  const promptPath = path.join(FIGURES_DIR, file);
  const slug = file.replace('.prompt.md', '');
  const lorePath = path.join(FIGURES_DIR, `${slug}.md`);

  const { updated, changes } = processFile(promptPath, lorePath);

  if (updated !== fs.readFileSync(promptPath, 'utf-8')) {
    if (!DRY_RUN) fs.writeFileSync(promptPath, updated, 'utf-8');
    modified++;
    results.push({ name: slug, changes });
    if (VERBOSE) console.log(`  ${slug}: ${changes.join('; ') || 'cleanup'}`);
  } else {
    skipped++;
  }
}

console.log(`\nDone: ${modified} modified, ${skipped} unchanged, ${files.length} total`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLIED'}`);

if (results.length > 0 && VERBOSE) {
  console.log(`\nModified files:`);
  for (const r of results) console.log(`  ${r.name}: ${r.changes.join('; ') || 'cleanup only'}`);
}
