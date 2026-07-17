#!/usr/bin/env node
/**
 * generate-missing-content.mjs
 *
 * For each character folder that has a YAML but is missing lore .md and prompt .md,
 * generates both from the YAML data. Creates the assets/ directory too.
 *
 * Usage: node scripts/generate-missing-content.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = path.resolve('content/characters');
const DRY_RUN = process.argv.includes('--dry-run');

function findIncompleteCharacters() {
  const dirs = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const incomplete = [];
  for (const slug of dirs) {
    const dir = path.join(CONTENT_DIR, slug);
    const yamlPath = path.join(dir, `char_${slug}.yaml`);
    if (!fs.existsSync(yamlPath)) continue;

    const hasMd = fs.existsSync(path.join(dir, `${slug}.md`));
    const hasPrompt = fs.existsSync(path.join(dir, `${slug}.prompt.md`));
    const hasAssets = fs.existsSync(path.join(dir, 'assets'));

    if (!hasMd || !hasPrompt || !hasAssets) {
      incomplete.push({ slug, dir, yamlPath, hasMd, hasPrompt, hasAssets });
    }
  }
  return incomplete;
}

function parseYamlSimple(filePath) {
  // Minimal YAML parser for the fields we need
  const content = fs.readFileSync(filePath, 'utf-8');
  const get = (key) => {
    const m = content.match(new RegExp(`^\\s*${key}:\\s*"?([^\\n]*?)"?\\s*$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  // Get multi-line description
  const descMatch = content.match(/^description:\s*\n([\s\S]*?)(?=\n\w|\n\s*\w|$)/m);
  let description = '';
  if (descMatch) {
    description = descMatch[1].split('\n').map(l => l.replace(/^\s+/, '')).filter(Boolean).join('\n').trim();
  }
  if (!description) {
    description = get('description');
  }
  return {
    name: get('name'),
    title: get('title'),
    description,
    faction: (() => {
      const m = content.match(/faction:\s*"?([^"\n]+?)"?/);
      return m ? m[1].trim() : '';
    })(),
    personality: (() => {
      const m = content.match(/personality:\s*"?([^"\n]+?)"?/);
      return m ? m[1].trim() : '';
    })(),
    lorePath: get('lore_path'),
    portraitPath: (() => {
      const m = content.match(/portrait:\s*"?([^"\n]+?)"?/);
      return m ? m[1].trim() : '';
    })(),
  };
}

function extractAge(description) {
  const agePatterns = [
    /(\d{2})\s*-?\s*year-?old/i,
    /late\s+(\d{2})s?/i,
    /early\s+(\d{2})s?/i,
    /mid[\s-]+(\d{2})s?/i,
    /in\s+(?:his|her|their)\s+(late|early|mid)\s+(\d{2})s?/i,
    /aged?\s+(\d{2,3})/i,
  ];
  for (const pat of agePatterns) {
    const m = description.match(pat);
    if (m) {
      if (m[2]) return `${m[1]} ${m[2]}s`;
      if (m[1] && /^\d+$/.test(m[1])) return m[1];
      if (m[1]) return `age ${m[1]}`;
    }
  }
  return 'adult';
}

function extractPhysical(description) {
  // Try to find physical description keywords
  const traits = [];
  const patterns = [
    { re: /hair[:\s]+([^.]+)/i, label: 'Hair' },
    { re: /eyes?[:\s]+([^.]+)/i, label: 'Eyes' },
    { re: /build[:\s]+([^.]+)/i, label: 'Build' },
    { re: /skin[:\s]+([^.]+)/i, label: 'Skin' },
    { re: /height[:\s]+([^.]+)/i, label: 'Height' },
  ];
  for (const { re, label } of patterns) {
    const m = description.match(re);
    if (m) traits.push(`${label}: ${m[1].trim()}`);
  }
  if (traits.length > 0) return traits.join('. ');
  return 'Distinctive appearance fitting their background';
}

function extractDistrict(description) {
  const m = description.match(/(?:district|neighborhood|area|sector|zone)[:\s]+([^.]+)/i);
  if (m) return m[1].trim();
  return 'Las Flores';
}

function generateLoreMd(data) {
  const physical = extractPhysical(data.description);
  const age = extractAge(data.description);
  const district = extractDistrict(data.description);

  return `# ${data.name}

**Title:** ${data.title}

**Physical Description:**
- ${physical}

**Description (full):**

${data.description || `${data.name} is a resident of Las Flores, working as ${data.title}.`}

**Age (2077):** ~${age}
**District:** ${district}
**Role:** ${data.title ? data.title.split(',')[0].trim() : 'resident'}
**Descendancy:** ${data.faction || 'Mixed heritage'}
`;
}

function generatePortraitPromptMd(data) {
  const age = extractAge(data.description);
  const district = extractDistrict(data.description);
  const physical = extractPhysical(data.description);

  const negatives = '--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural';

  const ageLabel = /^\d+$/.test(age) ? age + '-year-old' : age;

  const draftPrompt = `[CONSUMER: portrait] ${data.name}, ${ageLabel} ${data.title || 'resident'}, ${district}. ${physical}. Calm and determined expression. Practical clothing suited to their environment, personal items reflecting their role. ${district} cityscape. Atmospheric lighting, soft shadows. ${negatives} Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k. Transparent background, 3:4 aspect ratio, 512×768.`;

  const fullPrompt = `[CONSUMER: portrait]
Bust portrait of ${data.name}, a ${ageLabel} ${data.title || 'resident'} from Las Flores's ${district}.
${physical}.
Calm and determined expression.
Dressed in practical clothing suited to their environment, with personal items reflecting their role.
Background: ${district} cityscape, atmospheric lighting.
${negatives}
Photorealistic portrait, hyper-detailed, grounded human anatomy with natural asymmetry, 8k.
Transparent background, 3:4 aspect ratio, 512×768.`;

  return `# Portrait Prompt — ${data.name}

> Auto-generated from character YAML by \`scripts/generate-missing-content.mjs\`

## Draft Prompt (short)

${draftPrompt}

## Full Prompt

${fullPrompt}

## Source

\`\`\`yaml
name: ${data.name}
title: ${data.title}
faction: ${data.faction}
\`\`\`

---

**Generated:** ${new Date().toISOString()}
`;
}

function fixYamlPaths(yamlPath, slug, data) {
  let content = fs.readFileSync(yamlPath, 'utf-8');
  let changed = false;

  // Add lore_path if missing
  if (!data.lorePath || data.lorePath === '') {
    content += `\nlore_path: ${slug}.md\n`;
    changed = true;
  } else if (data.lorePath.includes('docs/lore')) {
    content = content.replace(/lore_path:\s*.+/, `lore_path: ${slug}.md`);
    changed = true;
  }

  // Fix asset_paths.portrait to use per-folder layout
  if (data.portraitPath && (data.portraitPath.startsWith('characters/') || data.portraitPath.includes('docs/'))) {
    content = content.replace(
      /portrait:\s*.+/,
      `portrait: ${slug}__default.png`
    );
    changed = true;
  } else if (!data.portraitPath || data.portraitPath === '') {
    // Add asset_paths.portrait if missing
    if (content.includes('asset_paths:')) {
      content = content.replace(
        /asset_paths:\s*\n/,
        `asset_paths:\n  portrait: ${slug}__default.png\n`
      );
    } else {
      content += `\nasset_paths:\n  portrait: ${slug}__default.png\n`;
    }
    changed = true;
  }

  if (changed && !DRY_RUN) {
    fs.writeFileSync(yamlPath, content, 'utf-8');
  }
  return changed;
}

// ── Main ────────────────────────────────────────────────────────────────────

const incomplete = findIncompleteCharacters();
console.log(`\n🔍 Found ${incomplete.length} incomplete character folders\n`);

let generated = 0, skipped = 0, fixed = 0;

for (const { slug, dir, yamlPath, hasMd, hasPrompt, hasAssets } of incomplete) {
  const data = parseYamlSimple(yamlPath);

  if (!data.name) {
    console.log(`  ⚠️  ${slug}: no name in YAML, skipping`);
    skipped++;
    continue;
  }

  console.log(`  📝 ${slug} (${data.name})`);

  // Generate lore .md if missing
  if (!hasMd) {
    const lorePath = path.join(dir, `${slug}.md`);
    const loreContent = generateLoreMd(data);
    if (!DRY_RUN) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(lorePath, loreContent, 'utf-8');
    }
    console.log(`    ✅ Created ${slug}.md`);
    generated++;
  }

  // Generate prompt .md if missing
  if (!hasPrompt) {
    const promptPath = path.join(dir, `${slug}.prompt.md`);
    const promptContent = generatePortraitPromptMd(data);
    if (!DRY_RUN) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(promptPath, promptContent, 'utf-8');
    }
    console.log(`    ✅ Created ${slug}.prompt.md`);
    generated++;
  }

  // Create assets/ directory if missing
  if (!hasAssets) {
    const assetsDir = path.join(dir, 'assets');
    if (!DRY_RUN) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    console.log(`    ✅ Created assets/`);
    generated++;
  }

  // Fix YAML paths
  const yamlFixed = fixYamlPaths(yamlPath, slug, data);
  if (yamlFixed) {
    console.log(`    ✅ Fixed YAML paths`);
    fixed++;
  }
}

console.log(`\n📊 Results: ${generated} files created, ${fixed} YAMLs fixed, ${skipped} skipped`);
if (DRY_RUN) console.log('   (dry run — no files written)');
