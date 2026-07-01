#!/usr/bin/env node
/**
 * Fix broken YAML character files from integration run.
 * Reads broken files using regex extraction, cleans text, rewrites with proper format.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const TARGET_DIR = path.resolve('content/characters');

// Find all broken YAML files
const allFiles = fs.readdirSync(TARGET_DIR).filter(f => f.endsWith('.yaml') && f.startsWith('char_'));
const brokenFiles = [];

for (const f of allFiles) {
  try {
    yaml.load(fs.readFileSync(path.join(TARGET_DIR, f), 'utf8'));
  } catch {
    brokenFiles.push(f);
  }
}

console.log(`Found ${brokenFiles.length} broken YAML files\n`);

let fixed = 0;
let failed = 0;

for (const f of brokenFiles) {
  const filePath = path.join(TARGET_DIR, f);
  const raw = fs.readFileSync(filePath, 'utf8');
  
  try {
    // Extract fields using regex on raw text
    const idMatch = raw.match(/^id:\s*"([^"]+)"/m);
    const nameMatch = raw.match(/^name:\s*"([^"]+)"/m);
    const titleMatch = raw.match(/^title:\s*"([^"]+)"/m);
    
    // Description is between description: and metadata:
    let descMatch = raw.match(/^description:\s*"(.+?)"$/m);
    
    // Also handle multi-line description (but these broken files shouldn't have that)
    if (!descMatch) {
      descMatch = raw.match(/^description:\s*"\s*(.+?)\s*"?\s*$/m);
    }
    
    if (!idMatch || !nameMatch || !titleMatch) {
      console.log(`  ❌ ${f} — could not extract basic fields`);
      failed++;
      continue;
    }
    
    // Extract metadata fields
    const typeMatch = raw.match(/type:\s*"([^"]+)"/);
    const roleMatch = raw.match(/role:\s*"([^"]+)"/);
    const factionMatch = raw.match(/faction:\s*"([^"]+)"/);
    const personalityMatch = raw.match(/personality:\s*"([^"]+)"/);
    
    let description = descMatch ? descMatch[1] : '';
    
    // Clean description: strip all backslash escapes and markdown artifacts
    description = description
      .replace(/\\-/g, '-')
      .replace(/\\\\/g, ' ')
      .replace(/\\\+/g, '+')
      .replace(/\\\./g, '.')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\_/g, '_')
      .replace(/\\\*+/g, '')
      .replace(/\\#/g, '#')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Extract age from description if present (e.g., "26-year-old" or "(26)")
    let title = titleMatch[1];
    // Clean title of backslash artifacts
    title = title.replace(/\\-/g, '-').replace(/\\\\/g, '').replace(/\\_/g, '_').trim();
    
    // Build the data object
    const data = {
      id: idMatch[1],
      name: nameMatch[1],
      title: title,
      description: description,
      metadata: {
        type: typeMatch?.[1] || 'human',
        role: roleMatch?.[1] || 'npc',
        faction: factionMatch?.[1] || 'independent',
        personality: personalityMatch?.[1] || 'independent_npc',
      },
    };
    
    // Write back using block scalar format
    const descLines = data.description.split('\n');
    const lines = [];
    lines.push(`id: "${data.id}"`);
    lines.push(`name: "${data.name}"`);
    lines.push(`title: "${data.title}"`);
    if (descLines.length === 1) {
      lines.push(`description: "${data.description}"`);
    } else {
      lines.push('description: |');
      for (const line of descLines) {
        lines.push(`  ${line}`);
      }
    }
    lines.push('metadata:');
    lines.push(`  type: "${data.metadata.type}"`);
    lines.push(`  role: "${data.metadata.role}"`);
    lines.push(`  faction: "${data.metadata.faction}"`);
    lines.push(`  personality: "${data.metadata.personality}"`);
    lines.push('');
    
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    
    // Verify it parses
    yaml.load(fs.readFileSync(filePath, 'utf8'));
    console.log(`  ✅ ${f}`);
    fixed++;
    
  } catch (e) {
    console.log(`  ❌ ${f} — ${e.message}`);
    failed++;
  }
}

console.log(`\n📊 Summary: ${fixed} fixed, ${failed} failed`);