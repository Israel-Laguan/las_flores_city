import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import type { ExistingContentContext, CritiqueScopeType } from './types/LLMTypes.js';
import { buildLorePrompt, buildEntityExtractionPrompt, CONTENT_TYPES } from './LLMPromptExtractors.js';

export { buildLorePrompt, buildEntityExtractionPrompt, CONTENT_TYPES };

// ── Shared Formatting Helpers ───────────────────────────────────────────

function formatExistingContent(context: ExistingContentContext): {
  chars: string; scenes: string; dialogues: string; missions: string;
  overlays: string; locations: string;
} {
  return {
    chars: context.characters.map((c) => `${c.name} (id: ${c.id})${c.role ? `, role: ${c.role}` : ''}${c.faction ? `, faction: ${c.faction}` : ''}`).join(', ') || '(none)',
    scenes: context.scenes.map((s) => `${s.name} (id: ${s.id})${s.district ? `, district: ${s.district}` : ''}${s.mood ? `, mood: ${s.mood}` : ''}`).join(', ') || '(none)',
    dialogues: context.dialogues.map((d) => `${d.name} (id: ${d.id})`).join(', ') || '(none)',
    missions: context.missions.map((m) => `${m.title} (id: ${m.id})`).join(', ') || '(none)',
    overlays: context.overlays.map((o) => `${o.name} (id: ${o.id})`).join(', ') || '(none)',
    locations: context.locations.map((l) => `${l.name} (id: ${l.id})${l.district ? `, district: ${l.district}` : ''}${l.daytime ? `, daytime: ${l.daytime}` : ''}${l.nightlife ? `, nightlife: ${l.nightlife}` : ''}`).join(', ') || '(none)',
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
- Overlays: ${e.overlays}
- Locations: ${e.locations}

## Story quality rules (maintain these when adjusting the plan)
- Story beats = player's present involvement, not NPC backstory (lore goes in .md files)
- Quest arcs need engage / reject / exploit branches
- Tone: cyberpunk noir, punchy, no exposition dumps

## Output format
Return a JSON object with an "items" key containing an array of the modified items only. Each item must keep its original id. Output ONLY the JSON object, no markdown fences or explanation.`;
}

// ── Intake Conflict Scan Prompt Builder (Moment 1) ────────────────────────
// Asks the LLM for a surface-level conflict preview of a proposed plan against
// existing canon. Advisory only — the deterministic harness is the blocking gate.

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

// ── Semantic Critique Prompt Builder (Moment 3 / M26) ─────────────────────
// Drives the deep AI critique. Two scopes — 'entity' (cheap model, per-item/local
// contradictions) and 'cross_entity' (deep model, narrative/timeline/relationship
// consistency). Returns structured annotation nodes with evidence text excerpts.

export function buildSemanticCritiquePrompt(
  plan: ContentPlan,
  context: ExistingContentContext,
  scope: CritiqueScopeType,
): string {
  const e = formatExistingContent(context);
  const isCross = scope !== 'entity';

  const scopeInstruction = isCross
    ? `You are running a CROSS-ENTITY audit: compare plan items against EACH OTHER and
against existing canon. Look for narrative arc problems, timeline clashes, and broken
or conflicting relationships (e.g. two missions contradict each other's resolution;
a character's role conflicts across items).`
    : `You are running a PER-ENTITY audit: inspect each plan item in isolation against the
existing canon it references. Look for local facts that contradict established lore
(e.g. a character's faction/age/relationship contradicts an existing entry; a scene's
district conflicts with the characters who appear there).`;

  return `You are an AI semantic critique reviewer for Las Flores 2077, a narrative cyberpunk game.

## Task
Critically review the proposed content plan and return annotation nodes. Each annotation
is either a ":Conflict" (a contradiction that should be fixed) or a ":Suggestion" (a
quality improvement, advisory only).

${scopeInstruction}

## Proposed plan
${JSON.stringify({
    id: plan.id,
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
      lore_refs: i.lore_refs,
    })),
  }, null, 2)}

## Existing canon
- Characters: ${e.chars}
- Scenes: ${e.scenes}
- Dialogues: ${e.dialogues}
- Missions: ${e.missions}
- Overlays: ${e.overlays}
- Locations: ${e.locations}

## Severity rules
- "error": the contradiction MUST be fixed before this plan can be approved (e.g. directly
  contradicts existing canon).
- "warning": likely a problem, but the author should judge.
- "info": a Suggestion (type="suggestion") quality note, never a blocker.

## Rules
1. Each annotation MUST include:
   - type: "conflict" | "suggestion"
   - severity: "error" | "warning" | "info"
   - description: plain-language explanation of the problem/improvement.
   - evidence: array of { nodeType, nodeId, slug, excerpt } — the text excerpts in the
     plan or canon that prove the claim. ALWAYS include at least one excerpt. nodeId must
     reference a plan item id (for proposed content) or an existing content id/slug.
   - itemIds: plan item ids this annotation relates to (may be empty).
2. Only use a "conflict" for contradictions you are confident about; prefer conservative,
   high-confidence flags. Use "suggestion"/"info" for the rest.
3. Every conflict must be backed by quoted evidence — never flag without one.
4. Return ONLY a JSON object with an "annotations" key, no markdown fences or explanation.

## Output format
{
  "annotations": [
    {
      "type": "conflict",
      "severity": "error",
      "description": "Brief human-readable explanation",
      "evidence": [{ "nodeType": "character", "nodeId": "<item id>", "slug": "<slug>", "excerpt": "the relevant text" }],
      "itemIds": ["<item id>"]
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

