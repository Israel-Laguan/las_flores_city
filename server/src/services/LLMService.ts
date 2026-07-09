import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';

export interface ExistingContentContext {
  characters: Array<{ id: string; name: string }>;
  scenes: Array<{ id: string; name: string; district: string }>;
  dialogues: Array<{ id: string; name: string }>;
}

export interface LLMProvider {
  parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan>;
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

  return `You are a content planning assistant for Las Flores 2077, a narrative cyberpunk game.

## Task
Given a user's natural-language description, produce a ContentPlan — a list of content items to create or update.

## Available content types
${CONTENT_TYPES.join(', ')}

## Required fields per content type
- character: name, description, title (optional), avatar_url (optional)
- scene: name, description, district
- dialogue: name, description, start_node_id, nodes
- overlay: name, description, target_tree_id, modifications
- mission: title, description
- story: name, description, beats
- shop_item: name, description, price, currency
- location: name, description, district
- map_tile: district_id, x, y, terrain_type
- story_beat: id, description
- gig: name, description, reward
- vault: name, description, item_type

## Existing content (avoid duplicates)
- Characters: ${existingChars}
- Scenes: ${existingScenes}
- Dialogues: ${existingDialogues}

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

  async parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan> {
    const systemPrompt = buildSystemPrompt(context);

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
          { role: 'user', content: description },
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
    const cleanedContent = content.replace(/^\u0060\u0060\u0060json\s*|\u0060\u0060\u0060$/g, "").trim();
    const planJson = JSON.parse(cleanedContent);
    return ContentPlanSchema.parse(planJson);
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