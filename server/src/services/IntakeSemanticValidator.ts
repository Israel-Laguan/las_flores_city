// ============================================================
// IntakeSemanticValidator — M50c fail-open semantic concern checks
//
// The 2026-09-02 live-stack intake run showed the pipeline's plumbing was fine
// but its judgment was not: nothing checked whether a proposed delta belongs
// with the input it claims to be derived from, and nothing distinguished
// "new content" from "content that should have enriched something that already
// exists". This module adds three purely advisory, fail-open concern signals:
//
//   1. duplicate_entity  — an ADD delta whose own name closely matches an
//                          existing canon entity of the same node type.
//                          → "consider MODIFY instead of ADD."
//   2. ungrounded_plan   — a plan whose deltas have ZERO canon matches above a
//                          low floor AND zero input-grounding token overlap with
//                          the source text. The signal that would have flagged
//                          the off-universe input without needing a structural
//                          series/universe field.
//   3. mock_provider     — LLM_PROVIDER=mock means no real language-model
//                          validation of the input occurred; always surfaced.
//
// Consistent with M50's lenient-intake contract: NOTHING here blocks a plan
// from reaching `proposed`. Every check produces an `IntakeNote` (persisted as
// a scope-'intake' `CritiqueAnnotation`) or nothing at all.
// ============================================================

import type { GraphDelta, IntakeNote, ResolutionCandidate } from '@las-flores/shared';
import {
  normalizeText,
  floorSimilarity,
  MATCH_THRESHOLD,
  type CanonicalCandidate,
} from './EntityResolutionService.js';

/** Floor threshold for the plan-level "no match anywhere" canon probe. */
export const LOW_FLOOR_SIMILARITY = 0.45;

/** Cap the description excerpt used as a plan-level note's `raw` anchor. */
const RAW_CAP = 120;

/**
 * Common filler words ignored by the input-grounding token overlap. Combined
 * with a minimum token length of 4, this keeps boilerplate prose ("this plan
 * adds a new character that will...") from grounding any delta trivially.
 */
const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'has', 'had', 'are', 'was', 'were',
  'will', 'would', 'their', 'they', 'them', 'there', 'then', 'than', 'into',
  'over', 'under', 'about', 'when', 'what', 'where', 'which', 'while', 'some',
  'just', 'also', 'been', 'being', 'more', 'most', 'very', 'much', 'like',
  'make', 'made', 'each', 'other', 'because', 'through', 'after', 'before',
  'between', 'during', 'without', 'against', 'your', 'you', 'his', 'her', 'him',
  'hers', 'its', 'our', 'ours', 'who', 'whom', 'whose', 'here', 'does', 'did',
  'done', 'doing', 'onto', 'upon', 'same', 'such', 'only', 'own', 'again',
  'further', 'once', 'both', 'all', 'any', 'few', 'nor', 'not', 'too', 'can',
  'cannot', 'could', 'should', 'shall', 'may', 'might', 'must',
  'plan', 'adds', 'new', 'character',
]);

/**
 * Substantive tokens of a text: lowercased, accent/punctuation-folded (via
 * `normalizeText`), length >= 4, stopwords removed. The unit of the
 * input-grounding overlap check.
 */
export function substantiveTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const t of normalizeText(text ?? '').split(/\s+/)) {
    if (t.length >= 4 && !STOPWORDS.has(t)) tokens.add(t);
  }
  return tokens;
}

/**
 * True when ANY delta's name/title/description shares at least one substantive
 * token with the source input text. This is the per-plan input-grounding check
 * that catches a no-op provider (mock or real) silently ignoring the input.
 */
export function inputGroundingOverlap(description: string, deltas: GraphDelta[]): boolean {
  const inputTokens = substantiveTokens(description);
  if (inputTokens.size === 0) return false;
  for (const delta of deltas) {
    const fields = (delta.fields ?? {}) as Record<string, unknown>;
    const prose = [fields.name, fields.title, fields.description]
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    for (const text of prose) {
      for (const t of substantiveTokens(text)) {
        if (inputTokens.has(t)) return true;
      }
    }
  }
  return false;
}

/**
 * The canonical-matching surface the validator needs. Implemented by
 * `EntityResolutionService` (whose production candidate source is the Neo4j base
 * graph); unit tests supply stubs.
 */
export interface SemanticCanonMatcher {
  matchEntityName(name: string, nodeType: string, opts?: { candidates?: CanonicalCandidate[]; threshold?: number }): Promise<import('./EntityResolutionService.js').EntityNameMatch | null>;
  maxNameSimilarity(name: string, nodeType: string, opts?: { candidates?: CanonicalCandidate[] }): Promise<number>;
  listCandidates?(): Promise<CanonicalCandidate[]>;
}

export interface SemanticConcernParams {
  description: string;
  deltas: GraphDelta[];
  matcher: SemanticCanonMatcher;
  /** True when the plan was proposed via MockProvider (LLM_PROVIDER=mock). */
  isMockProvider: boolean;
}

/** Why a semantic concern note was raised. Carried in `IntakeNote.kind`. */
export type SemanticConcernKind = 'duplicate_entity' | 'ungrounded_plan' | 'mock_provider';

function toNoteCandidate(c: CanonicalCandidate, confidence: number): ResolutionCandidate {
  return {
    nodeType: c.nodeType as ResolutionCandidate['nodeType'],
    nodeId: c.nodeId,
    name: c.name,
    confidence: Math.round(confidence * 1000) / 1000,
  };
}

/**
 * Compute the M50c semantic-concern notes for a plan's write set.
 *
 * Entirely best-effort and additive: a failure inside the canon-matching calls
 * marks canon as unavailable (which SUPPRESSES the plan-level concern — we
 * cannot honestly assert "zero canon matches" without the canon) but never
 * throws, never drops a delta, and never changes plan status.
 */
export async function semanticConcernNotes(params: SemanticConcernParams): Promise<IntakeNote[]> {
  const { description, deltas, matcher, isMockProvider } = params;
  if (deltas.length === 0) return [];

  const anchor = deltas[0];
  const notes: IntakeNote[] = [];

  const allCandidates = matcher.listCandidates ? await matcher.listCandidates() : [];
  const candidatesByNodeType = new Map<string, CanonicalCandidate[]>();
  for (const c of allCandidates) {
    const arr = candidatesByNodeType.get(c.nodeType) ?? [];
    arr.push(c);
    candidatesByNodeType.set(c.nodeType, arr);
  }

  // 1. Whole-canon duplicate check on every ADD delta's own name.
  let canonAvailable = true;
  let anyCanonMatch = deltas.some((d) => d.op !== 'ADD');
  try {
    for (const delta of deltas.filter((d) => d.op === 'ADD')) {
      const name = (delta.fields as Record<string, unknown> | undefined)?.name;
      if (typeof name !== 'string' || name.trim().length === 0) continue;
      const nodeCandidates = candidatesByNodeType.get(delta.nodeType);
      const match = nodeCandidates
        ? await matcher.matchEntityName(name, delta.nodeType, { candidates: nodeCandidates })
        : await matcher.matchEntityName(name, delta.nodeType);
      if (match) {
        anyCanonMatch = true;
        notes.push({
          nodeType: delta.nodeType,
          nodeId: delta.nodeId,
          field: 'name',
          status: 'unresolved',
          raw: name,
          kind: 'duplicate_entity',
          reason: `"${name}" closely matches existing ${match.candidate.nodeType}:${match.candidate.nodeId} — consider MODIFY instead of ADD.`,
          suggestion: 'If this was meant as an edit to the existing entity, re-submit it as MODIFY targeting that id; otherwise rename it to something distinct.',
          candidates: [toNoteCandidate(match.candidate, match.confidence)],
          severity: 'warning',
        });
      } else {
        const floor = nodeCandidates
          ? await matcher.maxNameSimilarity(name, delta.nodeType, { candidates: nodeCandidates })
          : await matcher.maxNameSimilarity(name, delta.nodeType);
        if (floor >= LOW_FLOOR_SIMILARITY) anyCanonMatch = true;
      }
    }
  } catch (err) {
    console.warn('[intake-semantic] canon matching unavailable; suppressing canon-derived concerns:', (err as Error).message);
    canonAvailable = false;
  }

  // 2. Plan-level "no match anywhere" concern.
  if (canonAvailable && !anyCanonMatch && !inputGroundingOverlap(description, deltas)) {
    notes.push({
      nodeType: anchor.nodeType,
      nodeId: anchor.nodeId,
      status: 'unresolved',
      raw: description.trim().slice(0, RAW_CAP),
      kind: 'ungrounded_plan',
      reason: 'No proposed entity matches existing canon or the input text — this plan may not belong to this content graph.',
      suggestion: 'Verify the input text describes Las Flores 2077 content; if it does, re-run intake with a description that names the entities to create or edit.',
      candidates: [],
      severity: 'warning',
    });
  }

  // 3. Mock-provider transparency.
  if (isMockProvider) {
    notes.push({
      nodeType: anchor.nodeType,
      nodeId: anchor.nodeId,
      status: 'unresolved',
      raw: description.trim().slice(0, RAW_CAP),
      kind: 'mock_provider',
      reason: 'Plan proposed via MockProvider — no real language-model validation of input content occurred.',
      suggestion: 'Re-run intake with LLM_PROVIDER=litellm (or another real provider) for model-backed validation.',
      candidates: [],
      severity: 'info',
    });
  }

  return notes;
}

/** True when the configured LLM provider is the mock (LLM_PROVIDER unset or 'mock'). */
export function isMockProviderConfigured(): boolean {
  return (process.env.LLM_PROVIDER || 'mock') === 'mock';
}

// Re-exported so callers (and tests) can reference the threshold without a
// second import site.
export { MATCH_THRESHOLD, floorSimilarity };
