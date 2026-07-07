#!/usr/bin/env node

/**
 * extract-biometrics.mjs
 *
 * Reads all character portrait .prompt.md files and extracts biometric
 * descriptors (face shape, jaw, nose, eyes, build, skin, hair, age, ethnicity)
 * into a structured JSON report for LLM verification.
 *
 * Usage:
 *   node extract-biometrics.mjs > biometrics-report.json
 *   node extract-biometrics.mjs --check-duplicates
 */

import fs from 'node:fs';
import path from 'node:path';

const FIGURES_DIR = path.resolve('docs/lore/figures');

// Biometric keywords to search for in prompts
const FACE_SHAPES = ['square', 'round', 'heart', 'oval', 'angular', 'long'];
const JAW_TYPES = ['strong', 'soft', 'receding', 'prominent', 'asymmetric', 'defined', 'sharp', 'pointed'];
const CHEEKBONES = ['high', 'low', 'pronounced', 'subtle'];
const NOSE_TYPES = ['straight', 'curved', 'wide', 'narrow', 'pointed', 'flat bridge', 'prominent'];
const EYE_TYPES = ['almond', 'round', 'hooded', 'wide-set', 'narrow', 'deep-set'];
const BROW_TYPES = ['thick', 'thin', 'arched', 'flat', 'asymmetric'];
const LIP_TYPES = ['thin', 'full', 'wide', 'narrow', 'asymmetrical'];
const BUILD_TYPES = ['broad-heavy', 'lean-wiry', 'soft-rounded', 'athletic-compact', 'tall-skinny', 'stocky',
  'athletic', 'lean', 'slender', 'petite', 'heavy', 'muscular', 'wiry', 'compact', 'robust'];
const SKIN_TYPES = ['weathered', 'smooth', 'freckled', 'scarred', 'sun-damaged', 'clear'];
const HAIR_TYPES = ['curly', 'straight', 'wavy', 'coily', 'thin', 'thick'];

function extractField(text, keywords) {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

function extractAge(text) {
  const match = text.match(/(\d+)[-\s]year[-\s]old/i);
  return match ? parseInt(match[1]) : null;
}

function extractEthnicity(text) {
  const lower = text.toLowerCase();
  // Look for common heritage patterns
  const patterns = [
    /(?:descent|heritage|ancestry|ethnicity)[^.]*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s*\([^)]+\))?)/i,
    /(?:of|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s*\([^)]+\))?)/i,
    /([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\s+(?:descent|heritage|ancestry)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].trim();
  }
  return null;
}

function extractBuild(text) {
  const lower = text.toLowerCase();
  // Try specific build types first
  for (const bt of BUILD_TYPES) {
    if (lower.includes(bt)) return bt;
  }
  // Fallback: look for build description
  const buildMatch = lower.match(/build[:\s]+([a-z-]+)/);
  if (buildMatch) return buildMatch[1];
  return null;
}

function processPromptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const name = path.basename(filePath, '.prompt.md');

  // Extract the full prompt text (from ## Prompt section)
  const promptMatch = content.match(/## Prompt\n([\s\S]*?)(?=## Negative Prompt|$)/);
  const draftMatch = content.match(/## Prompt \(Draft\)\n([\s\S]*?)(?=## Prompt\n)/);
  const promptText = (draftMatch ? draftMatch[1] : promptMatch ? promptMatch[1] : '').trim();
  const fullText = promptMatch ? promptMatch[1].trim() : '';

  // Use the full text for extraction (more detail)
  const text = fullText || promptText;

  return {
    name,
    age: extractAge(text),
    ethnicity: extractEthnicity(text),
    face_shape: extractField(text, FACE_SHAPES),
    jaw: extractField(text, JAW_TYPES),
    cheekbones: extractField(text, CHEEKBONES),
    nose: extractField(text, NOSE_TYPES),
    eyes: extractField(text, EYE_TYPES),
    brow: extractField(text, BROW_TYPES),
    lips: extractField(text, LIP_TYPES),
    build: extractBuild(text),
    skin: extractField(text, SKIN_TYPES),
    hair: extractField(text, HAIR_TYPES),
    prompt_length: promptText.length,
    full_length: fullText.length,
  };
}

function checkDuplicates(characters) {
  const issues = [];
  // Check face_shape + jaw + nose + eyes combination uniqueness
  const combos = {};
  for (const char of characters) {
    const key = [char.face_shape, char.jaw, char.nose, char.eyes].filter(Boolean).join('|');
    if (key && key.split('|').length === 4) {
      if (!combos[key]) combos[key] = [];
      combos[key].push(char.name);
    }
  }
  for (const [combo, names] of Object.entries(combos)) {
    if (names.length > 1) {
      issues.push({
        type: 'DUPLICATE_COMBO',
        severity: 'HIGH',
        combo: combo.split('|'),
        characters: names,
        message: `Duplicate face+jaw+nose+eyes combination: ${combo} shared by ${names.join(', ')}`,
      });
    }
  }
  return issues;
}

function checkAgeConsistency(characters) {
  const issues = [];
  for (const char of characters) {
    if (char.age && char.age > 40) {
      // Men over 40 should have receding hairline, gray streaks, or thicker brows
      // Women over 40 should have lines around eyes, brow droop, skin texture change
      // This is a soft check — we just flag them for manual review
      issues.push({
        type: 'AGE_REVIEW',
        severity: 'INFO',
        character: char.name,
        age: char.age,
        message: `Character over 40 (${char.name}, age ${char.age}) — verify age-appropriate features in full prompt`,
      });
    }
  }
  return issues;
}

function checkMissingFields(characters) {
  const issues = [];
  for (const char of characters) {
    const missing = [];
    if (!char.face_shape) missing.push('face_shape');
    if (!char.jaw) missing.push('jaw');
    if (!char.nose) missing.push('nose');
    if (!char.eyes) missing.push('eyes');
    if (!char.build) missing.push('build');
    if (missing.length > 0) {
      issues.push({
        type: 'MISSING_BIOMETRICS',
        severity: 'MEDIUM',
        character: char.name,
        missing,
        message: `${char.name}: missing ${missing.join(', ')} — prompt may not have explicit biometric keywords`,
      });
    }
  }
  return issues;
}

// ── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const checkDuplicatesOnly = args.includes('--check-duplicates');

const files = fs.readdirSync(FIGURES_DIR)
  .filter(f => f.endsWith('.prompt.md') && !f.includes('biometric') && !f.includes('constitution'))
  .sort();

const characters = files.map(f => processPromptFile(path.join(FIGURES_DIR, f)));

const allIssues = [
  ...checkDuplicates(characters),
  ...checkAgeConsistency(characters),
  ...checkMissingFields(characters),
];

const report = {
  total_characters: characters.length,
  issues: allIssues,
  issue_summary: {
    duplicate_combos: allIssues.filter(i => i.type === 'DUPLICATE_COMBO').length,
    age_reviews: allIssues.filter(i => i.type === 'AGE_REVIEW').length,
    missing_biometrics: allIssues.filter(i => i.type === 'MISSING_BIOMETRICS').length,
  },
  characters: characters.map(c => ({
    name: c.name,
    age: c.age,
    ethnicity: c.ethnicity,
    face: { shape: c.face_shape, jaw: c.jaw, cheekbones: c.cheekbones },
    nose: c.nose,
    eyes: c.eyes,
    build: c.build,
    skin: c.skin,
    hair: c.hair,
    draft_len: c.prompt_length,
    full_len: c.full_length,
  })),
};

console.log(JSON.stringify(report, null, 2));
