#!/usr/bin/env node

/**
 * check-prompt-lengths.mjs
 * 
 * Scans all .prompt.md files and reports prompts that exceed NVIDIA NIM's
 * 800-character limit. Checks the ## Prompt (Draft) section preferentially;
 * falls back to ## Prompt if no draft section exists.
 * 
 * Usage:
 *   node check-prompt-lengths.mjs
 *   node check-prompt-lengths.mjs --min-length 700
 */

import fs from 'node:fs';
import path from 'node:path';

const PROMPT_ROOTS = [
  path.resolve('content/characters'),
  path.resolve('content/locations'),
  path.resolve('content/scenes'),
  path.resolve('content/overlays'),
  path.resolve('content/missions'),
  path.resolve('content/stories'),
  path.resolve('content/story_beats'),
  path.resolve('content/lore'),
  path.resolve('content/dialogues'),
];
const MAX_NIM_LENGTH = 800;
const DEFAULT_MIN_REPORT = 700;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { minLength: DEFAULT_MIN_REPORT };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--min-length':
        opts.minLength = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
check-prompt-lengths.mjs — Find prompts exceeding NVIDIA NIM limits

Usage:
  node check-prompt-lengths.mjs
  node check-prompt-lengths.mjs --min-length 700
  node check-prompt-lengths.mjs --help

Options:
  --min-length <chars>  Minimum length to report (default: 700)
  --help, -h             Show this help

The script checks the ## Prompt (Draft) section (or ## Prompt if no draft)
combined with negative prompt against NVIDIA NIM's 800-character limit.
`);
}

function cleanNegativePrompt(text) {
  let t = (text || '').trim();
  if (!t) return '';
  t = t.replace(/^--no\s+/, 'no ');
  t = t.replace(/^--no$/, 'no');
  return t.trim();
}

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const [k, ...v] = line.split(': ');
    if (k && v.length) meta[k.trim()] = v.join(': ').trim();
  }
  return meta;
}

function hasDraftSection(content) {
  return /^#{2,3} Prompt \(Draft\)\s*\n/m.test(content);
}

function extractDraftPrompt(content) {
  const m = content.match(/^#{2,3} Prompt \(Draft\)\n([\s\S]*?)(?=^#{2,3}\s+(?:Prompt|Negative Prompt|Sheet|Variations)|$)/m);
  return m ? m[1].trim() : '';
}

function extractType(content) {
  const fm = parseFrontmatter(content);
  if (fm && fm.type) return fm.type;
  const typeMatch = content.match(/\*\*Type:\*\* (\S+)/);
  return typeMatch ? typeMatch[1].trim() : 'unknown';
}

function parsePromptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const results = [];

  const type = extractType(content);

  const promptRegex = /## Prompt — ([^\n]+)\n([\s\S]*?)(?=## Prompt — |## Negative Prompt\n|$)/g;
  let match;
  while ((match = promptRegex.exec(content)) !== null) {
    const variantName = match[1].trim();
    const promptText = match[2].trim();
    const negMatch = content.slice(match.index + match[0].length).match(/## Negative Prompt\n([\s\S]*?)(?=## Prompt — |$)/);
    const negativeText = negMatch ? negMatch[1].trim() : '';

    if (promptText) {
      results.push({ variantName, promptText, negativeText, type, section: 'named' });
    }
  }

  if (results.length === 0 && hasDraftSection(content)) {
    const draftText = extractDraftPrompt(content);
    const negMatch = content.match(/^#{1,2}\s+Negative Prompt\s*\n([\s\S]*?)(?=^#{1,2}\s+|$)/m);
    const negativeText = negMatch ? negMatch[1].trim() : '';
    if (draftText) {
      results.push({ variantName: 'default (draft)', promptText: draftText, negativeText, type, section: 'draft' });
    }
  }

  if (results.length === 0) {
    const singlePromptMatch = content.match(/## Prompt\n([\s\S]*?)(?=## Negative Prompt|$)/);
    if (singlePromptMatch) {
      const promptText = singlePromptMatch[1].trim();
      const negMatch = content.match(/## Negative Prompt\n([\s\S]*?)(?=## |$)/);
      const negativeText = negMatch ? negMatch[1].trim() : '';
      if (promptText) {
        results.push({ variantName: 'default', promptText, negativeText, type, section: 'full' });
      }
    }
  }

  return results;
}

function main() {
  const opts = parseArgs();

  console.log(`🔍 Scanning prompts for NVIDIA NIM length limits`);
  console.log(`   Max allowed: ${MAX_NIM_LENGTH} characters`);
  console.log(`   Reporting: ≥ ${opts.minLength} characters`);
  console.log();

  const promptFiles = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'references') continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.prompt.md')) {
        promptFiles.push(full);
      }
    }
  }
  for (const root of PROMPT_ROOTS) {
    if (fs.existsSync(root)) walk(root);
  }

  const issues = [];
  const stats = { totalFiles: 0, totalVariants: 0, overLimit: 0, approaching: 0, hasDraft: 0, noDraft: 0 };

  for (const promptFile of promptFiles) {
    stats.totalFiles++;
    const relPath = path.basename(promptFile);
    const content = fs.readFileSync(promptFile, 'utf-8');
    const variants = parsePromptFile(promptFile);
    stats.totalVariants += variants.length;

    if (hasDraftSection(content)) stats.hasDraft++;
    else stats.noDraft++;

    for (const variant of variants) {
      const isDraft = variant.section === 'draft';
      const negativePrompt = isDraft ? '' : cleanNegativePrompt(variant.negativeText);
      const combinedPrompt = negativePrompt
        ? `${variant.promptText}\n\nNO ${negativePrompt}`
        : variant.promptText;

      const length = combinedPrompt.length;

      if (length > MAX_NIM_LENGTH) {
        issues.push({
          file: relPath,
          variant: variant.variantName,
          type: variant.type,
          section: variant.section || 'unknown',
          length,
          overLimit: length - MAX_NIM_LENGTH,
          promptLength: variant.promptText.length,
          negativeLength: negativePrompt.length,
          severity: 'ERROR'
        });
        stats.overLimit++;
      } else if (length >= opts.minLength) {
        issues.push({
          file: relPath,
          variant: variant.variantName,
          type: variant.type,
          section: variant.section || 'unknown',
          length,
          headroom: MAX_NIM_LENGTH - length,
          promptLength: variant.promptText.length,
          negativeLength: negativePrompt.length,
          severity: 'WARN'
        });
        stats.approaching++;
      }
    }
  }

  console.log(`📊 Summary`);
  console.log(`   Files scanned: ${stats.totalFiles}`);
  console.log(`   Prompt variants: ${stats.totalVariants}`);
  console.log(`   ✅ Has draft section: ${stats.hasDraft}`);
  console.log(`   ⚠️  No draft section: ${stats.noDraft}`);
  console.log(`   ⚠️  Approaching limit (≥ ${opts.minLength}): ${stats.approaching}`);
  console.log(`   ❌ Over limit (> ${MAX_NIM_LENGTH}): ${stats.overLimit}`);
  console.log();

  if (issues.length > 0) {
    console.log(`📋 Issues found:`);
    issues.forEach(issue => {
      const marker = issue.severity === 'ERROR' ? '❌' : '⚠️';
      const color = issue.severity === 'ERROR' ? '31' : '33';
      const sectionTag = issue.section === 'draft' ? ' (draft)' : issue.section === 'named' ? ' (named)' : '';
      console.log(`\x1b[${color}m${marker} ${issue.file} [${issue.variant}]${sectionTag} (${issue.type})`);
      console.log(`   Length: ${issue.length}/${MAX_NIM_LENGTH} chars`);
      if (issue.severity === 'ERROR') {
        console.log(`   Over by: ${issue.overLimit} characters`);
      } else {
        console.log(`   Headroom: ${issue.headroom} characters`);
      }
      console.log(`   Prompt: ${issue.promptLength} chars | Negative: ${issue.negativeLength} chars`);
      console.log(`\x1b[0m`);
    });
    console.log();
    
    if (stats.overLimit > 0) {
      console.log(`💡 Tip: These prompts will fail with HTTP 422 "string_too_long"`);
    }
    
    process.exitCode = stats.overLimit > 0 ? 1 : 0;
  } else {
    console.log(`✅ All prompts are within NVIDIA NIM limits!`);
  }
}

main();