#!/usr/bin/env node

/**
 * check-prompt-lengths.mjs
 * 
 * Scans all .prompt.md files and reports prompts that exceed NVIDIA NIM's
 * 800-character hard limit. 800 is a hard NIM limit for ALL NIM-bound
 * sections (`## Prompt (Draft)`, `## Prompt — <name>`, named variants);
 * `story-illustration` Base Scene is NIM-bound and is NOT exempt. Bare
 * `## Prompt` is a manual reference (~2000). Exemption would only hide
 * text the generator silently truncates.
 * 
 * Usage:
 *   node check-prompt-lengths.mjs
 *   node check-prompt-lengths.mjs --min-length 700
 */

import fs from 'node:fs';
import path from 'node:path';

const PROMPT_ROOTS = [
  path.resolve('content/characters'),
  path.resolve('content/districts'),
  path.resolve('content/scenes'),
  path.resolve('content/overlays'),
  path.resolve('content/missions'),
  path.resolve('content/stories'),
  path.resolve('content/story_beats'),
  path.resolve('content/lore'),
  path.resolve('content/dialogues'),
];
const MAX_NIM_LENGTH = 800;
// Bare `## Prompt` (section 'full') is a manual reference prompt and
// is NEVER auto-sent to NIM/Pollinations by the server (which consumes only
// `## Prompt — <name>` named variants). Its authoring budget is ~2000 chars.
const MAX_MANUAL_PROMPT_LENGTH = 2000;
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

Every section bound for NVIDIA NIM is hard-capped at 800 characters:
  - \`## Prompt (Draft)\` (preferred)
  - \`## Prompt — <name>\` named variants
  - \`story-illustration\` Base Scene (NIM-bound, NOT exempt)
(Note: \`## Expression Variants\` blocks are NOT measured by this script —
only the generator's draft/named/i2i sections are parsed.)
Bare \`## Prompt\` is a manual reference prompt (~2000 chars) and is NEVER
auto-sent to NIM/Pollinations; it is capped at 2000. Named and bare \`## Prompt\`
variants are measured on the combined prompt (prompt text + negative prompt);
drafts and i2i Edit prompts are measured standalone (drafts force
negativePrompt to '' and i2i edit prompts have no negative).
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
  // Capture the draft body up to the next ##/### header (or end of file).
  // NOTE: must NOT carry the /m flag — the previous regex had `(?=...|$)/m`
  // where `$` matches at every line end, so the lazy capture collapsed to
  // zero/first-line and drafts were never actually measured (every file with a
  // draft fell through to the bare `## Prompt` branch). This mirrors the
  // generator's proven draft regex in generate-drafts-unified.mjs.
  const m = content.match(/#{2,3} Prompt \(Draft\)\n([\s\S]*?)(?=#{2,3} (?:Prompt|Negative Prompt|Sheet|Variations)|$)/);
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
    // Stop the negative at the next ##/### section header (Variations, another ## Prompt — <name>, etc.).
    const negMatch = content.slice(match.index + match[0].length).match(/## Negative Prompt\n([\s\S]*?)(?=\n#{2,3}\s|$)/);
    const negativeText = negMatch ? negMatch[1].trim() : '';

    if (promptText) {
      results.push({ variantName, promptText, negativeText, type, section: 'named' });
    }
  }
  // Track separately from `results.length` below: named variants add
  // entries, but they must NOT suppress the primary prompt fallbacks.
  const hasNamedVariants = results.some((r) => r.section === 'named');

  // Primary prompt fallbacks. These must not be suppressed by the named variant
  // entries above. Mirrors the original two-step dispatch: try the draft
  // section first, then fall back to a bare `## Prompt` when no draft was
  // extracted (e.g. a draft header whose body starts on a blank line).
  if (!hasNamedVariants) {
    if (hasDraftSection(content)) {
      const draftText = extractDraftPrompt(content);
      const negMatch = content.match(/^#{1,2}\s+Negative Prompt\s*\n([\s\S]*?)(?=^#{1,2}\s+|$)/m);
      const negativeText = negMatch ? negMatch[1].trim() : '';
      if (draftText) {
        results.push({ variantName: 'default (draft)', promptText: draftText, negativeText, type, section: 'draft' });
      }
    }

    if (!results.some((r) => r.section === 'draft')) {
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

      // Per-section cap: `## Prompt (Draft)` / `## Prompt — <name>` / i2i
      // variants are auto-sent to NIM (800 hard). Bare `## Prompt` (section
      // 'full') is a manual reference prompt (~2000).
      const cap = variant.section === 'full' ? MAX_MANUAL_PROMPT_LENGTH : MAX_NIM_LENGTH;

      if (length > cap) {
        issues.push({
          file: relPath,
          variant: variant.variantName,
          type: variant.type,
          section: variant.section || 'unknown',
          length,
          cap,
          overLimit: length - cap,
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
          cap,
          headroom: cap - length,
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
  console.log(`   ❌ Over limit (> section cap): ${stats.overLimit}`);
  console.log();

  if (issues.length > 0) {
    console.log(`📋 Issues found:`);
    issues.forEach(issue => {
      const marker = issue.severity === 'ERROR' ? '❌' : '⚠️';
      const color = issue.severity === 'ERROR' ? '31' : '33';
      const sectionTag = issue.section === 'draft' ? ' (draft)'
        : issue.section === 'named' ? ' (named)'
        : issue.section === 'variant' ? ' (i2i variant)' : '';
      console.log(`\x1b[${color}m${marker} ${issue.file} [${issue.variant}]${sectionTag} (${issue.type})`);
      console.log(`   Length: ${issue.length}/${issue.cap} chars`);
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
      console.log(`💡 Tip: draft/named/i2i variants over their NIM cap will fail with HTTP 422 "string_too_long"; bare ## Prompt over 2000 is a manual authoring concern.`);
    }
    
    process.exitCode = stats.overLimit > 0 ? 1 : 0;
  } else {
    console.log(`✅ All prompts are within NVIDIA NIM limits!`);
  }
}

main();