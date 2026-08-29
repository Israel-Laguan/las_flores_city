// ============================================================
// EntityResolutionService — M50 graph-assisted canonical matching
//
// Given a natural-language reference (e.g. "City Center", "Mercado Popular",
// "Industrail Zone"), returns a ranked list of candidate canonical graph nodes
// with confidence scores and a resolution status:
//   - resolved    : single high-confidence match, auto-acceptable
//   - ambiguous   : multiple plausible matches, requires admin confirmation
//   - unresolved  : no match above threshold, flagged for human fill
//
// Resolution strategy (in order), against the canonical `:Content` base graph
// plus curated `(:Alias)-[:ALIAS_OF]` nodes:
//   1. Exact name / alias match (case-insensitive)
//   2. Normalized match: lowercase, strip punctuation + accents, drop role words
//   3. Fuzzy match (Levenshtein-bounded) over names + aliases
//   4. Graph-context disambiguation: prefer candidates whose neighbors are also
//      referenced by the plan.
//
// The candidate set is supplied via an injected `CandidateSource` so the service
// is fully unit-testable without a live Neo4j (a `Neo4jCandidateSource` is the
// production binding; see the bottom of this file).
// ============================================================

import type { GraphDelta, GraphNodeType, ResolutionBlock, ResolutionCandidate, ResolutionStatus } from '@las-flores/shared';

/** A canonical graph node (base `:Content`) with its matchable names + neighbors. */
export interface CanonicalCandidate {
  nodeType: string;
  nodeId: string;
  name: string;
  slug?: string;
  /** All names this node is known by, including curated aliases (for matching). */
  aliasNames?: string[];
  /** Neighbors (edge endpoints) used for graph-context disambiguation. */
  neighbors?: Array<{ nodeType: string; nodeId: string }>;
}

/** Supplies the canonical candidate set the resolver matches against. */
export interface CandidateSource {
  listCandidates(): Promise<CanonicalCandidate[]>;
}

// Match confidence thresholds.
const MATCH_THRESHOLD = 0.7; // anything at/above is a "candidate match"
const RESOLVE_THRESHOLD = 0.85; // a unique match at/above is auto-`resolved`

/** Role words stripped during normalization (milestone strategy #2). */
const ROLE_WORDS = new Set([
  'district', 'zone', 'area', 'the', 'el', 'la', 'los', 'las', 'de', 'y', 'of',
]);

/** Lowercase, strip accents + punctuation, drop role words, collapse spaces. */
export function normalizeText(input: string): string {
  const decomposed = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase();
  const noPunct = decomposed.replace(/[^a-z0-9\s]/g, ' ');
  const tokens = noPunct.split(/\s+/).filter((t) => t.length > 0 && !ROLE_WORDS.has(t));
  return tokens.join(' ').trim();
}

/** Classic Levenshtein edit distance (iterative, single-row). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Similarity in [0,1] combining token Jaccard and Levenshtein ratio, plus a
 * substring boost (a reference that is a sub-token of a candidate name is a very
 * strong signal). A tiny edit distance (<=2) on a sufficiently long string is
 * treated as near-certain.
 */
export function similarity(ref: string, candidate: string): number {
  const a = ref.trim();
  const b = candidate.trim();
  if (a === b) return 1;
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (normA === normB && normA.length > 0) return 1;

  const tokensA = new Set(normA.split(/\s+/).filter(Boolean));
  const tokensB = new Set(normB.split(/\s+/).filter(Boolean));
  let jaccard = 0;
  if (tokensA.size > 0 && tokensB.size > 0) {
    let inter = 0;
    for (const t of tokensA) if (tokensB.has(t)) inter += 1;
    jaccard = inter / (tokensA.size + tokensB.size - inter);
  }

  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  const ratio = maxLen === 0 ? 1 : 1 - dist / maxLen;

  let score = Math.max(jaccard, ratio);
  // Substring / shared-long-token boost.
  if (normA.length > 0 && (normB.includes(normA) || normA.includes(normB))) {
    score = Math.max(score, 0.9);
  }
  // Near-miss (small edit distance) is high confidence, but only when the edit
  // is small RELATIVE to the strings — "Bar" vs "Baz" is not a typo match.
  const minLen = Math.min(a.length, b.length);
  if (dist <= 2 && minLen >= 6) score = Math.max(score, 0.92);
  return Math.min(1, score);
}

/** Fields on a delta that carry a natural-language reference to another entity. */
const REFERENCE_FIELDS: Record<string, Array<{ field: string; targetNodeType: GraphNodeType }>> = {
  Scene: [{ field: 'district', targetNodeType: 'District' }],
  Location: [{ field: 'district', targetNodeType: 'District' }],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EntityResolutionService {
  constructor(private readonly source: CandidateSource) {}

  /**
   * Attach a `_resolution` block to every delta that contains a natural-language
   * reference in one of its `REFERENCE_FIELDS`. References that are raw UUIDs are
   * skipped (already canonical identity). Returns new delta objects (does not
   * mutate inputs). `referencedNodeIds` feeds graph-context disambiguation.
   */
  async resolvePlanDeltas(deltas: GraphDelta[]): Promise<GraphDelta[]> {
    const referenced = new Set<string>();
    for (const d of deltas) {
      referenced.add(`${d.nodeType}:${d.nodeId.toLowerCase()}`);
    }
    const candidates = await this.source.listCandidates();
    const out: GraphDelta[] = [];
    for (const delta of deltas) {
      const blocks = await this.resolveDeltaReferences(delta, candidates, referenced);
      out.push(blocks.length > 0 ? { ...delta, _resolution: blocks } : delta);
    }
    return out;
  }

  private async resolveDeltaReferences(
    delta: GraphDelta,
    candidates: CanonicalCandidate[],
    referenced: Set<string>,
  ): Promise<ResolutionBlock[]> {
    const refs = REFERENCE_FIELDS[delta.nodeType];
    if (!refs) return [];
    const blocks: ResolutionBlock[] = [];
    for (const { field, targetNodeType } of refs) {
      const value = (delta.fields as Record<string, unknown> | undefined)?.[field];
      if (typeof value !== 'string' || value.length === 0) continue;
      if (UUID_RE.test(value)) continue; // already a canonical identity
      const block = await this.resolve(value, {
        targetNodeType,
        referencedNodeIds: referenced,
        candidates,
      });
      blocks.push({ ...block, field, targetNodeType });
    }
    return blocks;
  }

  /**
   * Resolve a single reference. When `candidates` is supplied (callers that have
   * already loaded the set, e.g. `resolvePlanDeltas`), it is reused; otherwise
   * the injected `CandidateSource` is queried.
   */
  async resolve(
    reference: string,
    opts: {
      targetNodeType?: string;
      referencedNodeIds?: Set<string>;
      candidates?: CanonicalCandidate[];
    } = {},
  ): Promise<ResolutionBlock> {
    const raw = reference.trim();
    const normRef = normalizeText(raw);
    const candidates = opts.candidates ?? (await this.source.listCandidates());
    const pool = opts.targetNodeType
      ? candidates.filter((c) => c.nodeType === opts.targetNodeType)
      : candidates;

    const scored: Array<{ candidate: CanonicalCandidate; confidence: number; method: string }> = [];
    for (const c of pool) {
      const matchable = [c.name, ...(c.aliasNames ?? [])];
      let best = 0;
      for (const name of matchable) {
        const normName = normalizeText(name);
        if (normRef.length > 0 && normRef === normName) {
          const s = name === c.name ? 1 : 0.95; // exact name beats exact alias
          if (s > best) { best = s; }
        } else {
          const sim = similarity(raw, name);
          if (sim > best) { best = sim; }
        }
      }
      if (best >= MATCH_THRESHOLD) scored.push({ candidate: c, confidence: best, method: 'match' });
    }

    // Graph-context disambiguation: boost candidates whose neighbors are also
    // referenced by the plan (e.g. a location whose IN_DISTRICT neighbor is itself
    // referenced resolves more confidently).
    if (opts.referencedNodeIds) {
      for (const s of scored) {
        const linked = (s.candidate.neighbors ?? []).some((n) =>
          opts.referencedNodeIds!.has(`${n.nodeType}:${n.nodeId.toLowerCase()}`),
        );
        if (linked) s.confidence = Math.min(1, s.confidence + 0.1);
      }
    }

    scored.sort((a, b) => b.confidence - a.confidence);

    if (scored.length === 0) {
      return { raw, status: 'unresolved', candidates: [] };
    }

    const top = scored[0];
    const rest = scored.slice(1);
    const unique = rest.every((s) => s.confidence < RESOLVE_THRESHOLD);

    if (top.confidence >= RESOLVE_THRESHOLD && unique) {
      return {
        raw,
        status: 'resolved',
        candidates: [toCandidate(top.candidate, top.confidence)],
      };
    }

    const status: ResolutionStatus = scored.length > 1 ? 'ambiguous' : 'unresolved';
    return {
      raw,
      status,
      candidates: scored.slice(0, 5).map((s) => toCandidate(s.candidate, s.confidence)),
    };
  }
}

function toCandidate(c: CanonicalCandidate, confidence: number): ResolutionCandidate {
  return {
    nodeType: c.nodeType as GraphNodeType,
    nodeId: c.nodeId,
    name: c.name,
    confidence: Math.round(confidence * 1000) / 1000,
  };
}
