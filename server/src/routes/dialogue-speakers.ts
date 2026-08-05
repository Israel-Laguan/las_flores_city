import { queryOLTP } from '../database/connection.js';
import { signMinioUrl } from '../services/StorageService.js';

// ============================================================
// Dialogue speaker resolution (VN visual metadata)
//
// Chunk dialogue responses currently ship raw nodes whose only
// reference to the speaker is `speaker_id`. The client VN viewport
// needs name/title plus the character's `portrait_urls` array so it
// can resolve expression-specific portraits (visual.expression) with
// a fallback to the default entry.
//
// `resolveChunkSpeakers` bulk-loads the characters for every distinct
// speaker_id in a node record and returns a `speakerId -> info` map,
// attached as `data.speakers` on the /dialogue/start, /dialogue/choose
// and /dialogue/active responses.
//
// MinIO `s3://` URLs in portrait_urls are signed into browser-reachable
// presigned HTTP URLs (a generous TTL so a session can re-render the
// same node without re-fetching).
//
// This module is deliberately separate from dialogue-response-helpers.ts
// (which stays pure for its property tests).
// ============================================================

// Signed-URL TTL for dialogue portraits (seconds). Generous so the
// client can re-render a node's portrait across a session.
const PORTRAIT_URL_TTL = 3600;

export interface DialogueSpeakerInfo {
  name: string;
  title?: string | null;
  avatar_url?: string | null;
  portrait_urls?: Array<{ url: string; label?: string; expression?: string }> | null;
}

export type DialogueSpeakers = Record<string, DialogueSpeakerInfo>;

/** Collect the distinct, non-empty speaker_ids referenced by a node record. */
export function collectSpeakerIds(nodes: Record<string, any>): string[] {
  const ids = new Set<string>();
  for (const node of Object.values(nodes)) {
    if (node && typeof node.speaker_id === 'string' && node.speaker_id.length > 0) {
      ids.add(node.speaker_id);
    }
  }
  return [...ids];
}

/** Sign a MinIO s3:// portrait URL into a browser-reachable presigned URL. */
async function signPortraitUrl(url: string): Promise<string> {
  if (typeof url === 'string' && url.startsWith('s3://')) {
    return signMinioUrl(url, PORTRAIT_URL_TTL);
  }
  return url;
}

async function signPortraitUrls(
  entries: Array<{ url: string; label?: string; expression?: string }> | null
): Promise<Array<{ url: string; label?: string; expression?: string }> | null> {
  if (!Array.isArray(entries) || entries.length === 0) return entries;
  return Promise.all(
    entries.map(async (e) => ({ ...e, url: await signPortraitUrl(e.url) }))
  );
}

/**
 * Bulk-load characters for every speaker_id referenced in `nodes`.
 * Returns an empty map when no speaker is present.
 *
 * Uses `id::text = ANY($1::text[])` instead of `id = ANY($1::uuid[])`
 * so a non-UUID speaker_id (the DialogueNodeSchema only constrains it
 * to `z.string()`) degrades to absence rather than a cast error.
 */
export async function resolveChunkSpeakers(
  nodes: Record<string, any>
): Promise<DialogueSpeakers> {
  const ids = collectSpeakerIds(nodes);
  if (ids.length === 0) return {};

  const result = await queryOLTP<{
    id: string;
    name: string;
    title: string | null;
    avatar_url: string | null;
    portrait_urls: Array<{ url: string; label?: string; expression?: string }> | null;
  }>(
    `SELECT id, name, title, avatar_url, portrait_urls
     FROM characters
     WHERE id::text = ANY($1::text[])`,
    [ids]
  );

  const speakers: DialogueSpeakers = {};
  for (const row of result.rows) {
    speakers[row.id] = {
      name: row.name,
      title: row.title,
      avatar_url: row.avatar_url ? await signPortraitUrl(row.avatar_url) : row.avatar_url,
      portrait_urls: await signPortraitUrls(row.portrait_urls),
    };
  }
  return speakers;
}
