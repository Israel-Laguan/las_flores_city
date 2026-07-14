import { ContentPlanSchema, type ContentPlan, type ContentPlanItem } from '@las-flores/shared';

export interface ExistingContentContext {
  characters: Array<{ id: string; name: string }>;
  scenes: Array<{ id: string; name: string; district: string }>;
  dialogues: Array<{ id: string; name: string }>;
  missions: Array<{ id: string; title: string }>;
  stories: Array<{ id: string; name: string }>;
  overlays: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string; district: string }>;
}

export interface LLMProvider {
   parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan>;
   refinePlan(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<ContentPlan>;
   generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string>;
 }

// ── System Prompt Builder ───────────────────────────────────────

const CONTENT_TYPES = [
  'character', 'dialogue', 'scene', 'overlay', 'mission',
  'story', 'shop_item', 'location', 'map_tile', 'story_beat', 'gig', 'vault',
];

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

// ── Refinement Prompt Builder ───────────────────────────────────

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

// ── LiteLLM Provider ─────────────────────────────────────────────

export class LiteLLMProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000';
    this.apiKey = process.env.LITELLM_API_KEY || '';
    this.model = process.env.LLM_MODEL || 'poolside/laguna-m.1';
  }

  private async callLLM(systemPrompt: string, userMessage: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LiteLLM request failed: ${response.status} ${response.statusText} — ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LiteLLM response did not contain any message content.');
    }
    const fenceMatch = content.match(/```(?:json|JSON)\s*\n?([\s\S]*?)```/);
    const cleanedContent = fenceMatch ? fenceMatch[1].trim() : content.trim();
    try {
      return JSON.parse(cleanedContent);
    } catch (e) {
      throw new Error(`LiteLLM returned invalid JSON: ${(e as Error).message}. Content preview: ${cleanedContent.substring(0, 200)}`);
    }
  }

  private async callLLMText(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        // No response_format - we want plain text markdown
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LiteLLM lore request failed: ${response.status} ${response.statusText} — ${text}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // Strip markdown code fences if LLM wrapped the output
    if (content.startsWith('```markdown') || content.startsWith('```')) {
      content = content.replace(/^```\\w*\\n/, '').replace(/```$/, '');
    }

    return content.trim();
  }

  async parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan> {
    const systemPrompt = buildSystemPrompt(context);
    const planJson = await this.callLLM(systemPrompt, description);
    return ContentPlanSchema.parse(planJson);
  }

  async refinePlan(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<ContentPlan> {
    const systemPrompt = buildRefinementPrompt(existingPlan, feedback, context);
    const planJson = await this.callLLM(systemPrompt, feedback);
    planJson.id = existingPlan.id;
    return ContentPlanSchema.parse(planJson);
  }

  async generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string> {
    const prompt = buildLorePrompt(item, context);
    return this.callLLMText(prompt, item.fields.description || item.name);
  }
}

// ── Mock Provider ───────────────────────────────────────────────

const MOCK_IDS = {
  planId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  characterId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  sceneId: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
  dialogueId: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80',
};

export class MockProvider implements LLMProvider {
  async parseDescription(description: string, _context: ExistingContentContext): Promise<ContentPlan> {
    const lower = description.toLowerCase();
    const items: ContentPlan['items'] = [];

    if (lower.includes('bartender')) {
      items.push({
        id: MOCK_IDS.characterId,
        type: 'character',
        action: 'create',
        name: 'Diego',
        description: 'A weathered bartender with a cybernetic left arm and a talent for listening.',
        slug: 'diego',
        fields: {
          name: 'Diego',
          description: 'A weathered bartender with a cybernetic left arm and a talent for listening.',
          title: 'Bartender at The Neon Flask',
        },
        assetNeeds: [],
        dependsOn: [],
      });
    }

    if (lower.includes('plaza')) {
      items.push({
        id: MOCK_IDS.sceneId,
        type: 'scene',
        action: 'update',
        name: 'Central Plaza',
        description: 'The bustling heart of Las Flores, where neon signs flicker above street vendors.',
        slug: 'central_plaza',
        fields: {
          name: 'Central Plaza',
          description: 'The bustling heart of Las Flores, where neon signs flicker above street vendors.',
          district: 'downtown',
        },
        assetNeeds: [],
        dependsOn: [],
      });
    }

    // Always include a dialogue item
    items.push({
      id: MOCK_IDS.dialogueId,
      type: 'dialogue',
      action: 'create',
      name: 'Street Encounter',
      description: 'A chance conversation on the streets of Las Flores.',
      slug: 'street_encounter',
      fields: {
        name: 'Street Encounter',
        description: 'A chance conversation on the streets of Las Flores.',
        start_node_id: 'node_start',
        nodes: {
          node_start: {
            id: 'node_start',
            text: 'You pass through the crowded street.',
            choices: [],
          },
        },
      },
      assetNeeds: [],
      dependsOn: [],
    });

    return ContentPlanSchema.parse({
      id: MOCK_IDS.planId,
      description: `Mock plan for: ${description}`,
      items,
      links: [],
      status: 'draft',
    });
  }

  async refinePlan(existingPlan: ContentPlan, feedback: string, _context: ExistingContentContext): Promise<ContentPlan> {
    // Mock: just return the existing plan with a note in description
    return ContentPlanSchema.parse({
      ...existingPlan,
      description: `${existingPlan.description} [Refined based on: ${feedback}]`,
      status: 'proposed',
    });
  }

  async generateLore(item: ContentPlanItem, _context: ExistingContentContext): Promise<string> {
    // Mock: generate placeholder lore based on item type
    const name = item.name || 'Untitled';
    const description = item.fields.description || '';

    switch (item.type) {
      case 'character':
        return `# ${name}

**Title (full):** ${item.fields.title || name}
**Title (short):** ${name}, ${item.fields.title || 'Person of Interest'}

**Description (full):**
**Age:** ${item.fields.age || 'Unknown'}
**Origin:** ${item.fields.origin || 'Las Flores urban sprawl'}
**Occupation:** ${item.fields.occupation || item.fields.title || 'Unspecified'}

${description || `${name} moves through the neon-soaked streets of Las Flores with purpose.`} Physically, they carry the marks of city life — cybernetic mods, weathered clothing, and eyes that have seen too much. Their personality is shaped by the struggles of urban survival, yet they retain a spark of something more.

Challenges: The daily grind of corporate oppression, the cost of staying augmented, and the question of what it means to remain human in 2077. Their larger vision is survival, perhaps even thriving, in a city that seems designed to grind people down.

---

**Key Relationships**

| Name | Nature | Notes |
|------|--------|-------|
| Unknown | Connection | To be determined by the GM |

**Known Habit**

${name} has a habit of scanning the crowd for familiar faces, a remnant of old-world community ties that persist despite the digital age.
`;
      case 'scene':
      case 'location':
        return `# ${name}

> Tags: ${item.fields.tags || 'urban'}

**District:** ${item.fields.district || 'Unknown'}

## Overview

${description || `${name} is a notable location in the cityscape of Las Flores.`} The area pulses with ${item.fields.mood || 'electric energy'}, its streets lined with vendors and corporate storefronts. Rain slicks the pavement, reflecting the kaleidoscope of neon above.

## Related Lore

- [[figures/unknown_person/unknown_person]]
`;
      case 'mission':
      case 'story':
        return `# ${name}

> Tags: ${item.fields.tags || 'main'}

**Location:** ${item.fields.location || 'Las Flores'}
**Period:** ${item.fields.period || '2077'}

## Overview

${description || `A ${item.type} unfolds in the shadows of Las Flores.`}

### Beats

- The story begins with an encounter.
- Complications arise from corporate interference.
- The climax reveals hidden truths.

## Related Lore

- [[figures/unknown_person/unknown_person]]
`;
      default:
        return `# ${name}

${description || `${name} is a ${item.type} in the world of Las Flores 2077.`}
`;
    }
  }
}

// ── Factory ─────────────────────────────────────────────────────

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || 'mock';
  switch (provider) {
    case 'mock':
      return new MockProvider();
    case 'litellm':
    case 'gemini':
    case 'groq':
      // All real providers now route through LiteLLM proxy
      return new LiteLLMProvider();
    default:
      throw new Error(`Unknown LLM provider: ${provider}. Valid options: mock, litellm, gemini, groq`);
  }
}