import { ContentPlanSchema, type ContentPlan, type ContentPlanItem } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext, LLMUsage } from './types/LLMTypes.js';

const MOCK_IDS = {
  planId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  characterId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  sceneId: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
  dialogueId: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80',
};

export class MockProvider implements LLMProvider {
  async parseDescription(description: string, _context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }> {
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

    return {
      plan: ContentPlanSchema.parse({
        id: MOCK_IDS.planId,
        description: `Mock plan for: ${description}`,
        items,
        links: [],
        status: 'draft',
      }),
      usage: null,
    };
  }

  async refinePlan(existingPlan: ContentPlan, feedback: string, _context: ExistingContentContext): Promise<{ plan: ContentPlan; usage: LLMUsage | null }> {
    return {
      plan: ContentPlanSchema.parse({
        ...existingPlan,
        description: `${existingPlan.description} [Refined based on: ${feedback}]`,
        status: 'proposed',
      }),
      usage: null,
    };
  }

  async generateLore(item: ContentPlanItem, _context: ExistingContentContext): Promise<string> {
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

  async generateFill(prompt: string): Promise<{ fields: Record<string, string>; lore_refs?: string[] }> {
    // Mock provider returns reasonable defaults based on common patterns
    const fields: Record<string, string> = {};

    // Simple heuristic: extract item name from context clues in the prompt
    // In production, the real LLM would generate these properly
    if (prompt.includes('character')) {
      fields['description'] = 'A weathered resident of Las Flores, shaped by the neon-soaked streets and corporate grind of 2077.';
      fields['metadata.personality'] = 'streetwise';
      fields['title'] = 'Resident of Las Flores';
    } else if (prompt.includes('scene')) {
      fields['description'] = 'Rain-slicked streets reflect the kaleidoscope of neon above, casting long shadows between corporate towers.';
      fields['mood'] = 'atmospheric, tense';
    } else if (prompt.includes('location')) {
      fields['description'] = 'A notable landmark in the sprawling cityscape of Las Flores.';
      fields['history'] = 'Built during the first wave of corporate expansion, this location has seen decades of change.';
      fields['daytime'] = 'Bustling with commuters and street vendors.';
      fields['nightlife'] = 'Transformed by neon signs and underground music.';
    } else if (prompt.includes('dialogue')) {
      fields['description'] = 'A conversation that reveals hidden truths about the city.';
    } else if (prompt.includes('mission')) {
      fields['description'] = 'A mission that could change the fate of Las Flores.';
    } else {
      fields['description'] = 'A piece of content in the world of Las Flores 2077.';
    }

    return { fields, lore_refs: [] };
  }

}