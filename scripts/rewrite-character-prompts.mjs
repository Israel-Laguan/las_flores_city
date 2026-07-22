import fs from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = path.resolve('content/characters');

function parseYamlSimple(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const get = (key) => {
    const m = content.match(new RegExp(`^\\s*${key}:\\s*"?([^\\n]*?)"?\\s*$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const descMatch = content.match(/^description:\s*\n([\s\S]*?)(?=\n\w|\n\s*\w|$)/m);
  let description = '';
  if (descMatch) {
    description = descMatch[1].split('\n').map(l => l.replace(/^\s+/, '')).filter(Boolean).join('\n').trim();
  }
  if (!description) {
    description = get('description');
  }
  
  // extract metadata
  const extractMeta = (key) => {
    const m = content.match(new RegExp(`^\\s*${key}:\\s*"?([^\\n]*?)"?\\s*$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  }

  return {
    name: get('name'),
    title: get('title'),
    description,
    faction: extractMeta('faction'),
    age: extractMeta('age'),
    ethnicity: extractMeta('ethnicity'),
    physical: extractMeta('physical_description'),
    occupation: extractMeta('occupation')
  };
}

const dirs = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let updatedCount = 0;

for (const slug of dirs) {
  const dir = path.join(CONTENT_DIR, slug);
  const yamlPath = path.join(dir, `char_${slug}.yaml`);
  const promptPath = path.join(dir, `${slug}.prompt.md`);
  
  if (!fs.existsSync(yamlPath) || !fs.existsSync(promptPath)) continue;
  
  // Skip if it looks like it was manually written (doesn't have "Auto-generated" marker)
  const currentPromptContent = fs.readFileSync(promptPath, 'utf-8');
  if (!currentPromptContent.includes('Auto-generated') && !currentPromptContent.includes('Draft Prompt (short)')) {
    continue; 
  }

  const data = parseYamlSimple(yamlPath);
  if (!data.name) continue;

  let physicalDesc = data.physical;
  if (!physicalDesc) {
      // Try to extract from full description
      const buildMatch = data.description.match(/(lean|solid|athletic|heavy|slender|broad|tall|short)[^.]+/i);
      const hairMatch = data.description.match(/(dark|light|curly|straight|short|long)\s+hair/i);
      if (buildMatch || hairMatch) {
          physicalDesc = `They have ${buildMatch ? 'a ' + buildMatch[0] : 'an average build'}${hairMatch ? ' and ' + hairMatch[0] : ''}.`;
      } else {
          physicalDesc = "Distinctive appearance fitting their role.";
      }
  } else {
      // Capitalize first letter and ensure it ends with period
      physicalDesc = physicalDesc.charAt(0).toUpperCase() + physicalDesc.slice(1);
      if (!physicalDesc.endsWith('.')) physicalDesc += '.';
  }
  
  let age = data.age || "adult";
  if (/^\d+$/.test(age)) age = age + "-year-old";
  
  let ethnicity = data.ethnicity ? `of ${data.ethnicity} descent` : "";
  
  let backdrop = "";
  if (data.faction === 'law_enforcement' || data.faction === 'l') {
      backdrop = "a formal civic administration building office with warm wood tones, a large wooden desk, and a window showing a twilight sky over an urban Latin American neighborhood.";
  } else if (data.faction === 'lw_group' || slug.includes('student')) {
      backdrop = "a university campus plaza with weathered stone architecture and native plants under bright natural tropical sunlight, creating soft volumetric depth.";
  } else if (data.faction === 'syndicate') {
      backdrop = "a dimly lit back room of an industrial warehouse, featuring worn brick walls, metal cargo crates, and harsh dramatic artificial lighting.";
  } else if (slug.includes('barista') || slug.includes('cafe')) {
      backdrop = "the interior of a worn café featuring a wooden bar counter, an old espresso machine, exposed brick walls, and warm amber lamp glow.";
  } else {
      backdrop = "a busy working-class street corner in a Latin American urban district, featuring faded pastel plaster buildings, street food stalls, and warm natural sunlight.";
  }

  const newPrompt = `---
name: ${data.name}
type: portrait
size: 1024x1024
source: content/characters/${slug}/${slug}.md
target: \`portrait_urls[].url\` in \`content/characters/${slug}/char_${slug}.yaml\`
consumer: portrait
---

# Prompt: ${data.name}

[CONSUMER: portrait]
**Type:** portrait
**Target field:** \`portrait_urls[].url\` in \`content/characters/char_${slug}.yaml\`
**Tool:** MidJourney --v 6 --ar 3:4 --style raw

## Prompt
Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of ${data.name}, a ${age} ${data.title} ${ethnicity}. ${physicalDesc} They wear practical clothing suited for their environment. The backdrop is ${backdrop} Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates.

## Negative Prompt
photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, neon, androids, robots, modern clothing, guns, extreme violence
`;

  fs.writeFileSync(promptPath, newPrompt, 'utf-8');
  updatedCount++;
}

console.log(`Successfully rewritten ${updatedCount} auto-generated character prompts.`);
