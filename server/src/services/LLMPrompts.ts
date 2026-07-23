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
  const existingStories = context.stories.map((s) => `${s.title} (id: ${s.id})`).join(', ') || '(none)';
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

// ── Outline Prompt Builder (skeleton with TODO: prose) ─────────────────────

export function buildOutlinePrompt(context: ExistingContentContext): string {
  const depth = process.env.PLAN_OUTLINE_CONTEXT_DEPTH || 'names';

  const formatItem = (c: { id: string; name: string; role?: string; faction?: string; title?: string }) => {
    if (depth === 'names') return c.name;
    return `${c.name} (id: ${c.id})${c.role ? `, role: ${c.role}` : ''}${c.faction ? `, faction: ${c.faction}` : ''}`;
  };

  const existingChars = context.characters.map(formatItem).join(', ') || '(none)';
  const existingScenes = context.scenes.map(s => depth === 'names' ? s.name : `${s.name} (id: ${s.id}, district: ${s.district})`).join(', ') || '(none)';
  const existingDialogues = context.dialogues.map(d => d.name).join(', ') || '(none)';
  const existingMissions = context.missions.map(m => m.title).join(', ') || '(none)';
  const existingStories = context.stories.map(s => s.title).join(', ') || '(none)';
  const existingOverlays = context.overlays.map(o => o.name).join(', ') || '(none)';
  const existingLocations = context.locations.map(l => l.name).join(', ') || '(none)';

  return `You are a content planning assistant for Las Flores 2077, a narrative cyberpunk game.

## Task
Given a user's natural-language description, produce a ContentPlan skeleton with identifiers only. Write TODO: placeholders for all prose fields — the async fill step will write the actual content.

## Available content types
${CONTENT_TYPES.join(', ')}

## Required fields per content type
- character: name, description (TODO:), title (TODO:), metadata.type, metadata.role, metadata.faction, metadata.personality (TODO:), lore_path, narrative_path
- scene: name, description (TODO:), district, mood (TODO:), lore_path
- dialogue: name, description (TODO:), lore_path
- overlay: name, description (TODO:), target_tree_id, modifications, lore_path
- mission: title, description (TODO:), lore_path
- story: name, description (TODO:), beats
- shop_item: name, description (TODO:), price, currency
- location: name, description (TODO:), district, tags, history (TODO:), daytime (TODO:), nightlife (TODO:), lore_path
- map_tile: district_id, x, y, terrain_type
- story_beat: id, description
- gig: name, description (TODO:), reward (TODO:)
- vault: name, description (TODO:), item_type

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
      "slug": "<lowercase_snake_case_slug>",
      "fields": {
        // ALL prose fields must use "TODO: " prefix, e.g.:
        "description": "TODO: Add description",
        "metadata.personality": "TODO: Add personality",
        "mood": "TODO: Add mood"
      },
      "assetNeeds": [],
      "dependsOn": []
    }
  ],
  "links": [],
  "status": "draft"
}

## Rules
1. Pre-generate a UUID v4 for the plan id and every item id.
2. Slugs must be lowercase alphanumeric with underscores only (e.g. "diego_the_bartender").
3. ALL prose fields (description, personality, mood, history, daytime, nightlife, etc.) MUST be prefixed with "TODO: ".
4. If the description references an existing item, use action "update" and include the existing id in fields.
5. Keep identifiers short — just names/roles for the fill step to expand.
6. Output ONLY the JSON object, no markdown fences or explanation.`;
}

// ── Refinement Prompt Builder ───────────────────────────────────────────

export function buildRefinementPrompt(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): string {
  const existingChars = context.characters.map((c) => `${c.name} (id: ${c.id})`).join(', ') || '(none)';
  const existingScenes = context.scenes.map((s) => `${s.name} (id: ${s.id})`).join(', ') || '(none)';
  const existingDialogues = context.dialogues.map((d) => `${d.name} (id: ${d.id})`).join(', ') || '(none)';
  const existingMissions = context.missions.map((m) => `${m.title} (id: ${m.id})`).join(', ') || '(none)';
  const existingStories = context.stories.map((s) => `${s.title} (id: ${s.id})`).join(', ') || '(none)';
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

// ── Fill Fields Prompt ────────────────────────────────────────────────

/**
 * Build a focused prompt that asks the LLM to fill only the specified
 * free-text fields for a content item, using existing context for tone/style.
 */
export function buildFillFieldsPrompt(
  item: ContentPlanItem,
  targetFields: string[],
  context: ExistingContentContext,
): string {
  const existingChars = context.characters.map((c) => {
    const parts = [c.name];
    if (c.role) parts.push(`role: ${c.role}`);
    if (c.faction) parts.push(`faction: ${c.faction}`);
    if (c.personality) parts.push(`personality: ${c.personality}`);
    return parts.join(' — ');
  }).join(', ') || '(none)';

  const existingScenes = context.scenes.map((s) => {
    const parts = [`${s.name} (${s.district})`];
    if (s.mood) parts.push(`mood: ${s.mood}`);
    return parts.join(' — ');
  }).join(', ') || '(none)';

  const existingLocations = context.locations.map((l) => {
    const parts = [`${l.name} (${l.district})`];
    if (l.daytime) parts.push(`daytime: ${l.daytime}`);
    return parts.join(' — ');
  }).join(', ') || '(none)';

  // Build a summary of the current item fields
  const currentItemSummary = Object.entries(item.fields)
    .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('\n');

  // Type-specific writing instructions
  const typeInstructions: Record<string, string> = {
    character: `Write a compelling character description (2-3 sentences) for a cyberpunk NPC. Include physical appearance, personality traits, and their role in the city. Fill metadata fields as applicable: faction (one of: conservation, humanity_first, cjs, labor, media, van_der_meer, lw_group, dragon_phoenix, independent, civil_society, police, government, business, business_coalition, old_las_flores, dutch_interest, corrupt_authority, corrupt_officials, indigenous, student, civilian, working_class, neutral), age, gender, ethnicity, occupation, background, education, residence, organization, allies, mannerisms, motivations, quote, methods, status, location, and personality (concise 2-3 word descriptor). Only fill fields listed as targets.`,
    scene: `Write an atmospheric scene description (2-3 sentences) capturing the cyberpunk ambiance. Include sensory details (neon, rain, sounds). Fill mood with a concise descriptor (e.g., "bustling, neon-lit, tense").`,
    location: `Write rich location details: a 2-3 sentence description, plus separate daytime and nightlife descriptions, a brief history paragraph, and a conclusion paragraph summarizing the location's significance. Capture the cyberpunk setting.`,
    dialogue: `Write a concise dialogue description (1-2 sentences) explaining what this conversation is about and who participates.`,
    mission: `Write a compelling mission description (2-3 sentences) explaining the objective, stakes, and tone.`,
    overlay: `Write a description (1-2 sentences) explaining what this dialogue overlay modifies and why.`,
    vault: `Write a description (1-2 sentences) explaining what this vault item is and its significance.`,
    gig: `Write a description (2-3 sentences) explaining the gig, its risks, and the reward.`,
    shop_item: `Write a description (1-2 sentences) for this item in a cyberpunk market.`,
  };

  const instructions = typeInstructions[item.type] || typeInstructions.character;

  return `You are a content writer for Las Flores 2077, a narrative cyberpunk game set in a rain-soaked city of neon and corporate intrigue.

## Task
Fill in the following empty/TODO fields for a ${item.type} item. Write in a cyberpunk noir tone consistent with the Las Flores 2077 setting.

## Item Details
- Name: ${item.name}
- Type: ${item.type}
- Current fields:
${currentItemSummary}

## Fields to fill
${targetFields.map(f => `- ${f}`).join('\n')}

## Writing instructions
${instructions}

## Existing content (for style/tone reference)
- Characters: ${existingChars}
- Scenes: ${existingScenes}
- Locations: ${existingLocations}

## Output format
Return a JSON object with two keys:
{
  "fields": {
    "field.path": "filled value"
  },
  "lore_refs": ["optional_slug_of_related_content"]
}

Rules:
- ONLY fill the fields listed above. Do not modify other fields.
- Keep the cyberpunk Las Flores 2077 tone and setting.
- lore_refs should be slugs of existing content items that are thematically related (can be empty array).
- Output ONLY the JSON object, no markdown fences or explanation.`;
}
