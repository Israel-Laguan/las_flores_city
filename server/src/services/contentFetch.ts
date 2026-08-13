// ============================================================
// M23 CDN content-fetch helpers (DialogueResolver)
//
// Pure helpers that load externalized dialogue content blobs from
// MinIO/CDN via `content_url` and gracefully fall back to the
// in-DB JSONB on any failure. Extracted from DialogueResolver.ts
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
 * for merging). On any failure (missing pointer, MINIO fetch error,
 * JSON parse error) this returns `null` so the caller can fall back to
 * the in-DB JSONB — the key to keeping the resolver resilient and the
 * existing tests green.
 */
export async function fetchNodesFromContentUrl(
  contentUrl: string | null | undefined,
  fallback: Record<string, DialogueNode>
): Promise<Record<string, DialogueNode> | null> {
  if (!contentUrl) return null;
  try {
    const parsed = (await fetchContentJson(contentUrl)) as
      | { nodes?: Record<string, DialogueNode> }
      | null
      | undefined;
    const candidates = parsed?.nodes;
    // Accept a CDN node map only when it is a non-empty record of records; a
    // missing/empty/malformed (e.g. array) section falls back to the DB JSONB.
    const nodes =
      candidates && isNodeMap(candidates) && Object.keys(candidates).length > 0
        ? candidates
        : null;
    return nodes ?? fallback;
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
 * Resilience mirrors `fetchNodesFromContentUrl`: on a missing pointer,
 * MinIO fetch error, or JSON parse error this returns `null` so the caller
 * falls back to the in-DB JSONB. When the blob is present but a given
 * section is empty, that section falls back to the corresponding DB value
 * (the all-empty case returns the full `fallback`).
 */
export async function fetchChunkFromContentUrl(
  contentUrl: string | null | undefined,
  fallback: { nodes: Record<string, DialogueNode>; leaves: Record<string, Leaf> }
): Promise<{ nodes: Record<string, DialogueNode>; leaves: Record<string, Leaf> } | null> {
  if (!contentUrl) return null;
  try {
    const parsed = (await fetchContentJson(contentUrl)) as
      | { nodes?: Record<string, DialogueNode>; leaves?: Record<string, Leaf> }
      | null
      | undefined;
    // A present-but-empty section is treated as missing so an empty CDN blob
    // falls back to the in-DB JSONB value — matching the sibling
    // `fetchNodesFromContentUrl` and this function's doc comment. A malformed
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
    if (nodes === null && leaves === null) return fallback;
    return {
      nodes: nodes ?? fallback.nodes,
      leaves: leaves ?? fallback.leaves,
    };
  } catch (error: any) {
    console.warn(`[DialogueResolver] CDN content fetch failed for ${contentUrl}: ${error?.message}`);
    return null;
  }
}
