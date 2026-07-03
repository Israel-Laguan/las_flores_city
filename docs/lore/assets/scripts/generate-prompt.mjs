#!/usr/bin/env node

/**
 * generate-prompt.mjs
 *
 * Reads lore markdown files from docs/lore/ and generates .prompt.md files
 * co-located next to the source. Each .prompt.md contains a copy-pasteable
 * AI prompt for generating an asset (image, audio, video).
 *
 * Usage:
 *   node generate-prompt.mjs --type portrait --source docs/lore/figures/miguel_jhonson.md
 *   node generate-prompt.mjs --type portrait --batch docs/lore/figures/
 *   node generate-prompt.mjs --type portrait --batch docs/lore/figures/ --force
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────────

const UNIVERSAL_NEGATIVES =
  '--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural';

const PROMPT_TYPES = [
  'portrait',
  'background',
  'tile',
  'overlay',
  'thematic',
  'ambient',
  'sfx',
  'music',
  'phone-wallpaper',
  'app-icon',
];

// ── Template Library ────────────────────────────────────────────────────────

const TEMPLATES = {
  /**
   * portrait – for character portraits (MidJourney, --ar 3:4)
   * Source: docs/lore/figures/<name>.md
   * Target: content/characters/char_<name>.yaml → portrait_urls[].url
   */
  portrait({ name, age, role, district, physical, expression, clothing, accessories, setting, lighting, shadows, mood, heritage, negatives }) {
    const physicalDesc = (physical && physical !== 'Distinctive appearance') ? physical : 'distinctive appearance fitting their background';
    const expressionDesc = (expression && expression !== 'undefined') ? expression : 'calm and determined';
    const clothingDesc = (clothing && clothing !== 'undefined') ? clothing : 'practical clothing suited to their environment';
    const accessoriesDesc = (accessories && accessories !== 'undefined') ? accessories : 'personal items reflecting their role';

    return `# Prompt: ${name}

[CONSUMER: portrait]
**Type:** portrait
**Source:** docs/lore/figures/${slugify(name)}.md
**Target field:** \`portrait_urls[].url\` in \`content/characters/char_${slugify(name)}.yaml\`
**Tool:** MidJourney --v 6 --ar 3:4 --style raw

## Prompt
Photorealistic portrait of ${name}, a ${/^\d+$/.test(age) ? age + '-year-old' : age} ${role} from Las Flores's ${district}. ${physicalDesc}. ${expressionDesc}. Dressed in ${clothingDesc}, with ${accessoriesDesc}. Background: ${setting}. Lighting: ${lighting}, casting ${shadows}. ${mood}. ${heritage ? `Multicultural heritage (${heritage}),` : ''} emotional depth, 8K.

## Negative Prompt
--no neon, no androids, no clean backgrounds, no modern clothing${negatives ? `, ${negatives}` : ''}

## Variations
- [ ] Action shot: ${name} in their element
- [ ] Emotional: ${name} in a quiet moment
- [ ] Group: ${name} with their closest allies
`;
  },

  /**
   * background – for location scene backgrounds (MidJourney, --ar 16:9)
   * Source: docs/lore/landmarks/<name>.md
   * Target: content/locations/location_<name>.yaml → scene.background_url
   */
  background({ name, timeOfDay, keyElements, lighting, atmosphere, mood, contrast }) {
    return `# Prompt: ${name}

[CONSUMER: html-background]
**Type:** background
**Source:** docs/lore/landmarks/${slugify(name)}.md
**Target field:** \`scene.background_url\` in \`content/locations/location_${slugify(name)}.yaml\`
**Tool:** MidJourney --v 6 --ar 16:9 --style raw

## Prompt
Photorealistic scene of ${name} in Las Flores, ${timeOfDay}, ${keyElements}, ${lighting}, ${atmosphere}, ${mood}${contrast ? `, capturing the contrast between ${contrast}` : ''}. Soft cyberpunk aesthetic, 8K, cinematic, 800×600.

## Negative Prompt
--no androids, no robots, no neon, no people, no clean environments, no cartoonish, no anime

## Variations
- [ ] Night version: same scene at night with different lighting
- [ ] Rainy version: same scene with rain and mood effects
- [ ] Wide shot: broader view of the location
`;
  },

  /**
   * tile – for base terrain tile textures (MidJourney, --ar 1:1)
   * Source: docs/lore/districts/<name>.md
   * Target: content/maps/map_<name>.yaml → base_image_url
   */
  tile({ name, terrainType, description, colors }) {
    return `# Prompt: ${name} (${terrainType} tile)

[CONSUMER: tile]
**Type:** tile
**Source:** docs/lore/districts/${slugify(name)}.md
**Target field:** \`base_image_url\` in \`content/maps/map_${slugify(name)}.yaml\`
**Tool:** MidJourney --v 6 --ar 1:1 --style raw

## Prompt
Seamless top-down tile texture of ${description}, Las Flores 2077, soft cyberpunk aesthetic. ${colors ? `Color palette: ${colors}.` : ''} Photorealistic, 8K, tileable, no objects, no people, no external shadows, no horizon, no sky.

## Negative Prompt
--no androids, no robots, no neon, no modern objects, no buildings
`;
  },

  /**
   * overlay – for landmark overlay images (transparent PNG)
   * Source: docs/lore/landmarks/<name>.md
   * Target: content/maps/map_<district>.yaml → overlay_image_url
   */
  overlay({ name, description }) {
    return `# Prompt: ${name} (landmark overlay)

[CONSUMER: phaser-sprite]
**Type:** overlay
**Source:** docs/lore/landmarks/${slugify(name)}.md
**Target field:** \`overlay_image_url\` in \`content/maps/map_*.yaml\`
**Tool:** MidJourney --v 6 --ar 1:1 --style raw

## Prompt
Top-down view of ${name}, Las Flores 2077, ${description}. Photorealistic, 8K, transparent background, centered composition, no external shadows.

## Negative Prompt
--no androids, no robots, no neon, no modern vehicles, no people
`;
  },

  /**
   * thematic – for symbolic/vault art
   * Source: docs/lore/events/<name>.md
   * Target: Vault entries, loading screens
   */
  thematic({ name, description, contrast, mood }) {
    return `# Prompt: ${name} (thematic art)

**Type:** thematic
**Source:** docs/lore/events/${slugify(name)}.md
**Target:** Vault entry or loading screen
**Tool:** MidJourney --v 6 --ar 16:9 --style raw

## Prompt
Conceptual art capturing ${description} in Las Flores. ${contrast ? `The scene captures the contrast between ${contrast}.` : ''} ${mood}. High contrast, symbolic, environmental storytelling, 8K.

## Negative Prompt
--no utopia, no dystopia, no clean divide, no androids, no robots, no neon
`;
  },

  /**
   * ambient – for ambient audio (Suno)
   * Source: docs/lore/landmarks/<name>.md
   * Target: content/locations/location_<name>.yaml → scene.ambient_sound_url
   */
  ambient({ name, timeOfDay, atmosphere, elements, mood }) {
    return `# Prompt: ${name} (ambient audio)

**Type:** ambient
**Source:** docs/lore/landmarks/${slugify(name)}.md
**Target field:** \`scene.ambient_sound_url\` in \`content/locations/location_${slugify(name)}.yaml\`
**Tool:** Suno

## Prompt
Ambient soundscape of ${name} in Las Flores, ${timeOfDay}. ${atmosphere}. ${elements}. ${mood}. Soft cyberpunk atmosphere, loopable, 60 seconds, no melody, no vocals, environmental recording style.

## Tags
ambient, soundscape, las flores, ${timeOfDay}, ${mood.toLowerCase()}, cyberpunk, environmental
`;
  },

  /**
   * sfx – for sound effects (ElevenLabs)
   * Source: docs/lore/events/<name>.md
   * Target: Sound effect references
   */
  sfx({ name, description, mood }) {
    return `# Prompt: ${name} (sound effect)

**Type:** sfx
**Source:** docs/lore/events/${slugify(name)}.md
**Target:** Sound effect reference
**Tool:** ElevenLabs

## Prompt
Sound effect: ${description}. ${mood}. Short, impactful, cinematic quality, 2-5 seconds.

## Tags
sfx, ${mood.toLowerCase()}, cinematic, las flores
`;
  },

  /**
   * music – for musical themes (Suno)
   * Source: docs/lore/figures/<name>.md or docs/lore/events/<name>.md
   * Target: Musical theme references
   */
  music({ name, role, mood, instruments, tempo }) {
    return `# Prompt: ${name} (musical theme)

**Type:** music
**Source:** docs/lore/figures/${slugify(name)}.md
**Target:** Musical theme reference
**Tool:** Suno

## Prompt
Musical theme for ${name}, ${role}. ${mood}. ${instruments ? `Instruments: ${instruments}.` : ''} ${tempo ? `Tempo: ${tempo}.` : ''} Soft cyberpunk aesthetic, cinematic, emotional, loopable, 30-60 seconds.

## Tags
theme, ${mood.toLowerCase()}, cinematic, las flores, cyberpunk
`;
  },

  /**
   * phone-wallpaper – for phone lock-screen/home-screen wallpapers (MidJourney, --ar 9:16)
   * Target: phone-terminal concept, phone background
   */
  'phone-wallpaper'({ name, description, timeOfDay, mood, colors }) {
    return `# Prompt: ${name} (phone wallpaper)

[CONSUMER: html-background]
**Type:** phone-wallpaper
**Target:** Phone OS home screen wallpaper
**Tool:** MidJourney --v 6 --ar 9:16 --style raw

## Prompt
Phone wallpaper for Las Flores 2077, ${description}. ${timeOfDay}, ${mood}. ${colors ? `Color palette: ${colors}.` : ''} Vertical composition, no text, no logos, soft cyberpunk pastel aesthetic, photorealistic, 1080x1920.

## Negative Prompt
--no androids, no robots, no neon signs, no modern 2020s buildings, no cartoon, no anime, no text, no logos

## Variations
- [ ] Lock screen: same scene with subtle clock-friendly top area
- [ ] Home screen: same scene with app-grid-friendly central area
- [ ] Dark variant: slightly darker, battery-friendly version
`;
  },

  /**
   * app-icon – for phone app icons (MidJourney, --ar 1:1, small)
   * Target: phone-terminal concept, app grid
   */
  'app-icon'({ name, description, iconStyle }) {
    return `# Prompt: ${name} (app icon)

[CONSUMER: phaser-sprite]
**Type:** app-icon
**Target:** Phone OS app grid icon
**Tool:** MidJourney --v 6 --ar 1:1 --style raw

## Prompt
Phone app icon design: ${description}, Las Flores 2077 style, soft cyberpunk pastel, ${iconStyle || 'minimalist geometric icon'}, transparent background, centered, 128x128, sharp edges, no text.

## Negative Prompt
--no text, no complex details, no shadows, no gradients, no neon glow, no cartoon, no anime

## Variations
- [ ] Alt color: same icon in alternate color palette
- [ ] Badge variant: icon with notification badge overlay
- [ ] Disabled variant: grayscale version for locked apps
`;
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
        opts.type = args[++i];
        break;
      case '--source':
        opts.source = args[++i];
        break;
      case '--batch':
        opts.batch = args[++i];
        break;
      case '--force':
        opts.force = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  if (!opts.type) {
    console.error('Error: --type is required');
    console.error('Valid types: ' + PROMPT_TYPES.join(', '));
    process.exit(1);
  }

  if (!PROMPT_TYPES.includes(opts.type)) {
    console.error(`Error: Invalid type "${opts.type}". Valid types: ${PROMPT_TYPES.join(', ')}`);
    process.exit(1);
  }

  if (!opts.source && !opts.batch) {
    console.error('Error: Either --source or --batch is required');
    process.exit(1);
  }

  return opts;
}

function printHelp() {
  console.log(`
generate-prompt.mjs — Generate AI asset prompts from lore files

Usage:
  node generate-prompt.mjs --type <type> --source <file>
  node generate-prompt.mjs --type <type> --batch <directory>
  node generate-prompt.mjs --type <type> --batch <directory> --force

Types:
  ${PROMPT_TYPES.join(', ')}

Options:
  --type      Prompt type (required)
  --source    Single lore file to process
  --batch     Directory of lore files to process
  --force     Overwrite existing .prompt.md files
  --help, -h  Show this help
`);
}

function readLoreFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const meta = {};

  // Extract name from first heading
  const nameMatch = content.match(/^# (.+)$/m);
  meta.name = nameMatch ? nameMatch[1].trim() : path.basename(filePath, '.md');

  // Extract tags
  const tagsMatch = content.match(/> Tags: (.+)$/m);
  if (tagsMatch) {
    meta.tags = tagsMatch[1].split('`').map(t => t.trim()).filter(Boolean);
  }

  // Extract age
  const ageMatch = content.match(/\*\*Age \(2077\):\*\* ~?(\d+)/);
  meta.age = ageMatch ? ageMatch[1] : 'young adult';

  // Extract role (short, readable)
  const roleMatch = content.match(/\*\*Role:\*\* (.+)/);
  meta.role = roleMatch ? roleMatch[1].trim().split(',')[0] : 'resident';

  // Extract district
  const districtMatch = content.match(/\*\*District:\*\* (.+)/);
  meta.district = districtMatch ? districtMatch[1].trim() : 'Las Flores';

  // Extract descendancy/heritage
  const heritageMatch = content.match(/\*\*Descendancy:\*\* (.+)/);
  meta.heritage = heritageMatch ? heritageMatch[1].trim() : '';

  // Extract physical description — clean bullet points, strip markdown
  const physicalSection = extractSection(content, 'Physical Description', 'Personality');
  if (physicalSection) {
    const bullets = physicalSection
      .split('\n')
      .filter(l => l.startsWith('-'))
      .map(l => l.replace(/^-\s*\*{0,2}/, '').replace(/\*{0,2}:\s*/, ': ').replace(/\*{2}/g, '').trim())
      .filter(Boolean);
    meta.physical = bullets.join('. ') || 'Distinctive appearance';
  } else {
    meta.physical = 'Distinctive appearance';
  }

  // Extract visual metaphors / color palette
  const colorMatch = content.match(/\*\*Color Palette:\*\* (.+)/);
  meta.colors = colorMatch ? colorMatch[1].trim() : '';

  // Extract mood from tags or content
  const moodKeywords = ['tense', 'hopeful', 'melancholic', 'gritty', 'serene', 'peaceful', 'foreboding', 'oppressive', 'calm', 'mysterious', 'vibrant', 'dramatic'];
  meta.mood = moodKeywords.find(k => content.toLowerCase().includes(k)) || 'atmospheric';

  // We keep `physical` as the primary descriptor (includes build, movement, presence, style)
  // Don't extract expression/clothing separately to avoid undefined leaks

  // Extract setting — short district/neighborhood reference
  const districtLine = content.match(/\*\*District:\*\* (.+)/);
  meta.setting = districtLine
    ? districtLine[1].trim().substring(0, 100)
    : 'Las Flores cityscape';

  // Lighting defaults based on mood
  const lightingMap = {
    tense: 'dramatic, high contrast',
    hopeful: 'warm golden hour',
    melancholic: 'soft dim, cool tones',
    serene: 'soft natural light',
    foreboding: 'dim, shadowy',
    gritty: 'harsh practical light',
    vibrant: 'bright warm sunlight',
    dramatic: 'cinematic, high contrast',
  };
  meta.lighting = lightingMap[meta.mood] || 'atmospheric';

  // Shadows based on lighting
  meta.shadows = meta.lighting.includes('soft') ? 'soft shadows' : 'sharp shadows';

  // Accessories
  meta.accessories = '';

  return meta;
}

function extractSection(content, sectionName, nextSection) {
  const startMatch = content.match(new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?:\\n## |$)`));
  if (!startMatch) return null;

  let section = startMatch[1].trim();
  if (nextSection) {
    const endIdx = section.indexOf(`\n## ${nextSection}`);
    if (endIdx !== -1) section = section.substring(0, endIdx).trim();
  }
  return section;
}

function extractBackgroundMeta(content) {
  const meta = {};
  meta.name = content.match(/^# (.+)$/m)?.[1]?.trim() || 'Unknown Location';

  // Extract time of day
  const timeKeywords = ['dawn', 'dusk', 'night', 'midday', 'morning', 'afternoon', 'evening', 'sunset', 'sunrise'];
  meta.timeOfDay = timeKeywords.find(k => content.toLowerCase().includes(k)) || 'daytime';

  // Extract mood
  const moodKeywords = ['tense', 'hopeful', 'melancholic', 'gritty', 'serene', 'peaceful', 'foreboding', 'oppressive', 'calm', 'mysterious', 'vibrant'];
  meta.mood = moodKeywords.find(k => content.toLowerCase().includes(k)) || 'atmospheric';

  // Extract key elements from description
  const descSection = extractSection(content, 'Overview', '') || content;
  const bulletPoints = descSection.split('\n').filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
  meta.keyElements = bulletPoints.slice(0, 3).join(', ') || 'Las Flores cityscape';

  // Lighting
  const lightingKeywords = ['golden hour', 'warm', 'cold', 'dim', 'bright', 'moody', 'soft', 'harsh', 'natural', 'industrial'];
  meta.lighting = lightingKeywords.find(k => content.toLowerCase().includes(k)) || 'atmospheric';

  // Atmosphere
  meta.atmosphere = meta.mood;

  return meta;
}

function extractEventMeta(content) {
  const meta = {};
  meta.name = content.match(/^# (.+)$/m)?.[1]?.trim() || 'Unknown Event';

  const moodKeywords = ['tense', 'hopeful', 'melancholic', 'gritty', 'serene', 'urgent', 'dramatic', 'peaceful', 'foreboding'];
  meta.mood = moodKeywords.find(k => content.toLowerCase().includes(k)) || 'dramatic';

  // Extract description
  const firstPara = content.split('\n\n').find(p => p.length > 50 && !p.startsWith('#') && !p.startsWith('>'));
  meta.description = firstPara ? firstPara.replace(/\n/g, ' ').trim() : '';

  return meta;
}

function extractDistrictMeta(content) {
  const meta = {};
  meta.name = content.match(/^# (.+)$/m)?.[1]?.trim() || 'Unknown District';

  const moodKeywords = ['tense', 'hopeful', 'melancholic', 'gritty', 'serene', 'vibrant', 'oppressive', 'calm'];
  meta.mood = moodKeywords.find(k => content.toLowerCase().includes(k)) || 'atmospheric';

  // Extract terrain types from content
  const terrainKeywords = ['street', 'sidewalk', 'sand', 'water', 'grass', 'cobblestone', 'concrete', 'desert', 'asphalt', 'building'];
  meta.terrainType = terrainKeywords.find(k => content.toLowerCase().includes(k)) || 'urban';

  // Extract description
  const firstPara = content.split('\n\n').find(p => p.length > 50 && !p.startsWith('#') && !p.startsWith('>'));
  meta.description = firstPara ? firstPara.replace(/\n/g, ' ').trim() : '';

  return meta;
}

function getOutputPath(sourcePath) {
  const dir = path.dirname(sourcePath);
  const basename = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(dir, `${basename}.prompt.md`);
}

function generatePrompt(type, meta) {
  const template = TEMPLATES[type];
  if (!template) {
    console.error(`Error: No template for type "${type}"`);
    return null;
  }

  try {
    return template(meta);
  } catch (err) {
    console.error(`Error generating ${type} prompt:`, err.message);
    return null;
  }
}

function processFile(filePath, type, force) {
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ File not found: ${filePath}`);
    return false;
  }

  const ext = path.extname(filePath);
  if (ext !== '.md' && ext !== '.yaml' && ext !== '.yml') {
    console.error(`  ⚠️  Skipping non-markdown/YAML file: ${filePath}`);
    return false;
  }

  const outputPath = getOutputPath(filePath);
  if (fs.existsSync(outputPath) && !force) {
    console.log("  ⏭️  Skipping (exists, use --force to overwrite): " + path.basename(outputPath));
    return 'skipped';
  }

  let meta;
  const content = fs.readFileSync(filePath, 'utf-8');

  switch (type) {
    case 'portrait':
    case 'music':
      meta = readLoreFile(filePath);
      break;
    case 'background':
    case 'ambient':
      meta = extractBackgroundMeta(content);
      break;
    case 'thematic':
    case 'sfx':
      meta = extractEventMeta(content);
      break;
    case 'tile':
    case 'overlay':
      meta = extractDistrictMeta(content);
      break;
    default:
      meta = { name: path.basename(filePath, ext) };
  }

  // Add type-specific defaults
  meta.negatives = meta.negatives || '';

  const prompt = generatePrompt(type, meta);
  if (!prompt) return false;

  fs.writeFileSync(outputPath, prompt, 'utf-8');
  console.log(`  ✅ Created: ${path.basename(outputPath)}`);
  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();

  console.log(`\n📝 Generating ${opts.type} prompts...\n`);

  if (opts.source) {
    processFile(opts.source, opts.type, opts.force);
  } else if (opts.batch) {
    const dir = opts.batch;
    if (!fs.existsSync(dir)) {
      console.error(`Error: Directory not found: ${dir}`);
      process.exit(1);
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && !f.endsWith('.prompt.md'))
      .sort();

    if (files.length === 0) {
      console.log(`  No markdown files found in ${dir}`);
      process.exit(0);
    }

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const file of files) {
      const filePath = path.join(dir, file);
      const result = processFile(filePath, opts.type, opts.force);
      if (result === true) success++;
      else if (result === 'skipped') skipped++;
      else failed++;
    }

    console.log("\n📊 Results: " + success + " created, " + skipped + " skipped, " + failed + " failed\n");
  }
}

main();