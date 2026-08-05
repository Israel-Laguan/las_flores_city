import { queryOLTP } from '../database/connection.js';
import { signMinioUrl, isMinioUrl } from '../services/StorageService.js';
import { resolveStageOrderedPool } from '../services/AssetStageResolver.js';

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

/**
 * Sign a MinIO portrait URL into a browser-reachable presigned URL.
 *
 * Recognizes both `s3://` references and existing HTTP(S) URLs that point at
 * the MinIO bucket (e.g. the Docker-only `http://minio:9000/...` URLs found in
 * content YAML). Without this, HTTP-form MinIO portraits pass through on the
 * `minio` hostname, which browsers cannot resolve, and dialogue portraits fail
 * to load. `signMinioUrl` resolves the object by bucket/key regardless of the
 * URL's host, so signing an HTTP-form URL yields a browser-reachable presigned
 * URL against the configured endpoint.
 */
async function signPortraitUrl(url: string): Promise<string> {
  if (typeof url === 'string' && isMinioUrl(url)) {
    return signMinioUrl(url, PORTRAIT_URL_TTL);
  }
  return url;
}

/**
 * Sign a single portrait URL, never rejecting. On failure we log a warning
 * and return a safe fallback (the original URL) so one bad asset cannot
 * 500 the dialogue routes after a state transition already committed.
 */
async function trySignPortraitUrl(url: string): Promise<string> {
  try {
    return await signPortraitUrl(url);
  } catch (err) {
    console.warn(`[dialogue-speakers] failed to sign portrait URL, using fallback: ${url}`, err);
    return url;
  }
}

/**
 * Sign every entry in a portrait_urls array in parallel. A signing failure on
 * one entry omits that entry (so the route never rejects) while preserving the
 * rest.
 */
async function signPortraitUrls(
  entries: Array<{ url: string; label?: string; expression?: string }> | null
): Promise<Array<{ url: string; label?: string; expression?: string }> | null> {
  if (!Array.isArray(entries) || entries.length === 0) return entries;
  const signed = await Promise.all(
    entries.map(async (e) => {
      if (!e || typeof e !== 'object' || typeof e.url !== 'string' || !e.url) {
        // Never let a malformed entry crash the route — log and omit it.
        console.warn(`[dialogue-speakers] skipped malformed portrait_urls entry: ${e?.url ?? '<invalid entry>'}`);
        return null;
      }
      try {
        return { ...e, url: await signPortraitUrl(e.url) };
      } catch (err) {
        console.warn(`[dialogue-speakers] failed to sign portrait URL, omitting: ${e.url}`, err);
        return null;
      }
    })
  );
  return signed.filter((e): e is NonNullable<typeof e> => e !== null);
}

/** Matches canonical UUIDs so we can use the characters.id uuid index. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bulk-load characters for every speaker_id referenced in `nodes`.
 * Returns an empty map when no speaker is present.
 *
 * Malformed (non-UUID) speaker_ids are filtered out before the query so the
 * predicate can use the `id` uuid index (`id = ANY($1::uuid[])`) instead of
 * casting `id::text`; an invalid id is treated as absent rather than a cast
 * error.
 */
export async function resolveChunkSpeakers(
  nodes: Record<string, any>
): Promise<DialogueSpeakers> {
  const ids = collectSpeakerIds(nodes);
  if (ids.length === 0) return {};

  const validIds = ids.filter((id) => UUID_RE.test(id));

  const result = await queryOLTP<{
    id: string;
    name: string;
    title: string | null;
    avatar_url: string | null;
    portrait_urls: Array<{ url: string; label?: string; expression?: string }> | null;
  }>(
    `SELECT id, name, title, avatar_url, portrait_urls
     FROM characters
     WHERE id = ANY($1::uuid[])`,
    [validIds]
  );

  const speakers: DialogueSpeakers = {};
  // Resolve each row in parallel; per-row signing is also parallelized (see
  // signPortraitUrls) so many-node chunks don't serialize DB + signing work.
  await Promise.all(
    result.rows.map(async (row) => {
      speakers[row.id] = {
        name: row.name,
        title: row.title,
        avatar_url: row.avatar_url ? await trySignPortraitUrl(row.avatar_url) : row.avatar_url,
        // Order the pool by the current env's stage priority (production
        // entries first in production, dev first in dev) so the client's
        // first-match expression lookup and first-usable fallback select the
        // env-appropriate URL rather than whichever stage happens to be first
        // in the canonical YAML.
        portrait_urls: await signPortraitUrls(resolveStageOrderedPool(row.portrait_urls)),
      };
    })
  );
  return speakers;
}
