import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import type { ExistingContentContext } from './types/LLMTypes.js';
import { formatExistingContent } from './LLMPrompts.js';

export function buildIntakeConflictPrompt(plan: ContentPlan, context: ExistingContentContext): string {
  const e = formatExistingContent(context);

  return `You are a narrative consistency reviewer for Las Flores 2077, a cyberpunk game.

## Task
Review the proposed content plan against the existing canon below and return a list of
potential conflicts. This is a surface-level preview, not an exhaustive audit. Flag only
conflicts you are reasonably confident about.

## Proposed plan
${JSON.stringify({
    description: plan.description,
    items: plan.items.map(i => ({
      id: i.id,
      type: i.type,
      name: i.name,
      slug: i.slug,
      action: i.action,
      description: i.description,
      fields: i.fields,
      dependsOn: i.dependsOn,
    })),
  }, null, 2)}

## Existing canon
- Characters: ${e.chars}
- Scenes: ${e.scenes}
- Dialogues: ${e.dialogues}
- Missions: ${e.missions}
- Overlays: ${e.overlays}
- Locations: ${e.locations}

## Conflict types (use exactly one per conflict)
- duplicate_name: a proposed *create* item's name/slug duplicates an existing or proposed entity; do NOT flag an update item matching its intended existing entity.
- lore_contradiction: the proposed content contradicts established lore/facts.
- timeline_clash: dates/periods in the plan collide with existing canon or each other.
- scope_overlap: two proposed items would overlap in purpose/scope.

## Rules
1. Each conflict must have a severity of "error" or "warning" (error = must fix before approve).
2. relatedItems must reference item ids from the proposed plan (may be empty).
3. relatedExisting, if present, should reference existing entity names/slugs.
4. Compare proposed names/slugs against existing names case-insensitively (trim surrounding whitespace). An exact name/slug match against an existing entity is a duplicate_name for create items only.
5. For timeline_clash, compare the "period", "start"/"end", "born"/"died", or "coversFrom"/"coversTo" fields of proposed items against each other and against any dated existing canon you can infer.
6. Be conservative — prefer fewer, high-confidence flags over speculative ones.
7. Return ONLY a JSON object with a "conflicts" key, no markdown fences or explanation.

## Output format
{
  "conflicts": [
    {
      "type": "duplicate_name",
      "severity": "error",
      "description": "Brief human-readable explanation",
      "relatedItems": ["<item id>"],
      "relatedExisting": ["<existing name or slug>"]
    }
  ]
}`;
}

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
