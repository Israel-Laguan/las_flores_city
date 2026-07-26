import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import type { ExistingContentContext } from './types/LLMTypes.js';
import { buildLorePrompt, buildEntityExtractionPrompt, CONTENT_TYPES } from './LLMPromptExtractors.js';

export { buildLorePrompt, buildEntityExtractionPrompt, CONTENT_TYPES };

// ── Shared Formatting Helpers ───────────────────────────────────────────

function formatExistingContent(context: ExistingContentContext): {
  chars: string; scenes: string; dialogues: string; missions: string;
  stories: string; overlays: string; locations: string;
} {
  return {
    chars: context.characters.map((c) => `${c.name} (id: ${c.id})`).join(', ') || '(none)',
    scenes: context.scenes.map((s) => `${s.name} (id: ${s.id})`).join(', ') || '(none)',
    dialogues: context.dialogues.map((d) => `${d.name} (id: ${d.id})`).join(', ') || '(none)',
    missions: context.missions.map((m) => `${m.title} (id: ${m.id})`).join(', ') || '(none)',
    stories: context.stories.map((s) => `${s.title} (id: ${s.id})`).join(', ') || '(none)',
    overlays: context.overlays.map((o) => `${o.name} (id: ${o.id})`).join(', ') || '(none)',
    locations: context.locations.map((l) => `${l.name} (id: ${l.id})`).join(', ') || '(none)',
  };
}

// ── System Prompt Builder ────────────────────────────────────────────────

export function buildSystemPrompt(context: ExistingContentContext): string {
  const e = formatExistingContent(context);

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
- Characters: ${e.chars}
- Scenes: ${e.scenes}
- Dialogues: ${e.dialogues}
- Missions: ${e.missions}
- Stories: ${e.stories}
- Overlays: ${e.overlays}
- Locations: ${e.locations}

## Story quality rules
- Biography Check: story_beat items must describe the PLAYER's active involvement in the present, not NPC backstory. NPC history belongs in lore files, not in beats.
- Player agency: every quest/mission arc should support three branches — engage (help/ally), reject (walk away + consequences), and exploit (betrayal/mercenary outcome). Use dependsOn or separate items to represent branches.
- Tone: cyberpunk noir — punchy, atmospheric, avoid long exposition dumps in a single node.

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

export interface BuildOutlinePromptOptions {
  maxItems?: number;
}

export function buildOutlinePrompt(context: ExistingContentContext, options: BuildOutlinePromptOptions = {}): string {
  const { maxItems } = options;
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

  const itemCapInstruction = maxItems
    ? `\nIMPORTANT: Generate at most ${maxItems} items. Prioritize the most important entities from the description.`
    : '';

  return `You are a content planning assistant for Las Flores 2077, a narrative cyberpunk game.

## Task
Given a user's natural-language description, produce a ContentPlan skeleton with identifiers only. Write TODO: placeholders for all prose fields — the async fill step will write the actual content.${itemCapInstruction}

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

## Story quality rules
- Biography Check: story_beat items must describe the PLAYER's active involvement in the present, not NPC backstory. NPC history belongs in lore files, not in beats.
- Player agency: every quest/mission arc should support three branches — engage (help/ally), reject (walk away + consequences), and exploit (betrayal/mercenary outcome). Use dependsOn or separate items to represent branches.
- Tone: cyberpunk noir — punchy, atmospheric, avoid long exposition dumps in a single node.

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
  const e = formatExistingContent(context);

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
- Characters: ${e.chars}
- Scenes: ${e.scenes}
- Dialogues: ${e.dialogues}
- Missions: ${e.missions}
- Stories: ${e.stories}
- Overlays: ${e.overlays}
- Locations: ${e.locations}

## Story quality rules (maintain these when adjusting the plan)
- Story beats = player's present involvement, not NPC backstory (lore goes in .md files)
- Quest arcs need engage / reject / exploit branches
- Tone: cyberpunk noir, punchy, no exposition dumps

## Output format
Return a single JSON object matching the ContentPlan schema. Keep the same plan id. Keep items that the user didn't ask to change. Output ONLY the JSON object, no markdown fences or explanation.`;
}

// ── Item-Scoped Refinement Prompt Builder ─────────────────────────────

export function buildItemScopedRefinementPrompt(
  selectedItems: ContentPlanItem[],
  fullPlan: ContentPlan,
  feedback: string,
  context: ExistingContentContext,
): string {
  const otherItems = fullPlan.items
    .filter(i => !selectedItems.some(s => s.id === i.id))
    .map(i => `${i.name} (${i.type})`)
    .join(', ') || '(none)';

  const e = formatExistingContent(context);

  return `You are a content planning assistant for Las Flores 2077, a narrative cyberpunk game.

## Task
The user wants to refine ONLY the selected items below. Adjust these items according to the feedback. Do NOT modify any other items in the plan.

## Items to refine
${JSON.stringify(selectedItems, null, 2)}

## Other items in the plan (for cross-reference, do NOT modify)
${otherItems}

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
- Characters: ${e.chars}
- Scenes: ${e.scenes}
- Dialogues: ${e.dialogues}
- Missions: ${e.missions}
- Stories: ${e.stories}
- Overlays: ${e.overlays}
- Locations: ${e.locations}

## Story quality rules (maintain these when adjusting the plan)
- Story beats = player's present involvement, not NPC backstory (lore goes in .md files)
- Quest arcs need engage / reject / exploit branches
- Tone: cyberpunk noir, punchy, no exposition dumps

## Output format
Return a JSON object with an "items" key containing an array of the modified items only. Each item must keep its original id. Output ONLY the JSON object, no markdown fences or explanation.`;
}

// ── Fill Fields Prompt Builder ─────────────────────────────────────────

export function buildFillFieldsPrompt(
  item: ContentPlanItem,
  unfilledFields: string[],
  context: ExistingContentContext,
): string {
  const e = formatExistingContent(context);

  return `You are a content writing assistant for Las Flores 2077, a narrative cyberpunk game.

## Task
Fill in the empty/TODO fields for the following content item. Return ONLY the requested fields with appropriate values.

## Content item to fill
Type: ${item.type}
Name: ${item.name}
Current fields:
${JSON.stringify(item.fields, null, 2)}

## Fields to fill
${unfilledFields.join(', ')}

## Existing content (for cross-reference)
- Characters: ${e.chars}
- Scenes: ${e.scenes}
- Dialogues: ${e.dialogues}
- Missions: ${e.missions}
- Stories: ${e.stories}
- Overlays: ${e.overlays}
- Locations: ${e.locations}

## Rules
1. Write atmospheric, cyberpunk-noir prose with sensory details where appropriate for each field.
2. Keep descriptions concise but evocative (2-3 sentences max for descriptions).
3. Ensure consistency with the item's name, type, and any existing field values.
4. Reference existing content by name where appropriate for cross-referencing.
5. For metadata fields, use short, specific values (e.g. "Nomad" not "He is part of the Nomad faction").

## Output format
Return a JSON object with a "fields" key containing only the filled fields, and an optional "lore_refs" array listing any existing content IDs referenced.
Example:
{
  "fields": {
    "description": "A weathered bartender with chrome-lined eyes...",
    "metadata.personality": "Stoic, observant, speaks in clipped sentences"
  },
  "lore_refs": ["character-diego-id"]
}

Output ONLY the JSON object, no markdown fences or explanation.`;
}

