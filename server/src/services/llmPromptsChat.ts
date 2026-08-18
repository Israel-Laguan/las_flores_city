import type { ExistingContentContext } from './types/LLMTypes.js';
import type { ConflictChatContext } from '@las-flores/shared';
import { serializeCritiqueContext } from './llmPromptsCritique.js';

// ---------------------------------------------------------------------------
// M29 — conversational chat prompts (Moment 4)
//
// Two contracts, one shared phase separation:
//   - `buildChatExplainPrompt` (prose): the assistant answers author questions
//     about the plan + conflict in free-form prose — no structured side-effects.
//   - `buildChatProposePrompt`  (JSON): the assistant proposes concrete graph
//     deltas (`{ reply, deltas, deltaEdges }`) that encode exactly how canon
//     should change. The delta rules below are the single prompt-side teaching
//     of `GraphDeltaSchema` so the model never invents ids or mixes op/nodeId
//     conventions.
// ---------------------------------------------------------------------------

/** Bounded scalar truncation for plan description / conflict fields. */
const SCALAR_CAP = 500;
const EXCERPT_CAP = 400;
const REL_CAP = 120;

function capStr(s: string | undefined, max = SCALAR_CAP): string | undefined {
  if (s === undefined || s === null) return undefined;
  return s.length > max ? `${s.substring(0, max)}…` : s;
}

/** Bounded, display-safe preview of the conflict bundle (or note when absent). */
function serializeConflictForChat(conflict?: ConflictChatContext): string {
  if (!conflict) return '(no conflict in context — answer in terms of the plan + canon)';
  const evidence = conflict.evidence
    .map((e) => `- [${e.nodeType} ${e.nodeId}${e.slug ? ` ${e.slug}` : ''}${e.field ? `:${e.field}` : ''}] ${capStr(e.excerpt, EXCERPT_CAP)}`)
    .join('\n') || '(no evidence excerpts)';
  const related = conflict.relatedEntities
    .map((r) => `${r.entityType}(${capStr(r.slug, REL_CAP)})`)
    .join(', ') || '(none)';
  return [
    `- type: ${conflict.type}`,
    `- severity: ${conflict.severity}`,
    `- description: ${capStr(conflict.description)}`,
    `- ai_model: ${conflict.aiModel}`,
    `- detected_at: ${conflict.detectedAt}`,
    `- evidence:\n${evidence}`,
    `- related_entities: ${related}`,
  ].join('\n');
}

const DELTA_RULES = `
## Delta rules (STRICT — a malformed delta corrupts the graph)
- \`nodeType\` MUST be one of: Character, Scene, Dialogue, Mission, Overlay, Location, District.
- \`op\` MUST be one of: ADD, MODIFY, DELETE.
- MODIFY and DELETE: \`nodeId\` MUST be the exact UUID (\`id\`) of an EXISTING canon entity — copy it from the context/evidence; never invent one.
- ADD: \`nodeId\` is a NEW stable lowercase_slug (letters, digits, underscores) for the entity you are adding.
- MODIFY carries the FULL proposed post-approve field set of the entity (a shadow copy of its current fields with your changes, e.g. name, description, district, role, faction, title...). To avoid erasing canon fields, the model should hydrate MODIFY.fields as a patch against the current canon before applying it, or the route should provide complete editable fields to the prompt.
- ADD carries the new entity's initial field set; DELETE carries no meaningful fields (use \`fields: {}\`).
- Only reference entity ids/slugs that appear in the provided context, proposed plan, or conflict evidence — never reference an id/slug that is not present.
- \`deltaEdges\`: optional relationships to materialize. \`type\` is an UPPER_SNAKE edge name (\`OWNED_BY\`, \`SET_IN\`, \`SERVES\`, \`OVERLAYS\`, \`IN_DISTRICT\`). Endpoint ids must reference ADD deltas' slugs or existing entity UUIDs. Prefer empty \`deltaEdges: []\` when unsure.
- Keep the delta list MINIMAL — propose only the exact changes that resolve the author's request.`;

/**
 * Prose contract — the assistant explains the situation and answers questions.
 * `jsonMode` must be OFF when this prompt drives the call.
 */
export function buildChatExplainPrompt(
  plan: { id: string; description?: string },
  context: ExistingContentContext,
  conflict?: ConflictChatContext,
): string {
  const e = serializeCritiqueContext(context);
  return `You are a narrative authoring assistant for Las Flores 2077, a cyberpunk game. You help a human author understand a proposed content plan and the AI critique around it.

## Your role
Answer the author's questions in clear, direct prose. Explain what the plan proposes, why the AI critique flagged the conflict, and what options the author has. Never invent canon facts that are not in the provided context. Be precise about entity identities.

## Proposed plan
- id: ${plan.id}
- description: ${capStr(plan.description) || '(no description)'}

## Existing canon (reference ids exactly as shown)
${JSON.stringify(e, null, 2)}

## Active conflict (Copy-to-Chat context)
${serializeConflictForChat(conflict)}

## Conversation
The author's messages follow. Respond as prose only.`;
}

/**
 * JSON contract — the assistant proposes concrete graph deltas to resolve the
 * author's request. Every delta is later validated against `GraphDeltaSchema`
 * server-side, so the model only supplies the semantic fields (`reply`,
 * `deltas`, `deltaEdges`).
 */
export function buildChatProposePrompt(
  plan: { id: string; description?: string },
  context: ExistingContentContext,
  conflict?: ConflictChatContext,
): string {
  const e = serializeCritiqueContext(context);
  return `You are a narrative authoring assistant for Las Flores 2077. The author wants you to PROPOSE concrete changes to canon. Return a single JSON object that encodes exactly how the canon graph should change.

## Proposed plan
- id: ${plan.id}
- description: ${capStr(plan.description) || '(no description)'}

## Existing canon (reference ids exactly as shown)
${JSON.stringify(e, null, 2)}

## Active conflict (Copy-to-Chat context)
${serializeConflictForChat(conflict)}
${DELTA_RULES}

## Output format (ONLY this JSON, no markdown fences, no explanation)
{
  "reply": "A short human-readable summary of what you are proposing and why.",
  "deltas": [
    {
      "nodeType": "Character",
      "nodeId": "<existing UUID for MODIFY/DELETE, or new lowercase_slug for ADD>",
      "op": "MODIFY",
      "fields": { "<field>": "<full post-approve value>", ... }
    }
  ],
  "deltaEdges": [
    { "sourceNodeType": "Dialogue", "sourceNodeId": "<uuid or new slug>", "targetNodeType": "Character", "targetNodeId": "<uuid or new slug>", "type": "OWNED_BY" }
  ]
}`;
}