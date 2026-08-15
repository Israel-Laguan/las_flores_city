import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import type { ExistingContentContext, CritiqueScopeType } from './types/LLMTypes.js';

/** Maximum number of plan items serialized into the critique prompt. */
const PLAN_ITEM_CAP = 60;
/** Truncate a single item's `fields` object to this many serialized chars. */
const PLAN_FIELD_CAP = 2400;
/** Cap individual scalar string fields (plan description, item name/description). */
const SCALAR_CAP = 500;
/** Cap each canon category's entity count so a large canon cannot blow the window. */
const CANON_ENTITY_CAP = 40;
/** Truncate a canon description to keep the critique prompt + cache hash bounded. */
const CANON_DESC_CAP = 240;
/** Cap individual canon scalar fields (names, roles, factions, titles). */
const CANON_SCALAR_CAP = 120;

function capStr(s?: string, max = SCALAR_CAP): string | undefined {
  if (s === undefined || s === null) return undefined;
  return s.length > max ? `${s.substring(0, max)}…` : s;
}

/**
 * Produce a bounded, *structured* preview of an item's `fields` object. Rather
 * than flattening to a raw (possibly invalid) JSON string, individual string
 * values are capped in place and the entry budget is bounded, so the critique
 * model can still identify the fields and facts it is reviewing even when the
 * full payload is very large.
 */
function boundedFields(fields: unknown): unknown {
  if (fields === undefined || fields === null) return fields;
  if (typeof fields !== 'object' || Array.isArray(fields)) {
    const raw = JSON.stringify(fields);
    return raw.length > PLAN_FIELD_CAP ? `${raw.substring(0, PLAN_FIELD_CAP)}…[field payload truncated]` : raw;
  }
  const entries = Object.entries(fields as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  let budget = PLAN_FIELD_CAP;
  for (const [k, v] of entries) {
    if (budget <= 0) {
      out['…more'] = '[truncated]';
      break;
    }
    let val: unknown = v;
    if (typeof v === 'string') {
      if (v.length > budget) {
        val = `${v.substring(0, budget)}…`;
        budget = 0;
      } else {
        budget -= v.length;
      }
    } else if (v !== null && typeof v === 'object') {
      const sub = JSON.stringify(v);
      if (sub.length > budget) {
        val = `${sub.substring(0, budget)}…`;
        budget = 0;
      } else {
        budget -= sub.length;
      }
    } else {
      budget -= String(v ?? '').length;
    }
    out[k] = val;
    if (budget <= 0) break;
  }
  return out;
}

/**
 * Bound the serialized plan payload so a very large plan cannot push the prompt
 * past the model context window (which would fail the whole run in callLLM with
 * finish_reason=length). Item count is capped, scalar fields (name/description)
 * are capped, and oversized `fields` objects are truncated to a structured
 * display-safe preview (the prompt is never re-parsed).
 */
export function boundedPlanItems(items: ContentPlanItem[]): Array<Record<string, unknown>> {
  return items.slice(0, PLAN_ITEM_CAP).map((i) => ({
    id: i.id,
    type: i.type,
    name: capStr(i.name),
    slug: i.slug,
    action: i.action,
    description: capStr(i.description),
    fields: boundedFields(i.fields),
    dependsOn: i.dependsOn,
    lore_refs: i.lore_refs,
  }));
}

/**
 * Deterministic serialization of the existing-canon context fed to the semantic
 * critique prompt AND the critique cache hash. Including the relevant fields
 * (role, faction, district, mood, bounded description, …) lets the model produce
 * reliable evidence for existing-canon conflicts, and because the hash reuses the
 * exact same serialization, editing a canon field or adding a canon entity changes
 * both the prompt and the hash — so stale annotations are never served from cache.
 *
 * The serialization is bounded: each category is capped to CANON_ENTITY_CAP
 * entities and scalar fields are capped, so a growing canon cannot push the
 * prompt past the context window while still capturing the relevant neighborhood.
 */
export function serializeCritiqueContext(context: ExistingContentContext): Record<string, Array<Record<string, unknown>>> {
  const cap = (s?: string) => (s ? s.substring(0, CANON_DESC_CAP) : null);
  const capScalar = (s?: string) => (s ? s.substring(0, CANON_SCALAR_CAP) : null);
  const slice = <T,>(arr: T[]) => arr.slice(0, CANON_ENTITY_CAP);
  return {
    characters: slice(context.characters).map((c) => ({
      id: c.id, name: capScalar(c.name),
      role: capScalar(c.role) ?? null, faction: capScalar(c.faction) ?? null, description: cap(c.description),
    })),
    scenes: slice(context.scenes).map((s) => ({
      id: s.id, name: capScalar(s.name),
      district: capScalar(s.district) ?? null, mood: capScalar(s.mood) ?? null, description: cap(s.description),
    })),
    dialogues: slice(context.dialogues).map((d) => ({ id: d.id, name: capScalar(d.name) })),
    missions: slice(context.missions).map((m) => ({ id: m.id, title: capScalar(m.title), description: cap(m.description) })),
    overlays: slice(context.overlays).map((o) => ({ id: o.id, name: capScalar(o.name), description: cap((o as any).description) })),
    locations: slice(context.locations).map((l) => ({
      id: l.id, name: capScalar(l.name),
      district: capScalar(l.district) ?? null, description: cap(l.history ?? (l as any).description),
    })),
  };
}

// Drives the deep AI critique. Two scopes — 'entity' (cheap model, per-item/local
// contradictions) and 'cross_entity' (deep model, narrative/timeline/relationship
// consistency). Returns structured annotation nodes with evidence text excerpts.
export function buildSemanticCritiquePrompt(
  plan: ContentPlan,
  context: ExistingContentContext,
  scope: CritiqueScopeType,
): string {
  const e = serializeCritiqueContext(context);

  let scopeInstruction: string;
  if (scope === 'entity') {
    scopeInstruction = `You are running a PER-ENTITY audit: inspect each plan item in isolation against the
existing canon it references. Look for local facts that contradict established lore
(e.g. a character's faction/age/relationship contradicts an existing entry; a scene's
district conflicts with the characters who appear there).`;
  } else if (scope === 'cross_mission') {
    scopeInstruction = `You are running a CROSS-MISSION audit: compare the plan's missions against EACH OTHER
and against existing canon. Look for mission-resolution contradictions, shared-character
timeline clashes, and narrative arcs that break or conflict across missions (e.g. two
missions claim the same resolution; a character's role in one mission contradicts another).`;
  } else {
    scopeInstruction = `You are running a CROSS-ENTITY audit: compare plan items against EACH OTHER and
against existing canon. Look for narrative arc problems, timeline clashes, and broken
or conflicting relationships (e.g. two missions contradict each other's resolution;
a character's role conflicts across items).`;
  }

  return `You are an AI semantic critique reviewer for Las Flores 2077, a narrative cyberpunk game.

## Task
Critically review the proposed content plan and return annotation nodes. Each annotation
is either a ":Conflict" (a contradiction that should be fixed) or a ":Suggestion" (a
quality improvement, advisory only).

${scopeInstruction}

## Proposed plan
${JSON.stringify({
    id: plan.id,
    description: capStr(plan.description),
    items: boundedPlanItems(plan.items),
  }, null, 2)}
${plan.items.length > PLAN_ITEM_CAP ? `\n[NOTE: ${plan.items.length - PLAN_ITEM_CAP} additional plan item(s) omitted to keep the prompt within the model context window.]\n` : ''}

## Existing canon
${JSON.stringify(e, null, 2)}

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
