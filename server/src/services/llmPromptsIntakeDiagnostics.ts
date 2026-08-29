import type { IntakeDiagnostic } from '@las-flores/shared';
import type { IntakeDiagnosticItem } from './types/LLMTypes.js';

// ---------------------------------------------------------------------------
// Fail-open intake diagnostics — suggestion authoring prompt.
//
// Plan intake never blocks on an ambiguous or unresolvable reference; it attaches
// a note instead. This prompt turns each note into one short, directly actionable
// sentence telling the author how to resolve it, so the CLI can print something
// better than a raw error string.
//
// Batched: one call per plan covers every note, aligned by array index.
// ---------------------------------------------------------------------------

/** An item needing a suggestion — either an NL-resolution block or a dropped delta/edge. */
export type { IntakeDiagnosticItem };

/** Cap the number of items sent so a pathological plan cannot blow the window. */
const ITEM_CAP = 40;
/** Cap each serialized scalar so one huge field cannot dominate the prompt. */
const SCALAR_CAP = 300;
/** Cap candidates listed per item — the top few are what a human needs to choose. */
const CANDIDATE_CAP = 5;

function capStr(value: unknown, max = SCALAR_CAP): string {
  const s = typeof value === 'string' ? value : String(value ?? '');
  return s.length > max ? `${s.substring(0, max)}…` : s;
}

/** Narrow to the dropped-delta/edge shape, which carries `kind` + `reason`. */
function isDiagnostic(item: IntakeDiagnosticItem): item is IntakeDiagnostic {
  return 'kind' in item && 'reason' in item;
}

/**
 * Serialize one note into the bounded shape the model sees. Deliberately does NOT
 * include free-form prose from the plan — the model's job is only to phrase a next
 * step for a reference it is told about, not to re-critique the content.
 */
function serializeItem(item: IntakeDiagnosticItem, index: number): Record<string, unknown> {
  const candidates = (item.candidates ?? []).slice(0, CANDIDATE_CAP).map((c) => ({
    name: capStr(c.name, 120),
    nodeType: c.nodeType,
    confidence: Number(c.confidence.toFixed(2)),
    ...(c.note ? { note: capStr(c.note, 120) } : {}),
  }));

  return {
    index,
    raw: capStr(item.raw),
    status: item.status,
    ...(item.field ? { field: item.field } : {}),
    ...(isDiagnostic(item)
      ? {
        kind: item.kind,
        nodeType: item.nodeType,
        reason: capStr(item.reason),
      }
      : {
        ...(item.targetNodeType ? { targetNodeType: item.targetNodeType } : {}),
      }),
    candidates,
  };
}

/**
 * Build the JSON-mode prompt that asks for one suggestion per item, aligned by
 * index. The model is told to return exactly as many suggestions as it was given
 * items so the caller can zip them back on without any matching heuristic; the
 * caller still falls back to a templated string per index if the count is short.
 */
export function buildIntakeDiagnosticsPrompt(items: IntakeDiagnosticItem[]): string {
  const capped = items.slice(0, ITEM_CAP);
  const serialized = capped.map(serializeItem);

  return [
    'You are a content-authoring assistant for the game Las Flores 2077.',
    '',
    'A story plan was just submitted. The authoring graph could not confidently',
    'resolve some of the references in it, so each one below was flagged as a note',
    'for a human to confirm or correct. The plan itself was accepted — nothing is',
    'broken. Your only job is to phrase the next step for each note.',
    '',
    'For EACH item, write ONE short sentence (max 160 characters) telling the author',
    'what to do. Guidelines:',
    '  - If `candidates` is non-empty, name the most likely candidate(s) explicitly',
    '    and ask the author to confirm which one they meant.',
    '  - If `candidates` is empty, say the reference could not be matched and ask the',
    '    author to give the exact canonical name or id.',
    '  - `kind: "missing_base_node"` means the referenced entity does not exist in',
    '    canon; suggest confirming the name or creating it as new content instead.',
    '  - `kind: "evidence_only_node"` means the id points at a critique excerpt, not',
    '    real canon; ask for the real entity.',
    '  - `kind: "dangling_edge_source"` / `"dangling_edge_target"` mean a relationship',
    '    endpoint is missing; suggest confirming which entity the link should attach to.',
    '  - `kind: "unresolvable_canonical_slug"` means the existing on-disk file for the',
    '    entity could not be located; ask the author to confirm the entity id.',
    '',
    'Write plainly and directly to the author. Do not invent entity names that are',
    'not present in the item. Do not apologise, do not restate the error verbatim,',
    'and do not mention JSON, deltas, graphs, or internal field names.',
    '',
    `Return JSON with exactly ${serialized.length} suggestion(s), in the same order as the items:`,
    '{ "suggestions": ["<sentence for index 0>", "<sentence for index 1>", ...] }',
    '',
    'Items:',
    JSON.stringify({ items: serialized }, null, 2),
  ].join('\n');
}

/**
 * Deterministic fallback used when the LLM is unavailable or returns a short/
 * malformed list. Intake must never fail over a cosmetic suggestion string, so
 * every note is guaranteed to carry at least this much guidance.
 */
export function templatedSuggestion(item: IntakeDiagnosticItem): string {
  const candidates = item.candidates ?? [];
  if (candidates.length > 0) {
    const listed = candidates
      .slice(0, 3)
      .map((c) => `${c.name} (${c.confidence.toFixed(2)})`)
      .join(' or ');
    return `${candidates.length} possible match(es) for "${item.raw}" — ${listed}. Confirm which one you meant, or amend it.`;
  }
  return `No confident match for "${item.raw}" — reply with the exact canonical name or id you meant.`;
}
