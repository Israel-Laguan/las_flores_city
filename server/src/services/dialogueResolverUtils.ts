import { createHash } from 'node:crypto';
import { DialogueNode } from '@las-flores/shared';

interface OverlayRow {
  nodes: Record<string, DialogueNode>;
  updated_at: Date;
  is_nsfw: boolean;
  unlock_condition?: 'none' | 'patreon_nsfw' | 'loyalist_only' | 'fugitive_only' | null;
}

function buildOverlayFingerprint(overlays: OverlayRow[]): string {
  const fingerprints = overlays
    .map((overlay) => `${overlay.updated_at.toISOString()}:${JSON.stringify(overlay.nodes)}`)
    .sort();

  return createHash('sha1').update(fingerprints.join('|')).digest('hex').slice(0, 16);
}

/**
 * Derive a stable short content-version token from a `content_url`
 * pointer. Because M23 object keys are content-addressed
 * (`<scope>/<id>__<hash>.json`), a changed blob yields a changed
 * pointer → a changed version token. Including this in the resolver
 * cache key makes the cache self-healing: a re-migration that bumps
 * the pointer forces fresh resolution even if the pattern invalidate
 * didn't fire.
 *
 * When `content_url` is NULL/empty, `fallbackRevision` is hashed as a
 * substitute revision token; if the caller passes a non-empty
 * `fallbackRevision`, a changed revision still forces fresh resolution.
 * Only when BOTH are absent does this return the constant `'base'`.
 */
function coerceRevision(revision: unknown): string | undefined {
  if (revision == null) return undefined;
  if (typeof revision === 'string') return revision;
  if (revision instanceof Date) return revision.toISOString();
  return String(revision);
}

function contentVersionFromUrl(contentUrl?: string | null, fallbackRevision?: unknown): string {
  if (!contentUrl) {
    const rev = coerceRevision(fallbackRevision);
    return rev ? createHash('sha256').update(rev).digest('hex').slice(0, 16) : 'base';
  }
  return createHash('sha256').update(contentUrl).digest('hex').slice(0, 16);
}

/**
 * Deep-merge a base nodes dict with overlay nodes.
 *
 * Per-node merge: spread base first, then overlay — the overlay
 * overwrites the base for every key it provides. Arrays (e.g.
 * `choices`) are fully replaced by the overlay's array, never
 * element-wise merged. Nodes present only in the overlay are
 * added to the merged dict.
 */
export function deepMergeNodes(
  baseNodes: Record<string, DialogueNode>,
  overlayNodes: Record<string, DialogueNode>
): Record<string, DialogueNode> {
  const merged: Record<string, DialogueNode> = { ...baseNodes };

  for (const [nodeId, overlayNode] of Object.entries(overlayNodes)) {
    if (merged[nodeId]) {
      merged[nodeId] = { ...merged[nodeId], ...overlayNode };
    } else {
      merged[nodeId] = { ...overlayNode };
    }
  }

  return merged;
}

export {
  buildOverlayFingerprint,
  contentVersionFromUrl,
};
