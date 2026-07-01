#!/usr/bin/env node
/**
 * Character Integration Script
 * 
 * Reads source character entries from the "Flowers from the Red Soil" codex
 * and integrates them into the Las Flores 2077 project's content/characters/ YAML files.
 *
 * Usage: node scripts/integrate-characters.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import yaml from 'js-yaml';

// ─── Configuration ────────────────────────────────────────────────────────────
const SOURCE_ROOT = '/media/israel/DEEP_STORE/2024-10-15 flowers-from-the-red-soil - codex/characters';
const TARGET_DIR = path.resolve('content/characters');
const FLAG_FILE = path.resolve('docs/lore/conflicts/PENDING.md');
const DRY_RUN = process.argv.includes('--dry-run');

// Known edge cases that need manual review
const SKIP_SLUGS = new Set([
  'dong-van-der-meer', // New but needs manual verification of relationship to docs/lore/figures/dong_van_der_meer.md
]);

// Name variants to flag (source slug → target slug or reason)
const FLAG_VARIANTS = {
  'dr-wei-zhang': 'Near-match with char_wei_zhang.yaml — verify same person',
  'mei-li': 'Could be same as char_wang_mei_li.yaml — verify identity',
  'javier-salazar': 'New character — verify if related to existing Javier files',
};

// ─── Faction inference from text ──────────────────────────────────────────────
function inferFaction(text) {
  const lower = text.toLowerCase();
  if (lower.includes('van der meer') || lower.includes('glc')) return 'van_der_meer';
  if (lower.includes('minera estrella') || lower.includes('mineria estrella') || lower.includes('minera')) return 'Minera Estrella';
  if (lower.includes('lw group') || lower.includes('lw')) return 'lw_group';
  if (lower.includes('flowers syndicate') || lower.includes('sindicate')) return 'flowers_syndicate';
  if (lower.includes('cjs') || lower.includes('police') || lower.includes('inspector')) return 'cjs';
  if (lower.includes('media') || lower.includes('journalist') || lower.includes('newspaper') || lower.includes('el informador') || lower.includes('el grito') || lower.includes('la prensa')) return 'media';
  if (lower.includes('government') || lower.includes('senator') || lower.includes('council')) return 'government';
  if (lower.includes('humanity first') || lower.includes('hf ')) return 'humanity_first';
  if (lower.includes('energlobe')) return 'Energlobe';
  if (lower.includes('neptune')) return 'Neptunes Haven';
  if (lower.includes('electra')) return 'Electra';
  if (lower.includes('electra')) return 'Electra';
  if (lower.includes('university') || lower.includes('universidad')) return 'independent';
  return 'independent';
}

// ─── Personality inference from traits ────────────────────────────────────────
function inferPersonality(text, occupation) {
  const lower = text.toLowerCase();
  
  // If personality traits are explicitly mentioned, use them
  if (lower.includes('ambitious') && lower.includes('resourceful')) return 'ambitious_resourceful';
  if (lower.includes('determined') && lower.includes('pragmatic')) return 'determined_pragmatic';
  if (lower.includes('determined') && lower.includes('resourceful')) return 'determined_resourceful';
  if (lower.includes('determined') && lower.includes('ambitious')) return 'ambitious_professional';
  if (lower.includes('bubbly') && lower.includes('outgoing')) return 'bubbly_socialite';
  if (lower.includes('reserved') && lower.includes('observant')) return 'reserved_observer';
  if (lower.includes('charismatic') && lower.includes('driven')) return 'charismatic_driven';
  if (lower.includes('nurturing') || lower.includes('motherly')) return 'community_caretaker';
  if (lower.includes('caring') && lower.includes('dedicated')) return 'caring_professional';
  if (lower.includes('innovative') || lower.includes('pioneer')) return 'innovative_pioneer';
  if (lower.includes('cunning') || lower.includes('manipulative')) return 'cunning_manipulator';
  if (lower.includes('corrupt')) return 'corrupt_official';
  if (lower.includes('activist') || lower.includes('advocacy')) return 'passionate_activist';
  if (lower.includes('leadership') || lower.includes('leader')) return 'strong_leader';
  if (lower.includes('loyal') || lower.includes('fierce')) return 'loyal_advocate';
  if (lower.includes('shrewd') || lower.includes('business')) return 'shrewd_businessperson';
  if (lower.includes('idealistic') || lower.includes('ideals')) return 'idealistic_reformer';
  if (lower.includes('cautious') || lower.includes('methodical')) return 'methodical_professional';
  if (lower.includes('quiet') && lower.includes('steady')) return 'quiet_steadfast';
  if (lower.includes('fiery') || lower.includes('passionate')) return 'passionate_advocate';
  if (lower.includes('funny') || lower.includes('humor')) return 'humorous_charmer';
  if (lower.includes('wise') || lower.includes('elder')) return 'community_elder';
  if (lower.includes('creative') || lower.includes('artistic')) return 'creative_spirit';
  if (lower.includes('technical') || lower.includes('analytical')) return 'analytical_thinker';
  if (lower.includes('sociable') || lower.includes('friendly')) return 'sociable_connector';
  if (lower.includes('serious') || lower.includes('stern')) return 'serious_professional';
  if (lower.includes('kind') && lower.includes('gentle')) return 'gentle_soul';
  if (lower.includes('patient')) return 'patient_mentor';
  if (lower.includes('intuitive') || lower.includes('perceptive')) return 'perceptive_intuitive';
  if (lower.includes('courageous') || lower.includes('brave')) return 'courageous_advocate';
  if (lower.includes('confident') || lower.includes('bold')) return 'confident_leader';
  if (lower.includes('passionate') && lower.includes('intelligent')) return 'passionate_intellectual';
  if (lower.includes('compassionate') && lower.includes('smart')) return 'compassionate_smart';
  if (lower.includes('talented') || lower.includes('gifted')) return 'talented_professional';
  if (lower.includes('wise') || lower.includes('sagacious')) return 'wise_counsel';
  if (lower.includes('empathetic') || lower.includes('empathy')) return 'empathetic_listener';
  if (lower.includes('caring') && lower.includes('empathetic')) return 'empathetic_leader';
  if (lower.includes('kind') && lower.includes('hard')) return 'kind_hardworking';
  if (lower.includes('intelligent') && lower.includes('ambitious')) return 'intelligent_ambitious';
  if (lower.includes('intelligent') && lower.includes('driven')) return 'intelligent_driven';
  if (lower.includes('resourceful')) return 'resourceful_selfreliant';
  if (lower.includes('determined')) return 'determined_survivor';
  if (lower.includes('resilient')) return 'resilient_survivor';
  if (lower.includes('creative')) return 'creative_soul';
  if (lower.includes('intelligent') || lower.includes('smart')) return 'intelligent_professional';
  if (lower.includes('ambitious')) return 'ambitious_striver';
  if (lower.includes('loyal')) return 'loyal_friend';
  if (lower.includes('strong')) return 'strong_willed';
  if (lower.includes('gentle') || lower.includes('soft')) return 'gentle_peacemaker';
  if (lower.includes('kind')) return 'kind_guardian';
  if (lower.includes('smart') || lower.includes('clever')) return 'clever_problem_solver';
  if (lower.includes('confident')) return 'confident_charmer';
  if (lower.includes('honest') || lower.includes('transparent')) return 'honest_broker';
  if (lower.includes('hardworking') || lower.includes('dedicated')) return 'dedicated_professional';
  if (lower.includes('patient') && lower.includes('kind')) return 'patient_guardian';
  if (lower.includes('sensible') || lower.includes('practical')) return 'practical_realist';
  if (lower.includes('inventive') || lower.includes('curious')) return 'inventive_thinker';
  if (lower.includes('friendly')) return 'friendly_connector';
  if (lower.includes('social')) return 'social_butterfly';
  if (lower.includes('passionate')) return 'passionate_individual';
  if (lower.includes('humble')) return 'humble_servant';
  if (lower.includes('respectful')) return 'respectful_traditionalist';
  
  // Default based on occupation
  const occLower = (occupation || '').toLowerCase();
  if (occLower.includes('nurse') || occLower.includes('doctor') || occLower.includes('health')) return 'compassionate_healer';
  if (occLower.includes('teacher') || occLower.includes('educator') || occLower.includes('professor')) return 'dedicated_educator';
  if (occLower.includes('engineer') || occLower.includes('scientist') || occLower.includes('researcher')) return 'analytical_thinker';
  if (occLower.includes('lawyer') || occLower.includes('judge')) return 'methodical_professional';
  if (occLower.includes('police') || occLower.includes('officer') || occLower.includes('inspector')) return 'disciplined_officer';
  if (occLower.includes('journalist') || occLower.includes('reporter') || occLower.includes('editor')) return 'tenacious_investigator';
  if (occLower.includes('business') || occLower.includes('manager') || occLower.includes('executive')) return 'shrewd_businessperson';
  if (occLower.includes('artist') || occLower.includes('musician') || occLower.includes('designer')) return 'creative_spirit';
  if (occLower.includes('miner') || occLower.includes('worker')) return 'resilient_worker';
  if (occLower.includes('politician') || occLower.includes('senator') || occLower.includes('mayor')) return 'political_operator';
  
  return 'independent_npc';
}

// ─── Title derivation ─────────────────────────────────────────────────────────
function inferTitle(text, name) {
  const lower = text.toLowerCase();
  
  // Try to extract occupation and employer from text
  let occupation = '';
  let employer = '';
  
  // Look for common occupation patterns
  const occPatterns = [
    /(?:works?\s+as\s+a|is\s+a|serves?\s+as\s+(?:a|an)\s+|working\s+as\s+a|employed\s+as\s+a)\s+([^,.\n]{3,40})/i,
    /(?:career|professional)\s+(?:as\s+a|in)\s+([^,.\n]{3,40})/i,
  ];
  
  for (const pat of occPatterns) {
    const m = text.match(pat);
    if (m) { occupation = m[1].trim(); break; }
  }
  
  // Look for employer patterns
  const empPatterns = [
    /at\s+(Minera Estrella|GLC|LW Group|Electra|Energlobe|Neptune|the\s+University|the\s+police)/i,
    /for\s+(Minera Estrella|GLC|LW Group|Electra|Energlobe|Neptune)/i,
    /at\s+(?:Las Flores|San Pedro|the)\s+(\w+\s+University|university)/i,
  ];
  
  for (const pat of empPatterns) {
    const m = text.match(pat);
    if (m) { employer = m[1].trim(); break; }
  }
  
  // Combine into title
  if (occupation && employer) {
    // Clean up occupation
    occupation = occupation.replace(/^(a|an|the)\s+/i, '').trim();
    return `${occupation} at ${employer}`;
  }
  if (occupation) {
    return occupation.replace(/^(a|an|the)\s+/i, '').trim();
  }
  
  // Fallback: try to extract any descriptive phrase
  const descMatch = text.match(/(?:is|works?\s+as|serves?\s+as|employed\s+as)\s+(?:a|an)\s+([^,.\n]{5,50})/i);
  if (descMatch) return descMatch[1].trim();
  
  return 'Las Flores Resident';
}

// ─── Description synthesis ────────────────────────────────────────────────────
function synthesizeDescription(body, name) {
  // Clean up the body text — aggressively strip markdown escapes and artifacts
  let text = body
    .replace(/\\####\s*/g, '### ')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')  // strip bold/italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // strip links
    .replace(/\\\+ /g, '+ ')  // strip escaped plus
    .replace(/\\\\/g, '\\')  // collapse double backslash
    .replace(/\\-/g, '-')  // strip escaped hyphen
    .replace(/\\\./g, '.')  // strip escaped period
    .replace(/\\\(/g, '(')  // strip escaped parens
    .replace(/\\\)/g, ')')
    .replace(/\\_/g, '_')  // strip escaped underscore
    .replace(/\\\*+/g, '')  // strip escaped asterisks
    .replace(/\\#/g, '#')  // strip escaped hash
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  // Extract key information
  let age = '';
  let origin = '';
  let background = '';
  let personality = '';
  let occupation = '';
  let currentStatus = '';
  
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    
    if (lower.startsWith('race/') || lower.startsWith('ethnicity') || lower.startsWith('origin') || lower.startsWith('heritage')) {
      origin = line.replace(/^.*?:\s*/, '').trim();
    } else if (lower.startsWith('age:')) {
      age = line.replace(/^age:\s*/i, '').trim();
    } else if (lower.startsWith('background')) {
      background = line.replace(/^background:?\s*/i, '').trim();
    } else if (lower.startsWith('personality')) {
      personality = line.replace(/^personality:?\s*/i, '').trim();
    } else if (lower.startsWith('education') || lower.startsWith('career') || lower.startsWith('professional')) {
      occupation = line.replace(/^(education|career|professional)[^:]*:\s*/i, '').trim();
    } else if (lower.startsWith('current status') || lower.startsWith('status')) {
      currentStatus = line.replace(/^(current\s+)?status:?\s*/i, '').trim();
    }
  }
  
  // Build description from available pieces
  const parts = [];
  
  if (origin || age) {
    let intro = `${name}`;
    if (origin) intro += `, originally from ${origin}`;
    if (age) intro += ` (${age})`;
    parts.push(intro + '.');
  }
  
  if (background) {
    parts.push(background.endsWith('.') ? background : background + '.');
  }
  
  if (personality) {
    parts.push(personality.endsWith('.') ? personality : personality + '.');
  }
  
  if (currentStatus) {
    parts.push(currentStatus.endsWith('.') ? currentStatus : currentStatus + '.');
  }
  
  // If we couldn't extract structured fields, fall back to first few meaningful sentences
  if (parts.length === 0) {
    const sentences = text
      .replace(/[A-Z][a-z]+\s*[:]/g, '')  // Remove section headers
      .split(/[.!?]+\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && !s.startsWith('Race') && !s.startsWith('Age') && !s.startsWith('Education'));
    
    parts.push(...sentences.slice(0, 5).map(s => s + '.'));
  }
  
  let description = parts.join(' ').replace(/\s+/g, ' ').trim();
  
  // Truncate to ~300 chars if too long, ending at sentence boundary
  if (description.length > 500) {
    const cut = description.substring(0, 497);
    const lastPeriod = cut.lastIndexOf('.');
    if (lastPeriod > 200) {
      description = cut.substring(0, lastPeriod + 1);
    } else {
      description = cut + '...';
    }
  }
  
  return description || `${name} is a resident of Las Flores.`;
}

// ─── Parse YAML frontmatter from entry.md ─────────────────────────────────────
function parseEntryMd(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content.trim() };
  
  try {
    const frontmatter = yaml.load(match[1]) || {};
    return { frontmatter, body: match[2].trim() };
  } catch {
    return { frontmatter: {}, body: content.trim() };
  }
}

// ─── Parse existing YAML character file ───────────────────────────────────────
function parseExistingYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.load(content);
  } catch (e) {
    console.error(`  ⚠ Failed to parse existing YAML: ${filePath} — ${e.message}`);
    return null;
  }
}

// ─── Write YAML character file ────────────────────────────────────────────────
function writeCharacterYaml(filePath, data) {
  // Use literal block scalar (|) for description to avoid escaping issues
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
  
  if (!DRY_RUN) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
}

// ─── Determine action for each character ──────────────────────────────────────
function determineAction(sourceSlug, targetSlugsMap) {
  // Direct match
  if (targetSlugsMap.has(sourceSlug)) {
    return { action: 'MERGE', targetSlug: sourceSlug, targetFile: targetSlugsMap.get(sourceSlug) };
  }
  
  // Check flags
  if (FLAG_VARIANTS[sourceSlug]) {
    return { action: 'FLAG', reason: FLAG_VARIANTS[sourceSlug] };
  }
  
  // Check skip list
  if (SKIP_SLUGS.has(sourceSlug)) {
    return { action: 'SKIP', reason: 'Manually listed for skip' };
  }
  
  return { action: 'CREATE' };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Character Integration: Flowers from the Red Soil → LF2077  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('  ⚡ DRY RUN MODE — no files will be written\n');
  
  // Get all source directories
  const sourceDirs = fs.readdirSync(SOURCE_ROOT).filter(d => {
    const full = path.join(SOURCE_ROOT, d);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'entry.md'));
  });
  
  console.log(`📂 Found ${sourceDirs.length} source characters\n`);
  
  // Get all existing target files
  const existingFiles = fs.readdirSync(TARGET_DIR)
    .filter(f => f.endsWith('.yaml') && f.startsWith('char_'))
    .map(f => ({ name: f, slug: f.replace(/^char_/, '').replace(/\.yaml$/, '') }));
  
  const targetSlugsMap = new Map();
  for (const file of existingFiles) {
    // Normalize underscores to hyphens for comparison with source slugs
    const normalizedSlug = file.slug.replace(/_/g, '-');
    targetSlugsMap.set(normalizedSlug, file.name);
  }
  
  console.log(`📁 Found ${existingFiles.length} existing target character files\n`);
  
  // Process each source character
  const results = {
    created: [],
    merged: [],
    flagged: [],
    skipped: [],
    errors: [],
  };
  
  for (const dir of sourceDirs) {
    const slug = dir.replace(/-[0-9][A-Za-z0-9]+$/, '').trim();  // Remove UUID suffix (starts with digit)
    
    // Read source files
    const entryPath = path.join(SOURCE_ROOT, dir, 'entry.md');
    const metadataPath = path.join(SOURCE_ROOT, dir, 'metadata.json');
    
    try {
      const entryContent = fs.readFileSync(entryPath, 'utf8');
      const { frontmatter, body } = parseEntryMd(entryContent);
      const name = frontmatter.name || dir.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      
      // Determine action
      const { action, targetSlug, targetFile, reason } = determineAction(slug, targetSlugsMap);
      
      if (action === 'FLAG') {
        results.flagged.push({ name, slug, reason });
        console.log(`🚩 FLAG  : ${name} (${slug}) — ${reason}`);
        continue;
      }
      
      if (action === 'SKIP') {
        results.skipped.push({ name, slug, reason });
        console.log(`⏭️  SKIP  : ${name} (${slug}) — ${reason}`);
        continue;
      }
      
      if (action === 'MERGE') {
        // Read existing YAML and enrich
        const existingPath = path.join(TARGET_DIR, targetFile);
        const existing = parseExistingYaml(existingPath);
        
        if (!existing) {
          results.errors.push({ name, slug, error: 'Failed to parse existing YAML' });
          console.log(`❌ ERROR : ${name} (${slug}) — Failed to parse existing YAML`);
          continue;
        }
        
        // Synthesize new description from source
        const newDescription = synthesizeDescription(body, name);
        
        // Only update if source has more detail
        if (newDescription.length > existing.description.length) {
          // Enrich the existing description with source details
          const enrichedDescription = `${existing.description} ${newDescription}`;
          
          // Keep under 600 chars
          let finalDesc = enrichedDescription;
          if (finalDesc.length > 600) {
            const cut = finalDesc.substring(0, 597);
            const lastPeriod = cut.lastIndexOf('.');
            finalDesc = lastPeriod > 200 ? cut.substring(0, lastPeriod + 1) : cut + '...';
          }
          
          const mergedData = {
            id: existing.id,  // Preserve existing UUID
            name: existing.name,  // Preserve existing name
            title: existing.title,  // Preserve existing title
            description: finalDesc,
            metadata: {
              type: existing.metadata?.type || 'human',
              role: existing.metadata?.role || 'npc',
              faction: existing.metadata?.faction || inferFaction(body),
              personality: existing.metadata?.personality || inferPersonality(body, ''),
            },
          };
          
          writeCharacterYaml(existingPath, mergedData);
          results.merged.push({ name, slug, file: targetFile, enriched: true });
          console.log(`🔄 MERGE : ${name} (${slug}) → ${targetFile} (enriched)`);
        } else {
          results.merged.push({ name, slug, file: targetFile, enriched: false });
          console.log(`✅ MERGE : ${name} (${slug}) → ${targetFile} (already sufficient)`);
        }
        continue;
      }
      
      if (action === 'CREATE') {
        // Check for filename conflicts
        const targetSlug = slug.replace(/-/g, '_');
        const targetFileName = `char_${targetSlug}.yaml`;
        const targetFilePath = path.join(TARGET_DIR, targetFileName);
        
        // If file already exists (different slug match), flag it
        if (fs.existsSync(targetFilePath)) {
          results.flagged.push({ name, slug, reason: `Target file ${targetFileName} already exists` });
          console.log(`🚩 FLAG  : ${name} (${slug}) — target file exists: ${targetFileName}`);
          continue;
        }
        
        const id = randomUUID();
        const description = synthesizeDescription(body, name);
        const title = inferTitle(body, name);
        const faction = inferFaction(body);
        const personality = inferPersonality(body, title);
        
        const data = {
          id,
          name,
          title,
          description,
          metadata: {
            type: 'human',
            role: 'npc',
            faction,
            personality,
          },
        };
        
        writeCharacterYaml(targetFilePath, data);
        results.created.push({ name, slug, file: targetFileName });
        console.log(`✨ CREATE: ${name} (${slug}) → ${targetFileName}`);
        continue;
      }
      
    } catch (e) {
      results.errors.push({ name: dir, slug, error: e.message });
      console.log(`❌ ERROR : ${dir} — ${e.message}`);
    }
  }
  
  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('📊 INTEGRATION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  ✨ Created : ${results.created.length} new characters`);
  console.log(`  🔄 Merged  : ${results.merged.length} existing characters`);
  console.log(`  🚩 Flagged : ${results.flagged.length} edge cases for review`);
  console.log(`  ⏭️  Skipped : ${results.skipped.length} characters`);
  console.log(`  ❌ Errors  : ${results.errors.length} failures`);
  console.log('─'.repeat(60));
  
  if (results.created.length > 0) {
    console.log('\n✨ Created files:');
    for (const c of results.created) {
      console.log(`  - ${c.file} (${c.name})`);
    }
  }
  
  if (results.merged.filter(m => m.enriched).length > 0) {
    console.log('\n🔄 Enriched files:');
    for (const m of results.merged.filter(m => m.enriched)) {
      console.log(`  - ${m.file} (${m.name})`);
    }
  }
  
  if (results.flagged.length > 0) {
    console.log('\n🚩 Flagged for review:');
    for (const f of results.flagged) {
      console.log(`  - ${f.name} (${f.slug}): ${f.reason}`);
    }
  }
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const e of results.errors) {
      console.log(`  - ${e.name}: ${e.error}`);
    }
  }
  
  // ─── Write flagged items to PENDING.md ────────────────────────────────────────
  if (results.flagged.length > 0 && !DRY_RUN) {
    const flagSection = results.flagged.map(f => 
      `| ${f.slug} | ${f.name} | ${f.reason} |`
    ).join('\n');
    
    const flagEntry = `
## Character Integration Name Variants (2026-06-30)

These characters from the "Flowers from the Red Soil" codex have ambiguous identity matches with existing YAML files and need manual review.

| Source Slug | Source Name | Reason for Flag |
|---|---|---|
${flagSection}

### Resolution Needed
- [ ] Verify each flagged character's identity against the target YAML
- [ ] Either merge into existing file or create separate YAML
- [ ] Remove entries from this table once resolved
`;

    // Append to PENDING.md
    const existingPending = fs.readFileSync(FLAG_FILE, 'utf8');
    if (!existingPending.includes('Character Integration Name Variants')) {
      fs.writeFileSync(FLAG_FILE, existingPending.trimEnd() + '\n\n' + flagEntry, 'utf8');
      console.log(`\n📝 Flagged items written to ${FLAG_FILE}`);
    } else {
      console.log(`\n📝 Flagged section already exists in ${FLAG_FILE} — skipping duplicate write`);
    }
  }
  
  // ─── Verify all YAML files ────────────────────────────────────────────────────
  console.log('\n🔍 Verifying all YAML files in content/characters/...');
  let parseOk = 0;
  let parseFail = 0;
  
  const allYamlFiles = fs.readdirSync(TARGET_DIR).filter(f => f.endsWith('.yaml'));
  for (const f of allYamlFiles) {
    try {
      const content = fs.readFileSync(path.join(TARGET_DIR, f), 'utf8');
      yaml.load(content);
      parseOk++;
    } catch (e) {
      console.log(`  ❌ Parse FAIL: ${f} — ${e.message}`);
      parseFail++;
    }
  }
  
  console.log(`  ✅ Parsed: ${parseOk}  ❌ Failed: ${parseFail}`);
  
  // ─── Check for duplicate UUIDs ────────────────────────────────────────────────
  console.log('\n🔍 Checking for duplicate UUIDs...');
  const uuids = new Map();
  let dupCount = 0;
  
  for (const f of allYamlFiles) {
    try {
      const content = fs.readFileSync(path.join(TARGET_DIR, f), 'utf8');
      const doc = yaml.load(content);
      if (doc?.id) {
        if (uuids.has(doc.id)) {
          console.log(`  ⚠️  Duplicate UUID ${doc.id}: ${f} and ${uuids.get(doc.id)}`);
          dupCount++;
        } else {
          uuids.set(doc.id, f);
        }
      }
    } catch {}
  }
  
  console.log(`  ✅ Unique UUIDs: ${uuids.size}  ⚠️ Duplicates: ${dupCount}`);
  
  console.log('\n✅ Integration complete!');
}

main();