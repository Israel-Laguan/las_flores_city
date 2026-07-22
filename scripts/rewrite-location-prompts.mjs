import fs from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = path.resolve('content/locations');

const dirs = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let updatedCount = 0;

for (const slug of dirs) {
  const dir = path.join(CONTENT_DIR, slug);
  const promptPath = path.join(dir, `${slug}.prompt.md`);
  
  if (!fs.existsSync(promptPath)) continue;
  
  const currentPromptContent = fs.readFileSync(promptPath, 'utf-8');
  
  // Skip if it doesn't have the boilerplate text, which means it was already manually fixed
  if (!currentPromptContent.includes('Warm artificial streetlight glow') && !currentPromptContent.includes('neon signs reflecting')) {
    continue; 
  }

  // Determine visual backdrop based on name
  let visualDesc = "";
  if (slug.includes('mountain') || slug.includes('andean') || slug.includes('cerro') || slug.includes('montana')) {
      visualDesc = "Andean foothills at dawn, mist rolling down the slopes, ancient trees clinging to rocky terrain, muted blues and greens, faint distant city lights. Graphic novel realism, painterly soft shading, muted desaturated palette, ultra-clean 4k. No people, no text, no logos.";
  } else if (slug.includes('ocean') || slug.includes('bahia') || slug.includes('port') || slug.includes('dock') || slug.includes('acuario')) {
      visualDesc = "Rugged coastal harbor at sunset, weathered wooden docks, choppy ocean water, deep blue-gray surf crashing against rocks, coastal fog. Graphic novel realism, painterly soft shading, muted desaturated palette, ultra-clean 4k. No people, no text, no logos.";
  } else if (slug.includes('river') || slug.includes('rio')) {
      visualDesc = "Murky river winding through an urban industrial sector at dawn, banks lined with weathered concrete, sickly greenish glow reflecting on the water surface. Graphic novel realism, painterly soft shading, muted desaturated palette, ultra-clean 4k. No people, no text, no logos.";
  } else if (slug.includes('police') || slug.includes('station') || slug.includes('hall') || slug.includes('civic') || slug.includes('council')) {
      visualDesc = "Historic civic square with wet cobblestone paving, towering neoclassic stone municipal buildings, warm amber streetlights, and architectural arches. Graphic novel realism, painterly soft shading, warm palette, ultra-clean 4k. No people, no text, no logos.";
  } else if (slug.includes('plant') || slug.includes('industrial') || slug.includes('warehouse') || slug.includes('factory')) {
      visualDesc = "Imposing industrial manufacturing zone at dusk, wet oil-stained pavement, massive concrete factories with towering smokestacks, harsh artificial lighting. Graphic novel realism, painterly soft shading, high contrast, ultra-clean 4k. No people, no text, no logos.";
  } else {
      visualDesc = "Urban mixed-use district at midday, faded pastel plaster buildings with rounded corners, small storefronts, cracked sidewalks, and a network of cableways stretching across the clear sky. Graphic novel realism, painterly soft shading, warm natural sunlight, ultra-clean 4k. No people, no text, no logos.";
  }

  // Extract frontmatter
  const frontmatterMatch = currentPromptContent.match(/^---[\s\S]*?---\n/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[0] : '';
  
  // Extract Name from existing file
  const nameMatch = currentPromptContent.match(/name:\s*(.+)/);
  const readableName = nameMatch ? nameMatch[1] : slug;

  const newPrompt = `${frontmatter}
# Prompt: ${readableName}

[CONSUMER: background]
**Type:** background
**Tool:** MidJourney --v 6 --ar 16:9 --style raw

## Prompt
${readableName}. ${visualDesc}

## Negative Prompt
photorealistic, 3D render, anime, cartoon, text, watermarks, blurry, low quality, neon, androids, robots, pristine environments
`;

  fs.writeFileSync(promptPath, newPrompt, 'utf-8');
  updatedCount++;
}

console.log(`Successfully rewritten ${updatedCount} location prompts.`);
