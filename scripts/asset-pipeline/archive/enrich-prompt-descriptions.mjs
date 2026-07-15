#!/usr/bin/env node

/**
 * enrich-prompt-descriptions.mjs
 *
 * Replaces generic "calm and determined" mood and "Dressed in practical clothing..."
 * placeholders in all 128 portrait prompt files with character-specific details
 * extracted from the corresponding lore .md files.
 *
 * Also cleans up abstract "Build:" lines that contain non-visual concepts
 * (Color Palette, Symbol, Shape, Texture) which shouldn't appear in portrait prompts.
 *
 * Usage:
 *   node enrich-prompt-descriptions.mjs                  # dry run
 *   node enrich-prompt-descriptions.mjs --apply          # write changes
 *   node enrich-prompt-descriptions.mjs --apply --verbose # write + log each file
 */

import fs from 'node:fs';
import path from 'node:path';

const FIGURES_DIR = path.resolve('docs/lore/figures');
const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// ── Clothing Extraction ─────────────────────────────────────────────────────

function extractClothing(loreContent, roleName) {
  // Strategy 1: Look for "Style:" in Physical Description section
  const styleMatch = loreContent.match(/[-*]\s*\*\*Style:\*\*\s*(.+)/i);
  if (styleMatch) {
    const raw = styleMatch[1].trim();
    const cleaned = cleanAbstractTraits(raw);
    if (cleaned && looksLikeClothing(cleaned)) return cleaned;
  }

  // Strategy 2: Look for explicit wardrobe/clothing sentences in Appearance sections
  const appearanceSections = ['Appearance', 'Physical Appearance', 'Physical Description', 'Overview'];
  for (const section of appearanceSections) {
    const sectionText = extractSection(loreContent, section);
    if (!sectionText) continue;

    // Look for sentences mentioning specific clothing items (with word boundaries)
    const clothingPatterns = [
      /\b(?:wears?|dressed? in|usually (?:wears?|has on)|typically (?:wears?|dressed))\s+([^.!?\n]{10,120})[.!?]/gi,
      /\b(?:jeans|hoodie|sneakers|boots|jacket|shirt|pants|suit|uniform|dress|skirt|blouse|coat|cap|sweater|cardigan|vest|apron|guayabera|blazer|overalls)\b[^.!?]{0,80}[.!?]/gi,
    ];

    for (const pat of clothingPatterns) {
      const match = pat.exec(sectionText);
      if (match) {
        const raw = match[0].trim();
        const cleaned = cleanAbstractTraits(raw);
        if (cleaned && cleaned.length > 15 && looksLikeClothing(cleaned)) return cleaned;
      }
    }
  }

  // Strategy 3: Look for "Style:" field in lore file's Build section (abstract traits)
  const buildStyleMatch = loreContent.match(/\*\*Style:\*\*\s*(.+?)(?:\n|$)/i);
  if (buildStyleMatch) {
    const raw = buildStyleMatch[1].trim();
    const cleaned = cleanAbstractTraits(raw);
    if (cleaned && cleaned.length > 10 && looksLikeClothing(cleaned)) return cleaned;
  }

  return null;
}

function looksLikeClothing(text) {
  // Reject text that's clearly not about clothing
  const rejectPatterns = [
    /\b(?:lithium|vein|investigation|discovered|controls|illegal|activity| relationship|transactional|ambitions|resistance|integrity|heritage|perceived|class|authority|age|flash of flair)\b/i,
    /\bhat\b/i,  // "hat" as standalone is suspicious — usually means "that" in context
  ];
  for (const pat of rejectPatterns) {
    if (pat.test(text)) return false;
  }
  return true;
}

function cleanAbstractTraits(text) {
  // Remove abstract/non-visual concepts that shouldn't be in a portrait prompt
  // Only strip these when they appear as standalone labels (e.g., "Shape:" or "Symbol:")
  const abstractPatterns = [
    /(?:Shape|Color Palette|Texture|Symbol|Visual Metaphors?):\s*[^.]*\.?\s*/gi,
    /#\([0-9A-Fa-f]{6}\)/g,  // hex color codes
    /(?:circular|flowing|geometric|interconnected|straight lines|precise angles|square|solid forms)/gi,
    /(?:circuit|spark|tools|spreadsheet|blueprint|scale|shield|anchor|foundation)/gi,
    /(?:like electricity|precision|practical use|analysis|books,? care)/gi,
    /--\s*\./g,  // trailing "--."
  ];

  let cleaned = text;
  for (const pat of abstractPatterns) {
    cleaned = cleaned.replace(pat, '');
  }

  // Clean up multiple spaces and trailing punctuation
  cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.').trim();
  cleaned = cleaned.replace(/[,;]\s*$/, '').trim();

  // If what's left is too short or just abstract leftovers, return null
  if (cleaned.length < 5) return null;

  return cleaned;
}

function extractSection(content, sectionName) {
  const regex = new RegExp(`(?:##|###)\\s+${escapeRegex(sectionName)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n###\\s|$)`);
  const m = content.match(regex);
  return m ? m[1].trim() : null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Mood/Expression Extraction ──────────────────────────────────────────────

function extractMood(loreContent, name) {
  // Strategy 1: Look for "Expression:" in Physical Description
  const exprMatch = loreContent.match(/[-*]\s*\*\*Expression:\*\*\s*(.+)/i);
  if (exprMatch) {
    const raw = exprMatch[1].trim();
    const cleaned = cleanAbstractTraits(raw);
    // Ensure we don't return truncated text (cut off mid-word)
    if (cleaned && cleaned.length > 5 && !cleaned.match(/\w\s$/)) return cleaned;
  }

  // Strategy 2: Look for "Presence:" in Physical Description
  const presenceMatch = loreContent.match(/[-*]\s*\*\*Presence:\*\*\s*(.+)/i);
  if (presenceMatch) {
    const raw = presenceMatch[1].trim();
    const cleaned = cleanAbstractTraits(raw);
    if (cleaned && cleaned.length > 5 && !cleaned.match(/\w\s$/)) return cleaned;
  }

  // Strategy 3: Look for mood/personality adjectives in Overview or Personality sections
  const overviewSection = extractSection(loreContent, 'Overview') || '';
  const personalitySection = extractSection(loreContent, 'Personality') ||
    extractSection(loreContent, 'Core Characteristics') || '';

  const combinedText = overviewSection + ' ' + personalitySection;

  // Look for personality adjectives that translate to visual expression
  const moodPatterns = [
    /(?:warm|friendly|kind|approachable|gentle|caring|nurturing)/i,
    /(?:stern|serious|focused|intense|determined|driven)/i,
    /(?:calm|composed|patient|steady|grounded)/i,
    /(?:energetic|lively|animated|passionate|fiery)/i,
    /(?:quiet|reserved|introspective|thoughtful|pensive)/i,
    /(?:confident|bold|assertive|strong|commanding)/i,
    /(?:tired|weary|exhausted|worn|weathered)/i,
    /(?:suspicious|guarded|wary|cautious|defensive)/i,
    /(?:cheerful|optimistic|hopeful|bright|sunny)/i,
    /(?:melancholy|sad|somber|grieving|loss)/i,
  ];

  const foundMoods = [];
  for (const pat of moodPatterns) {
    const m = combinedText.match(pat);
    if (m) foundMoods.push(m[0]);
  }

  if (foundMoods.length > 0) {
    return foundMoods.slice(0, 2).join(' and ');
  }

  return null;
}

// ── Prompt File Processing ──────────────────────────────────────────────────

function processPromptFile(promptContent, loreContent, name) {
  let updated = promptContent;
  let changes = [];

  // 1. Extract character-specific clothing
  const clothing = extractClothing(loreContent, name);

  if (clothing) {
    // Replace the generic clothing line in Full prompt
    const clothingRe = /Dressed in practical clothing suited to their environment, with personal items reflecting their role\./;
    if (clothingRe.test(updated)) {
      updated = updated.replace(clothingRe, clothing.endsWith('.') ? clothing : clothing + '.');
      changes.push(`clothing: "${clothing.substring(0, 50)}..."`);
    }

    // Also update Draft prompt clothing reference
    const draftClothingRe = /practical clothing suited to their environment, personal items reflecting their role/;
    if (draftClothingRe.test(updated)) {
      updated = updated.replace(draftClothingRe, clothing);
    }
  }

  // 2. Extract character-specific mood
  const mood = extractMood(loreContent, name);

  if (mood) {
    // Replace "calm and determined." in Full prompt
    const moodRe = /\ncalm and determined\.\n/;
    if (moodRe.test(updated)) {
      updated = updated.replace(moodRe, `\n${mood}.\n`);
      changes.push(`mood: "${mood}"`);
    }

    // Also update Draft prompt mood
    const draftMoodRe = /\. calm and determined\./;
    if (draftMoodRe.test(updated)) {
      updated = updated.replace(draftMoodRe, `. ${mood}.`);
    }
  }

  // 3. Clean up abstract "Build:" lines in Full prompt
  // These lines contain Color Palette, Symbol, Shape, Texture which are not visual
  const buildLineRe = /Build:\s*.+?--\.\n/g;
  if (buildLineRe.test(updated)) {
    updated = updated.replace(buildLineRe, '');
    changes.push('removed abstract Build line');
  }

  // 4. Clean up stray "atmospheric." lines (duplicate of Lighting line)
  const strayAtmoRe = /\natmospheric\. \n/;
  if (strayAtmoRe.test(updated)) {
    updated = updated.replace(strayAtmoRe, '\n');
    changes.push('removed stray atmospheric line');
  }

  return { updated, changes };
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const files = fs.readdirSync(FIGURES_DIR)
    .filter(f => f.endsWith('.prompt.md'))
    .sort();

  let modified = 0;
  let skipped = 0;
  let noLore = 0;
  let noClothing = 0;
  let noMood = 0;
  const results = [];

  for (const file of files) {
    const promptPath = path.join(FIGURES_DIR, file);
    const promptContent = fs.readFileSync(promptPath, 'utf-8');

    const slug = file.replace('.prompt.md', '');
    const lorePath = path.join(FIGURES_DIR, `${slug}.md`);

    if (!fs.existsSync(lorePath)) {
      noLore++;
      if (VERBOSE) console.log(`  ⚠️  No lore file: ${slug}.md`);
      continue;
    }

    const loreContent = fs.readFileSync(lorePath, 'utf-8');
    const name = promptContent.match(/# Prompt: (.+?) \(/)?.[1] || slug;

    const { updated, changes } = processPromptFile(promptContent, loreContent, name);

    if (updated !== promptContent) {
      if (!DRY_RUN) {
        fs.writeFileSync(promptPath, updated, 'utf-8');
      }
      modified++;
      results.push({ name, changes });
      if (VERBOSE) console.log(`  ✏️  ${name}: ${changes.join(', ')}`);
    } else {
      skipped++;
      if (VERBOSE) console.log(`  ⏭️  ${name}: no changes`);
    }
  }

  console.log(`\n📊 Enrich Prompt Descriptions Summary:`);
  console.log(`  Total prompt files: ${files.length}`);
  console.log(`  Modified: ${modified}`);
  console.log(`  Skipped (no changes): ${skipped}`);
  console.log(`  No lore file: ${noLore}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (use --apply to write)' : 'APPLIED'}`);

  if (results.length > 0) {
    console.log(`\n📋 Modified characters:`);
    for (const r of results) {
      console.log(`  - ${r.name}: ${r.changes.join('; ')}`);
    }
  }
}

main();
