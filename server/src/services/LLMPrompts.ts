import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import type { ExistingContentContext } from './types/LLMTypes.js';

// ── Content Types ──────────────────────────────────────────────────────

const CONTENT_TYPES = [
  'character', 'dialogue', 'scene', 'overlay', 'mission',
  'story', 'shop_item', 'location', 'map_tile', 'story_beat', 'gig', 'vault',
];

// ── System Prompt Builder ────────────────────────────────────────────────

export function buildSystemPrompt(context: ExistingContentContext): string {
  const existingChars = context.characters.map((c) => `${c.name} (id: ${c.id})`).join(', ') || '(none)';
  const existingScenes = context.scenes.map((s) => `${s.name} (id: ${s.id})`).join(', ') || '(none)';
  const existingDialogues = context.dialogues.map((d) => `${d.name} (id: ${d.id})`).join(', ') || '(none)';
  const existingMissions = context.missions.map((m) => `${m.title} (id: ${m.id})`).join(', ') || '(none)';
  const existingStories = context.stories.map((s) => `${s.name} (id: ${s.id})`).join(', ') || '(none)';
  const existingOverlays = context.overlays.map((o) => `${o.name} (id: ${o.id})`).join(', ') || '(none)';
  const existingLocations = context.locations.map((l) => `${l.name} (id: ${l.id})`).join(', ') || '(none)';

  return `You are a content planning assistant for Las Flores 2077, a narrative cyberpunk game.

## Task
Given a user's natural-language description, produce a ContentPlan — a list of content items to create or update.

## Available content types
${CONTENT_TYPES.join(', ')}

## Required fields per content type
- character: name, description, title (optional), metadata.type, metadata.role, metadata.faction, metadata.personality, lore_path, narrative_path
- scene: name, description, district, mood, lore_path
- dialogue: name, description, lore_path
- overlay: name, description, target_tree_id, modifications, lore_path
- mission: title, description, lore_path
- story: name, description, beats
- shop_item: name, description, price, currency
- location: name, description, district, tags, history, daytime, nightlife, lore_path
- map_tile: district_id, x, y, terrain_type
- story_beat: id, description
- gig: name, description, reward
- vault: name, description, item_type

## Existing content (avoid duplicates)
- Characters: ${existingChars}
- Scenes: ${existingScenes}
- Dialogues: ${existingDialogues}
- Missions: ${existingMissions}
- Stories: ${existingStories}
- Overlays: ${existingOverlays}
- Locations: ${existingLocations}

## Output format
Return a single JSON object matching this schema:
{
  "id": "<UUID>",
  "description": "<summary of the plan>",
  "items": [
    {
      "id": "<UUID>",
      "type": "<content type>",
      "action": "create" | "update",
      "name": "<item name>",
      "description": "<brief description of the content item>",
      "slug": "<lowercase_snake_case slug>",
      "fields": { ... },
      "assetNeeds": [],
      "dependsOn": []
    }
  ],
  "links": [],
  "status": "draft"
}

## Rules
1. Pre-generate a UUID v4 for the plan id and every item id. Use standard UUID format.
2. Slugs must be lowercase alphanumeric with underscores only (e.g. "diego_the_bartender").
3. If the description references an existing character or scene, use action "update" and include the existing id in fields.
4. Keep fields realistic — use the Las Flores 2077 cyberpunk setting.
5. Output ONLY the JSON object, no markdown fences or explanation.`;
}

// ── Refinement Prompt Builder ───────────────────────────────────────────

export function buildRefinementPrompt(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): string {
  const existingChars = context.characters.map((c) => `${c.name} (id: ${c.id})`).join(', ') || '(none)';
  const existingScenes = context.scenes.map((s) => `${s.name} (id: ${s.id})`).join(', ') || '(none)';
  const existingDialogues = context.dialogues.map((d) => `${d.name} (id: ${d.id})`).join(', ') || '(none)';
  const existingMissions = context.missions.map((m) => `${m.title} (id: ${m.id})`).join(', ') || '(none)';
  const existingStories = context.stories.map((s) => `${s.name} (id: ${s.id})`).join(', ') || '(none)';
  const existingOverlays = context.overlays.map((o) => `${o.name} (id: ${o.id})`).join(', ') || '(none)';
  const existingLocations = context.locations.map((l) => `${l.name} (id: ${l.id})`).join(', ') || '(none)';

  return `You are a content planning assistant for Las Flores 2077, a narrative cyberpunk game.

## Task
The user has reviewed a content plan and provided feedback. Adjust the plan accordingly.

## Current plan
${JSON.stringify(existingPlan, null, 2)}

## User feedback
${feedback}

## Available content types
${CONTENT_TYPES.join(', ')}

## Required fields per content type
- character: name, description, title (optional), metadata.type, metadata.role, metadata.faction, metadata.personality, lore_path, narrative_path
- scene: name, description, district, mood, lore_path
- dialogue: name, description, lore_path
- overlay: name, description, target_tree_id, modifications, lore_path
- mission: title, description, lore_path
- story: name, description, beats
- shop_item: name, description, price, currency
- location: name, description, district, tags, history, daytime, nightlife, lore_path
- map_tile: district_id, x, y, terrain_type
- story_beat: id, description
- gig: name, description, reward
- vault: name, description, item_type

## Existing content (avoid duplicates)
- Characters: ${existingChars}
- Scenes: ${existingScenes}
- Dialogues: ${existingDialogues}
- Missions: ${existingMissions}
- Stories: ${existingStories}
- Overlays: ${existingOverlays}
- Locations: ${existingLocations}

## Output format
Return a single JSON object matching the ContentPlan schema. Keep the same plan id. Keep items that the user didn't ask to change. Output ONLY the JSON object, no markdown fences or explanation.`;
}

// ── Lore Generation Prompt ─────────────────────────────────────────────

export function buildLorePrompt(item: ContentPlanItem, context: ExistingContentContext): string {
  const existingChars = context.characters.map((c) => c.name).join(', ') || '(none)';
  const existingScenes = context.scenes.map((s) => `${s.name} (${s.district})`).join(', ') || '(none)';

  let structureGuide = '';
  switch (item.type) {
    case 'character':
      structureGuide = `Write character lore in the style of cyberpunk Las Flores 2077. Include:
- H1 title with character name
- Title fields (full and short)
- Age, Origin, Occupation
- Multi-paragraph description covering: physical appearance, personality, challenges, vision/goals
- A "Key Relationships" table with Name/Nature/Notes columns
- A "Known Habit" section describing recurring behaviors`;
      break;
    case 'scene':
    case 'location':
      structureGuide = `Write location/scene lore in the style of cyberpunk Las Flores 2077. Include:
- H1 title with location/scene name
- Tags block (e.g., "> Tags: downtown, neon, rain")
- District metadata
- "## Overview" with narrative paragraphs describing atmosphere and notable features
- "## Related Lore" section with relative markdown links to related characters or stories`;
      break;
    case 'mission':
    case 'story':
      structureGuide = `Write mission/story lore in the style of cyberpunk Las Flores 2077. Include:
- H1 title
- Tags block
- Location/period metadata
- "## Overview" with narrative paragraphs
- Section headers for story beats
- "## Related Lore" with relative markdown links`;
      break;
    case 'dialogue':
    case 'overlay':
    case 'vault':
    case 'gig':
    case 'shop_item':
      structureGuide = `Write lore for this item in the style of cyberpunk Las Flores 2077. Include:
- H1 title with item name
- Description and narrative context explaining the item's role in the world`;
      break;
    default:
      structureGuide = `Write narrative lore for this content item in the style of cyberpunk Las Flores 2077. Include:
- H1 title with item name
- Description and narrative context`;
  }

  return `You are a lore writer for Las Flores 2077, a narrative cyberpunk roleplaying game set in a rain-soaked city of neon and corporate intrigue.

## Task
 Write rich, immersive markdown narrative content for the following item.

## Item Details
 - Type: ${item.type}
 - Name: ${item.name}
 - Description: ${item.fields.description || 'No description provided'}

${structureGuide}

## Existing Content (for reference)
 - Characters: ${existingChars}
 - Scenes/Locations: ${existingScenes}

## Output Format
 Return ONLY the markdown content. Do NOT wrap it in code fences or JSON. Do NOT include any explanatory text outside the markdown.`;
}
