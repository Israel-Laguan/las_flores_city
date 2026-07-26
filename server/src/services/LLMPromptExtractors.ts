import type { ContentPlanItem } from '@las-flores/shared';
import type { ExistingContentContext } from './types/LLMTypes.js';

export const CONTENT_TYPES = [
  'character', 'dialogue', 'scene', 'overlay', 'mission',
  'story', 'shop_item', 'location', 'map_tile', 'story_beat', 'gig', 'vault',
];

export function buildLorePrompt(item: ContentPlanItem, context: ExistingContentContext): string {
  const existingChars = context.characters.map(c => c.name).join(', ') || '(none)';
  const existingScenes = context.scenes.map(s => s.name).join(', ') || '(none)';
  const existingLocations = context.locations.map(l => l.name).join(', ') || '(none)';

  const currentItemSummary = Object.entries(item.fields)
    .map(([key, value]) => `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('\n');

  const typeInstructions: Record<string, string> = {
    character: 'Write a vivid character description (2-3 sentences) with cyberpunk personality traits.',
    scene: 'Write an atmospheric scene description (2-3 sentences) with lighting, sound, and mood details.',
    dialogue: 'Write a brief dialogue tree description explaining the conversation purpose.',
    overlay: 'Write a description of the dialogue overlay modifications.',
    mission: 'Write a mission brief (2-3 sentences) with objectives and stakes.',
    story: 'Write a story synopsis (3-4 sentences) with key beats.',
    shop_item: 'Write a description (1-2 sentences) for this item in a cyberpunk market.',
     location: 'Write a location description (2-3 sentences) with atmosphere, landmarks, and district character.',
     gig: 'Write a gig description (1-2 sentences) with the job offer and reward details.',
     vault: 'Write a vault description (1-2 sentences) for this collectible or secret.',
     map_tile: 'Write a brief map tile description (1-2 sentences) covering visual/geographic character.',
     story_beat: 'Write a story beat description (2-3 sentences) covering the narrative moment and its stakes.',
   };

  const instructions = typeInstructions[item.type] || typeInstructions.character;

  return `You are a content writer for Las Flores 2077, a narrative cyberpunk game set in a rain-soaked city of neon and corporate intrigue.

## Task
Write lore for a ${item.type} item. Write in a cyberpunk noir tone consistent with the Las Flores 2077 setting.

## Item Details
- Name: ${item.name}
- Type: ${item.type}
- Current fields:
${currentItemSummary}

## Writing instructions
${instructions}

## Existing content (for style/tone reference)
- Characters: ${existingChars}
- Scenes: ${existingScenes}
- Locations: ${existingLocations}

Rules:
- Keep the cyberpunk Las Flores 2077 tone and setting.
- Write 2-3 paragraphs of lore prose/markdown.
- Output ONLY the lore text, no JSON or explanation.`;
}

export function buildEntityExtractionPrompt(context: ExistingContentContext): string {
  const existingChars = context.characters.map(c => c.name).join(', ') || '(none)';
  const existingScenes = context.scenes.map(s => s.name).join(', ') || '(none)';
  const existingLocations = context.locations.map(l => l.name).join(', ') || '(none)';

  return `You are a content planning assistant for Las Flores 2077, a narrative cyberpunk game.

## Task
Extract entity candidates from this story chunk. Identify characters, scenes/locations, missions, stories, and other content items mentioned. Be thorough but concise — just names, types, and brief descriptions.

## Available content types
${CONTENT_TYPES.join(', ')}

## Existing content (avoid duplicates)
- Characters: ${existingChars}
- Scenes: ${existingScenes}
- Locations: ${existingLocations}

## Output format
Return a JSON object with an "entities" array. Each entity has:
- "name": the entity name (string)
- "type": one of the available content types (string)
- "description": a brief 1-sentence description (string)

{
  "entities": [
    { "name": "Victor Crane", "type": "character", "description": "A mysterious informant who operates from a downtown pawn shop." },
    { "name": "Pawn Shop Backroom", "type": "scene", "description": "A dimly lit back room behind a downtown pawn shop." }
  ]
}

Rules:
- Extract ALL named entities: characters, locations, scenes, missions, stories, items.
- Use existing content types only.
- If an entity already exists in the "Existing content" list, still include it (the merge step will dedupe).
- Output ONLY the JSON object, no markdown fences or explanation.`;
}