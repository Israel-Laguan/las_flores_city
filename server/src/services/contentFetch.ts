// ============================================================
// M23 CDN content-fetch helpers (DialogueResolver)
//
// Pure helpers that load externalized dialogue content blobs from
// MinIO/CDN via `content_url`. Extracted from DialogueResolver.ts
// to keep that file within the line limit; they have no dependency
// on the resolver class.
// ============================================================

import { DialogueNode, Leaf } from '@las-flores/shared';
import { fetchContentJson } from './StorageService.js';

/** True when the value is a non-empty map whose values are records. */
function isNodeMap(v: Record<string, DialogueNode>): boolean {
  return Object.keys(v).length > 0
    && Object.values(v).every((n) => typeof n === 'object' && n !== null && !Array.isArray(n));
}
function isLeafMap(v: Record<string, Leaf>): boolean {
  return Object.keys(v).length > 0
    && Object.values(v).every((l) => typeof l === 'object' && l !== null && !Array.isArray(l));
}

/**
 * Fetch a `nodes` map from CDN via `content_url`. Content blobs are
 * stored uniformly as `{ nodes: Record<nodeId, DialogueNode> }` (chunk
 * blobs additionally carry `leaves`, which the resolver does not need
 * for merging). On any failure (missing pointer, MinIO fetch error,
 * JSON parse error) this returns `null`; base-content callers treat that
 * as an unavailable required payload, while snapshot callers may use it to
 * select the live merge fallback.
 *
 * AVAILABLE vs UNAVAILABLE: a present, valid `nodes` object — even an
 * empty `{}` (a freshly published but node-less tree) — is returned as-is,
 * and callers tolerate an empty map. A *malformed* `nodes` section
 * (missing key, array, non-record, or a non-empty map whose values are not
 * records) is treated as UNAVAILABLE and returns `null` rather than being
 * silently coerced to the empty fallback. This separation matters for
 * availability checks such as admin-story-beats DELETE, which must refuse to
 * act when a tree cannot be verified instead of treating an unreadable tree
 * as an empty one and missing a real dialogue reference.
 */
export async function fetchNodesFromContentUrl(
  contentUrl: string | null | undefined,
  _fallback: Record<string, DialogueNode>
): Promise<Record<string, DialogueNode> | null> {
  if (!contentUrl) return null;
  try {
    const parsed = (await fetchContentJson(contentUrl)) as
      | { nodes?: Record<string, DialogueNode> }
      | null
      | undefined;
    const candidates = parsed?.nodes;
    if (candidates === undefined || candidates === null) return null;
    if (Array.isArray(candidates)) return null;
    if (typeof candidates !== 'object') return null;
    // An empty map is a valid, available (node-less) tree. Honor the CDN
    // snapshot rather than the fallback — a non-empty fallback (e.g. a stale
    // in-DB map) would resurrect nodes the publisher explicitly cleared.
    if (Object.keys(candidates).length === 0) return candidates;
    // A non-empty section must be a real node map; otherwise it is malformed.
    return isNodeMap(candidates) ? candidates : null;
  } catch (error: any) {
    console.warn(`[DialogueResolver] CDN content fetch failed for ${contentUrl}: ${error?.message}`);
    return null;
  }
}

/**
 * Fetch the full `{ nodes, leaves }` content blob for a chunk via
 * `content_url`. Chunks are published as `{ nodes, leaves }`
 * (see compiler.ts), so the resolver hydrates BOTH sections from the CDN
 * rather than taking `leaves` from the in-DB column.
 *
 * Note: tree blobs are `{ nodes }` only, so `loadBaseTree` keeps using
 * `fetchNodesFromContentUrl`; this sibling is chunk-specific.
 *
 * On a missing pointer, MinIO fetch error, or JSON parse error this returns
 * `null`; the resolver treats that as an unavailable required chunk payload.
 * The fallback argument is retained for payload-shape compatibility, but
 * callers no longer have an in-DB JSONB source after M32.
 */
export async function fetchChunkFromContentUrl(
  contentUrl: string | null | undefined,
  _fallback: { nodes: Record<string, DialogueNode>; leaves: Record<string, Leaf> }
): Promise<{ nodes: Record<string, DialogueNode>; leaves: Record<string, Leaf> } | null> {
  if (!contentUrl) return null;
  try {
    const parsed = (await fetchContentJson(contentUrl)) as
      | { nodes?: Record<string, DialogueNode>; leaves?: Record<string, Leaf> }
      | null
      | undefined;
    // A present-but-empty section is treated as unavailable. A malformed
    // (array / non-record) section is likewise discarded.
    const candidateNodes = parsed?.nodes;
    const candidateLeaves = parsed?.leaves;
    const nodes =
      candidateNodes && isNodeMap(candidateNodes) && Object.keys(candidateNodes).length > 0
        ? candidateNodes
        : null;
    const leaves =
      candidateLeaves && isLeafMap(candidateLeaves) && Object.keys(candidateLeaves).length > 0
        ? candidateLeaves
        : null;
    if (nodes === null && leaves === null) return null;
    return {
      nodes: nodes ?? {},
      leaves: leaves ?? {},
    };
  } catch (error: any) {
    console.warn(`[DialogueResolver] CDN content fetch failed for ${contentUrl}: ${error?.message}`);
    return null;
  }
}
