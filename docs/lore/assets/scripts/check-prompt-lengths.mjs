#!/usr/bin/env node

/**
 * check-prompt-lengths.mjs
 * 
 * Scans all .prompt.md files and reports prompts that exceed NVIDIA NIM's
 * 800-character limit (including negative prompts combined with "\n\nNO ").
 * 
 * Usage:
 *   node check-prompt-lengths.mjs
 *   node check-prompt-lengths.mjs --min-length 700
 */

import fs from 'node:fs';
import path from 'node:path';

const PROMPT_ROOTS = [
  path.resolve('docs/lore/shared/assets'),
  path.resolve('docs/lore/landmarks'),
  path.resolve('docs/lore/figures'),
];
const MAX_NIM_LENGTH = 800; // Actual API limit
const DEFAULT_MIN_REPORT = 700; // Report prompts approaching the limit

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

The script checks the combined length of prompt + negative prompt
(with "\\n\\nNO " separator) against NVIDIA NIM's 800-character limit.
`);
}

function cleanNegativePrompt(text) {
  let t = (text || '').trim();
  if (!t) return '';
  t = t.replace(/^--no\s+/, 'no ');
  t = t.replace(/^--no$/, 'no');
  return t.trim();
}

function parsePromptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const results = [];

  const typeMatch = content.match(/\*\*Type:\*\* (\S+)/);
  const type = typeMatch ? typeMatch[1].trim() : 'unknown';

  const promptRegex = /## Prompt — ([^\n]+)\n([\s\S]*?)(?=## Prompt — |## Negative Prompt\n|$)/g;
  let match;
  while ((match = promptRegex.exec(content)) !== null) {
    const variantName = match[1].trim();
    const promptText = match[2].trim();
    const negMatch = content.slice(match.index + match[0].length).match(/## Negative Prompt\n([\s\S]*?)(?=## Prompt — |$)/);
    const negativeText = negMatch ? negMatch[1].trim() : '';

    if (promptText) {
      results.push({ variantName, promptText, negativeText, type });
    }
  }

  // Fallback: single ## Prompt section (no named variants)
  if (results.length === 0) {
    const singlePromptMatch = content.match(/## Prompt\n([\s\S]*?)(?=## Negative Prompt|$)/);
    if (singlePromptMatch) {
      const promptText = singlePromptMatch[1].trim();
      const negMatch = content.match(/## Negative Prompt\n([\s\S]*?)(?=## |$)/);
      const negativeText = negMatch ? negMatch[1].trim() : '';
      if (promptText) {
        results.push({ variantName: 'default', promptText, negativeText, type });
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
  const stats = { totalFiles: 0, totalVariants: 0, overLimit: 0, approaching: 0 };

  for (const promptFile of promptFiles) {
    stats.totalFiles++;
    const relPath = path.basename(promptFile);
    const variants = parsePromptFile(promptFile);
    stats.totalVariants += variants.length;

    for (const variant of variants) {
      const negativePrompt = cleanNegativePrompt(variant.negativeText);
      const combinedPrompt = negativePrompt
        ? `${variant.promptText}\n\nNO ${negativePrompt}`
        : variant.promptText;

      const length = combinedPrompt.length;

      if (length > MAX_NIM_LENGTH) {
        issues.push({
          file: relPath,
          variant: variant.variantName,
          type: variant.type,
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
  console.log(`   ⚠️  Approaching limit (≥ ${opts.minLength}): ${stats.approaching}`);
  console.log(`   ❌ Over limit (> ${MAX_NIM_LENGTH}): ${stats.overLimit}`);
  console.log();

  if (issues.length > 0) {
    console.log(`📋 Issues found:`);
    issues.forEach(issue => {
      const marker = issue.severity === 'ERROR' ? '❌' : '⚠️';
      const color = issue.severity === 'ERROR' ? '31' : '33'; // red : yellow
      console.log(`\x1b[${color}m${marker} ${issue.file} [${issue.variant}] (${issue.type})`);
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
      console.log(`   Reduce prompt length by ${stats.overLimit} characters or more.`);
    }
    
    process.exitCode = stats.overLimit > 0 ? 1 : 0;
  } else {
    console.log(`✅ All prompts are within NVIDIA NIM limits!`);
  }
}

main();
