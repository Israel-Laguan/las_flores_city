#!/usr/bin/env node
/**
 * Character Content Analysis Script
 * 
 * Analyzes all characters to determine which are "poorest" in terms of content.
 * Scores characters based on:
 * - Missing new fields (physical_description, psychological_description, etc.)
 * - Short/empty description
 * - Missing or empty lore.md
 * - Missing or empty prompt.md
 * 
 * Usage: node scripts/analyze-character-content.mjs [--json] [--limit=N]
 */

import fs from 'fs';
import path from 'path';
import { load as yamlLoad } from 'js-yaml';

// ─── Configuration ────────────────────────────────────────────────────────────
const CONTENT_DIR = path.resolve('content/characters');
const OUTPUT_JSON = process.argv.includes('--json');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || '0', 10) : 0;

// ─── Scoring Weights ──────────────────────────────────────────────────────────
const WEIGHTS = {
  missingPhysicalDescription: 25,
  missingPsychologicalDescription: 25,
  missingBackgroundAndRole: 20,
  missingBirthYear: 10,
  shortDescription: 15,  // If description < 100 chars
  noLoreFile: 10,
  emptyLoreFile: 5,
  shortLoreFile: 5,     // If lore < 200 chars
  noPromptFile: 10,
  emptyPromptFile: 5,
  shortPromptFile: 5,   // If prompt < 100 chars
};

// ─── Analysis ────────────────────────────────────────────────────────────────
function analyzeCharacter(characterFolder) {
  const folderPath = path.join(CONTENT_DIR, characterFolder);
  const files = fs.readdirSync(folderPath);
  
  // Find YAML file
  const yamlFiles = files.filter(f => f.startsWith('char_') && f.endsWith('.yaml'));
  if (yamlFiles.length === 0) {
    return null;
  }
  
  const yamlPath = path.join(folderPath, yamlFiles[0]);
  let yamlData;
  try {
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    yamlData = yamlLoad(yamlContent);
  } catch (e) {
    return null;
  }
  
  // Read lore file
  const lorePath = path.join(folderPath, `${characterFolder}.md`);
  const loreContent = fs.existsSync(lorePath) ? fs.readFileSync(lorePath, 'utf8') : '';
  
  // Read prompt file
  const promptPath = path.join(folderPath, `${characterFolder}.prompt.md`);
  const promptContent = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';
  
  // Also check for other markdown files
  const mdFiles = files.filter(f => f.endsWith('.md') && !f.endsWith('.prompt.md'));
  const allLoreContent = mdFiles.length > 0 ? mdFiles.map(f => {
    try { return fs.readFileSync(path.join(folderPath, f), 'utf8'); } catch { return ''; }
  }).join('\n\n') : loreContent;
  
  // Calculate score (higher = poorer quality)
  let score = 0;
  const issues = [];
  
  // Check for missing new fields
  if (!yamlData.physical_description || yamlData.physical_description.trim().length === 0) {
    score += WEIGHTS.missingPhysicalDescription;
    issues.push('Missing physical_description');
  }
  
  if (!yamlData.psychological_description || yamlData.psychological_description.trim().length === 0) {
    score += WEIGHTS.missingPsychologicalDescription;
    issues.push('Missing psychological_description');
  }
  
  if (!yamlData.background_and_role || yamlData.background_and_role.length === 0) {
    score += WEIGHTS.missingBackgroundAndRole;
    issues.push('Missing background_and_role');
  }
  
  if (yamlData.birth_year === undefined || yamlData.birth_year === null) {
    score += WEIGHTS.missingBirthYear;
    issues.push('Missing birth_year');
  }
  
  // Check description quality
  const description = yamlData.description || '';
  if (description.length < 100) {
    score += WEIGHTS.shortDescription;
    issues.push(`Short description (${description.length} chars)`);
  }
  
  // Check lore file
  if (!fs.existsSync(lorePath)) {
    score += WEIGHTS.noLoreFile;
    issues.push('No lore file');
  } else if (loreContent.trim().length === 0) {
    score += WEIGHTS.emptyLoreFile;
    issues.push('Empty lore file');
  } else if (loreContent.length < 200) {
    score += WEIGHTS.shortLoreFile;
    issues.push(`Short lore file (${loreContent.length} chars)`);
  }
  
  // Check prompt file
  if (!fs.existsSync(promptPath)) {
    score += WEIGHTS.noPromptFile;
    issues.push('No prompt file');
  } else if (promptContent.trim().length === 0) {
    score += WEIGHTS.emptyPromptFile;
    issues.push('Empty prompt file');
  } else if (promptContent.length < 100) {
    score += WEIGHTS.shortPromptFile;
    issues.push(`Short prompt file (${promptContent.length} chars)`);
  }
  
  // Calculate content richness metrics
  const hasPhysicalDesc = !!yamlData.physical_description?.trim();
  const hasPsychologicalDesc = !!yamlData.psychological_description?.trim();
  const hasBackgroundAndRole = Array.isArray(yamlData.background_and_role) && yamlData.background_and_role.length > 0;
  const hasBirthYear = yamlData.birth_year !== undefined && yamlData.birth_year !== null;
  
  return {
    folder: characterFolder,
    name: yamlData.name || characterFolder,
    id: yamlData.id || 'unknown',
    score,
    issues,
    hasPhysicalDesc,
    hasPsychologicalDesc,
    hasBackgroundAndRole,
    hasBirthYear,
    descriptionLength: description.length,
    loreLength: loreContent.length,
    promptLength: promptContent.length,
    hasLoreFile: fs.existsSync(lorePath),
    hasPromptFile: fs.existsSync(promptPath),
    yamlFile: yamlFiles[0],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              Character Content Quality Analysis                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Get all character folders
  const folders = fs.readdirSync(CONTENT_DIR)
    .filter(d => {
      const fullPath = path.join(CONTENT_DIR, d);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort();
  
  const totalCount = folders.length;
  console.log(`📂 Found ${totalCount} character folders`);
  console.log('');
  
  // Apply limit
  const foldersToAnalyze = LIMIT > 0 ? folders.slice(0, LIMIT) : folders;
  
  // Analyze all characters
  const results = [];
  for (const folder of foldersToAnalyze) {
    const result = analyzeCharacter(folder);
    if (result) {
      results.push(result);
    }
  }
  
  // Sort by score (highest = poorest)
  results.sort((a, b) => b.score - a.score);
  
  // Statistics
  const total = results.length;
  const hasAllFields = results.filter(r => r.score === 0).length;
  const needsEnrichment = results.filter(r => r.score > 0).length;
  const missingPhysical = results.filter(r => !r.hasPhysicalDesc).length;
  const missingPsychological = results.filter(r => !r.hasPsychologicalDesc).length;
  const missingBackground = results.filter(r => !r.hasBackgroundAndRole).length;
  const missingBirthYear = results.filter(r => !r.hasBirthYear).length;
  const noLore = results.filter(r => !r.hasLoreFile).length;
  const noPrompt = results.filter(r => !r.hasPromptFile).length;
  
  console.log('📊 OVERALL STATISTICS');
  console.log('═'.repeat(60));
  console.log(`  Total characters analyzed: ${total}`);
  console.log(`  Fully complete (score = 0): ${hasAllFields}`);
  console.log(`  Need enrichment (score > 0): ${needsEnrichment}`);
  console.log('');
  console.log('📋 FIELD COVERAGE:');
  console.log(`  Have physical_description: ${total - missingPhysical}/${total} (${Math.round((1 - missingPhysical/total) * 100)}%)`);
  console.log(`  Have psychological_description: ${total - missingPsychological}/${total} (${Math.round((1 - missingPsychological/total) * 100)}%)`);
  console.log(`  Have background_and_role: ${total - missingBackground}/${total} (${Math.round((1 - missingBackground/total) * 100)}%)`);
  console.log(`  Have birth_year: ${total - missingBirthYear}/${total} (${Math.round((1 - missingBirthYear/total) * 100)}%)`);
  console.log('');
  console.log('📝 FILE COVERAGE:');
  console.log(`  Have lore file: ${total - noLore}/${total} (${Math.round((1 - noLore/total) * 100)}%)`);
  console.log(`  Have prompt file: ${total - noPrompt}/${total} (${Math.round((1 - noPrompt/total) * 100)}%)`);
  console.log('');
  
  // Output results
  if (OUTPUT_JSON) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  
  // Color codes for terminal output
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    dim: '\x1b[2m',
  };
  
  function colorScore(score) {
    if (score === 0) return colors.green + '✓' + colors.reset;
    if (score <= 25) return colors.yellow + '⚠' + colors.reset;
    if (score <= 50) return colors.yellow + '⚠⚠' + colors.reset;
    return colors.red + '✗✗' + colors.reset;
  }
  
  // Show poorest characters first (top 50 by default)
  const displayLimit = Math.min(results.length, 50);
  console.log(`🎯 TOP ${displayLimit} POOREST CHARACTERS (highest score = most needs)`);
  console.log('═'.repeat(60));
  
  const header = ['#', 'Score', 'Character', 'Missing Fields', 'Lore', 'Prompt', 'Desc Len'];
  console.log('  ' + header.map(h => h.padEnd(15)).join(''));
  console.log('  ' + '-'.repeat(15 * header.length));
  
  for (let i = 0; i < Math.min(results.length, displayLimit); i++) {
    const r = results[i];
    const row = [
      (i + 1).toString().padEnd(2),
      `${colorScore(r.score)} ${r.score.toString().padEnd(11)}`,
      (r.name || r.folder).substring(0, 14).padEnd(15),
      r.issues.join(', ').substring(0, 20).padEnd(20),
      (r.hasLoreFile ? (r.loreLength > 200 ? '✓' : '~') : '✗').padEnd(6),
      (r.hasPromptFile ? (r.promptLength > 100 ? '✓' : '~') : '✗').padEnd(7),
      `${r.descriptionLength}`.padEnd(10),
    ];
    console.log('  ' + row.join('  '));
  }
  
  if (results.length > displayLimit) {
    console.log('');
    console.log(`  ... and ${results.length - displayLimit} more characters`);
  }
  
  // Summary by score ranges
  console.log('');
  console.log('📊 SCORE DISTRIBUTION');
  console.log('═'.repeat(60));
  const ranges = [
    { label: 'Excellent (score = 0)', min: 0, max: 0 },
    { label: 'Good (score 1-25)', min: 1, max: 25 },
    { label: 'Fair (score 26-50)', min: 26, max: 50 },
    { label: 'Poor (score 51-75)', min: 51, max: 75 },
    { label: 'Very Poor (score > 75)', min: 76, max: 999 },
  ];
  
  for (const range of ranges) {
    const count = results.filter(r => r.score >= range.min && r.score <= range.max).length;
    const pct = Math.round((count / total) * 100);
    console.log(`  ${range.label.padEnd(25)}: ${count.toString().padStart(3)} (${pct}%)`);
  }
  
  // Most common issues
  console.log('');
  console.log('🔍 MOST COMMON ISSUES');
  console.log('═'.repeat(60));
  const allIssues = results.flatMap(r => r.issues);
  const issueCounts = {};
  for (const issue of allIssues) {
    issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  }
  const sortedIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [issue, count] of sortedIssues) {
    console.log(`  ${issue.padEnd(35)}: ${count.toString().padStart(3)} (${Math.round((count / total) * 100)}%)`);
  }
  
  console.log('');
  console.log('✅ Analysis complete!');
}

main();
