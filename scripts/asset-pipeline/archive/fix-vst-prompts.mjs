#!/usr/bin/env node

/**
 * fix-vst-prompts.mjs
 *
 * Batch-fixes all character portrait .prompt.md files to replace
 * generic "young adult" placeholders with actual age/biometric data
 * extracted from the corresponding lore .md files.
 *
 * Usage:
 *   node fix-vst-prompts.mjs                    # dry run
 *   node fix-vst-prompts.mjs --apply             # write changes
 *   node fix-vst-prompts.mjs --apply --verbose    # write + log each file
 */

import fs from 'node:fs';
import path from 'node:path';

const FIGURES_DIR = path.resolve('docs/lore/figures');
const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// ── Age Extraction ──────────────────────────────────────────────────────────

function extractAge(content, name) {
  // Pattern 1: **Age (2077):** ~80s
  let m = content.match(/\*\*Age\s*\(2077\):\*\*\s*~?(\d+)/);
  if (m) return m[1];

  // Pattern 2: **Age:** 49
  m = content.match(/\*\*Age:\*\*\s*~?(\d+)/);
  if (m) return m[1];

  // Pattern 3: **Age:** ~25 (2000), ~51 (2026), ..., ~102 (2077)
  m = content.match(/\*\*Age:\*\*.*?~(\d+)\s*\(2077\)/);
  if (m) return m[1];

  // Pattern 4: **Born:** ~1975 → calculate age in 2077
  m = content.match(/\*\*Born:\*\*\s*~?(\d{4})/);
  if (m) {
    const birthYear = parseInt(m[1]);
    const age2077 = 2077 - birthYear;
    if (age2077 > 0 && age2077 < 150) return String(age2077);
  }

  // Pattern 5: Born in YYYY
  m = content.match(/[Bb]orn\s+in\s+(\d{4})/);
  if (m) {
    const birthYear = parseInt(m[1]);
    const age2077 = 2077 - birthYear;
    if (age2077 > 0 && age2077 < 150) return String(age2077);
  }

  // Pattern 6: "X-year-old" or "age of X" in narrative
  m = content.match(/(\d+)-year-old/);
  if (m) return m[1];

  // Pattern 7: **Age:** ~30s → extract the number
  m = content.match(/\*\*Age:\*\*\s*~?(\d+)s?/);
  if (m) return m[1];

  // Pattern 8: Age in YAML-style: **Age:** 28 in 2025 → calculate to 2077
  m = content.match(/\*\*Age:\*\*\s*(\d+)\s+in\s+(\d{4})/);
  if (m) {
    const ageAtYear = parseInt(m[1]);
    const refYear = parseInt(m[2]);
    const age2077 = ageAtYear + (2077 - refYear);
    if (age2077 > 0 && age2077 < 150) return String(age2077);
  }

  return null;
}

// ── Physical Description Extraction ─────────────────────────────────────────

function extractPhysical(content) {
  // Try multiple section names
  const sectionNames = [
    'Physical Description',
    'Appearance',
    'Physical Appearance',
    'Description (full)',
  ];

  for (const sectionName of sectionNames) {
    const section = extractSection(content, sectionName);
    if (section) {
      // If it's bullet-pointed, join the bullets
      const bullets = section
        .split('\n')
        .filter(l => l.startsWith('-') || l.startsWith('*'))
        .map(l => l.replace(/^[-*]\s*\*{0,2}/, '').replace(/\*{0,2}:\s*/, ': ').replace(/\*{2}/g, '').trim())
        .filter(Boolean);

      if (bullets.length > 0) {
        return bullets.join('. ');
      }

      // If it's prose, return the first ~300 chars
      const prose = section.replace(/\n+/g, ' ').trim();
      if (prose.length > 20) {
        return prose.substring(0, 500);
      }
    }
  }

  // Try inline physical details: "He/She is X, with Y"
  const inlinePatterns = [
    /\*\*Facial Features:\*\*\s*(.+)/,
    /\*\*Hair:\*\*\s*(.+)/,
    /\*\*Eyes:\*\*\s*(.+)/,
    /\*\*Build:\*\*\s*(.+)/,
    /\*\*Height:\*\*\s*(.+)/,
  ];

  const parts = [];
  for (const pat of inlinePatterns) {
    const m = content.match(pat);
    if (m) parts.push(m[1].trim());
  }
  if (parts.length > 0) return parts.join('. ');

  return null;
}

function extractSection(content, sectionName) {
  // Try both ## and ### headings
  const regex = new RegExp(`(?:##|###)\\s+${escapeRegex(sectionName)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n###\\s|$)`);
  const m = content.match(regex);
  return m ? m[1].trim() : null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Role Extraction ─────────────────────────────────────────────────────────

function extractRole(content) {
  // Try **Role:** first
  let m = content.match(/\*\*Role:\*\*\s*(.+?)(?:\n|$)/);
  if (m) {
    let role = m[1].trim();
    // Clean up: take first clause only
    role = role.split(',')[0].split(';')[0].trim();
    return role;
  }

  // Try **Title (short):**
  m = content.match(/\*\*Title\s*\(short\):\*\*\s*(.+?)(?:\n|$)/);
  if (m) return m[1].trim();

  // Try **Occupation:**
  m = content.match(/\*\*Occupation:\*\*\s*(.+?)(?:\n|$)/);
  if (m) return m[1].trim();

  return 'resident';
}

// ── Role → Age Label Mapping ────────────────────────────────────────────────

function ageLabel(ageStr, role) {
  if (!ageStr) return 'young adult';
  const age = parseInt(ageStr);
  if (isNaN(age)) return ageStr;

  if (age >= 90) return `${age}-year-old`;
  if (age >= 70) return `${age}-year-old`;
  if (age >= 50) return `${age}-year-old`;
  if (age >= 35) return `${age}-year-old`;
  if (age >= 25) return `${age}-year-old`;
  return `${age}-year-old`;
}

// ── Asymmetric Feature Injection ────────────────────────────────────────────

const ASYMMETRY_OPTIONS = [
  'A slight asymmetry in his left eyebrow, which sits fractionally lower than the right.',
  'A small scar on his right cheek from a childhood accident.',
  'His nose has a subtle deviation to the left from an old break.',
  'One eye sits slightly higher than the other, giving his face a lopsided intensity.',
  'A faint scar bisecting his left eyebrow.',
  'His smile pulls slightly more to the right side.',
  'A small mole near the left corner of his mouth.',
  'His left ear sits slightly forward of the right.',
  'A subtle scar across the bridge of his nose.',
  'His jawline is subtly uneven, stronger on the right.',
];

const ASYMMETRY_OPTIONS_F = [
  'A slight asymmetry in her left eyebrow, which sits fractionally lower than the right.',
  'A small scar on her right cheek from a childhood accident.',
  'Her nose has a subtle deviation to the left from an old break.',
  'One eye sits slightly higher than the other, giving her face a lopsided intensity.',
  'A faint scar bisecting her left eyebrow.',
  'Her smile pulls slightly more to the right side.',
  'A small mole near the left corner of her mouth.',
  'Her left ear sits slightly forward of the right.',
  'A subtle scar across the bridge of her nose.',
  'Her jawline is subtly uneven, stronger on the right.',
];

function pickAsymmetry(name, content) {
  // Deterministic pick based on name hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }

  const isFemale = /\b(she|her|Ms|Mrs|Councilwoman|Councilmember|journalist|activist|CEO|politician|journalist)\b/i.test(content)
    || /female/i.test(content)
    || name.match(/\b(anna|isabella|camila|lina|xue|sofia|rosa|elena|karla|valentina|mia|lucia|yara|fatima|nadia|maria|mei|daiyu|claire|anneliese|alicia|amina|cecilia|carolina|isadora|nubia|liu_fang)\b/i);

  const pool = isFemale ? ASYMMETRY_OPTIONS_F : ASYMMETRY_OPTIONS;
  return pool[Math.abs(hash) % pool.length];
}

// ── Aging Signs for 40+ Characters ─────────────────────────────────────────

function agingSigns(ageStr) {
  if (!ageStr) return '';
  const age = parseInt(ageStr);
  if (isNaN(age) || age < 40) return '';

  if (age >= 80) {
    return 'Deep wrinkles across forehead and around eyes, pronounced nasolabial folds, age spots on temples and cheeks, thinning skin with visible veins, sagging jowls, gray/white hair.';
  }
  if (age >= 65) {
    return 'Visible crow\'s feet and forehead lines, nasolabial folds deepening, slight skin laxity around jaw, graying hair with possible thinning.';
  }
  if (age >= 50) {
    return 'Fine lines around eyes and forehead, slight crow\'s feet, early nasolabial folds, subtle skin texture changes from years of sun exposure.';
  }
  // 40-49
  return 'Early crow\'s feet at eye corners, faint forehead lines, skin showing first signs of age-related texture change.';
}

// ── Prompt Regeneration ─────────────────────────────────────────────────────

function regeneratePrompt(existingContent, name, age, role, physical, asymmetry, aging) {
  // Determine age label text
  const ageText = age ? ageLabel(age, role) : 'young adult';

  // Build physical description
  let physDesc = physical || '';
  if (asymmetry && physDesc) {
    physDesc = physDesc + ' ' + asymmetry;
  } else if (asymmetry) {
    physDesc = asymmetry;
  }
  if (aging && physDesc) {
    physDesc = physDesc + ' ' + aging;
  } else if (aging) {
    physDesc = aging;
  }
  if (!physDesc) physDesc = 'distinctive appearance fitting their background';

  // Extract the existing lighting/setting from the prompt
  const lightingMatch = existingContent.match(/Lighting:\s*(.+?)(?:\n|$)/);
  const lighting = lightingMatch ? lightingMatch[1].trim() : 'atmospheric, sharp shadows';

  const moodMatch = existingContent.match(/(?:bright warm sunlight|atmospheric|warm golden hour|cinematic|dramatic|dim|soft)[^.]*/i);
  const moodLine = moodMatch ? moodMatch[0] : 'atmospheric';

  // Replace in Draft prompt
  let draftRe = new RegExp(
    `\\[CONSUMER: portrait\\]\\s*${escapeRegex(name)},\\s*young adult\\s+.+?\\.\\s*distinctive appearance fitting their background\\.`,
    'i'
  );
  const draftReplacement = `[CONSUMER: portrait] ${name}, ${ageText} ${role}, Las Flores. ${physDesc}. calm and determined. practical clothing suited to their environment, personal items reflecting their role. Las Flores cityscape. ${moodLine}.  Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. Transparent background, 3:4 aspect ratio, 512×768.`;

  let updated = existingContent.replace(draftRe, draftReplacement);

  // If the above didn't match (different format), try a broader pattern
  if (updated === existingContent) {
    draftRe = new RegExp(
      `\\[CONSUMER: portrait\\]\\s*${escapeRegex(name)},\\s*young adult\\s+[^\n]+`,
      'i'
    );
    updated = updated.replace(draftRe, draftReplacement);
  }

  // Replace in Full prompt - the "Bust portrait of X, a young adult..." line
  const fullRe = new RegExp(
    `(Bust portrait of ${escapeRegex(name)},)\\s*a young adult\\s+.+?from Las Flores(?:'s Las Flores)?\\.`,
    'i'
  );
  const fullReplacement = `$1 a ${ageText} ${role} from Las Flores.`;
  updated = updated.replace(fullRe, fullReplacement);

  // Also fix "distinctive appearance fitting their background" in the full prompt
  updated = updated.replace(/distinctive appearance fitting their background\.\n/g, `${physDesc}.\n`);

  return updated;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const files = fs.readdirSync(FIGURES_DIR)
    .filter(f => f.endsWith('.prompt.md'))
    .sort();

  let fixed = 0;
  let skipped = 0;
  let noAge = 0;
  const results = [];

  for (const file of files) {
    const promptPath = path.join(FIGURES_DIR, file);
    const content = fs.readFileSync(promptPath, 'utf-8');

    // Check if this file has the "young adult" placeholder
    if (!content.includes('young adult')) {
      skipped++;
      continue;
    }

    // Derive lore file path
    const slug = file.replace('.prompt.md', '');
    const lorePath = path.join(FIGURES_DIR, `${slug}.md`);

    if (!fs.existsSync(lorePath)) {
      if (VERBOSE) console.log(`  ⚠️  No lore file: ${slug}.md`);
      noAge++;
      continue;
    }

    const loreContent = fs.readFileSync(lorePath, 'utf-8');
    const name = content.match(/# Prompt: (.+?) \(/)?.[1] || slug;

    const age = extractAge(loreContent, name);
    const role = extractRole(loreContent);
    const physical = extractPhysical(loreContent);
    const asymmetry = pickAsymmetry(name, loreContent);
    const aging = agingSigns(age);

    if (VERBOSE) {
      console.log(`  ${name}: age=${age}, role=${role}, physical=${physical ? 'yes' : 'no'}, asymmetry=yes, aging=${aging ? 'yes' : 'no'}`);
    }

    const updated = regeneratePrompt(content, name, age, role, physical, asymmetry, aging);

    if (updated !== content) {
      if (!DRY_RUN) {
        fs.writeFileSync(promptPath, updated, 'utf-8');
      }
      fixed++;
      results.push({ name, age, role, hasPhysical: !!physical });
    } else {
      if (VERBOSE) console.log(`    (no changes needed for ${name})`);
      skipped++;
    }
  }

  console.log(`\n📊 VST Prompt Fix Summary:`);
  console.log(`  Total prompt files: ${files.length}`);
  console.log(`  Fixed (young adult → real data): ${fixed}`);
  console.log(`  Skipped (already OK): ${skipped}`);
  console.log(`  No lore file found: ${noAge}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (use --apply to write)' : 'APPLIED'}`);

  if (results.length > 0) {
    console.log(`\n📋 Fixed characters:`);
    for (const r of results) {
      console.log(`  - ${r.name}: age=${r.age || '?'}, physical=${r.hasPhysical ? 'from lore' : 'generated'}`);
    }
  }
}

main();
