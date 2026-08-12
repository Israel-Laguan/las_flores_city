// ============================================================
// ContentPublishService - Dialogue content externalization (M23)
//
// Publishes the heavy dialogue content blobs (dialogue tree nodes
// and AOT-compiled chunk sub-graphs) to MinIO/CDN and returns the
// `s3://` content URLs that the DB rows store as `content_url`.
//
// Object keys are content-addressed (`<scope>/<id>__<hash>.json`),
// so a blob is immutable: any content change yields a different
// hash → a new object key → the DB `content_url` pointer updates →
// the DialogueResolver's cache key (which incorporates the pointer)
// forces re-resolution. This is what keeps the CDN from ever
// serving stale blobs.
//
// Publishing is best-effort: callers wrap these in try/catch and
// continue with an in-DB fallback (`content_url` stays NULL) when
// MinIO is unavailable. The resolver handles the NULL fallback.
// ============================================================

import { createHash } from 'node:crypto';
import { uploadToMinio } from './StorageService.js';

const CONTENT_TYPE_JSON = 'application/json';

function shortHash(payload: string): string {
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Publish a dialogue tree's full `nodes` map to MinIO under a
 * content-addressed key and return its `s3://` URL.
 *
 * @param treeId UUID of the dialogue tree (used in the object key —
 *   `dialogue_trees` has no slug column).
 * @param payload The serialized nodes content to publish.
 * @returns `s3://bucket/dialogues/<treeId>__<hash>.json`
 */
export async function publishDialogueTree(
  treeId: string,
  payload: string
): Promise<string> {
  const hash = shortHash(payload);
  const objectKey = `dialogues/${treeId}__${hash}.json`;
  return uploadToMinio(Buffer.from(payload, 'utf-8'), objectKey, CONTENT_TYPE_JSON);
}

/**
 * Publish a compiled chunk's `{ nodes, leaves }` payload to MinIO
 * under a content-addressed key scoped by the owning tree, and
 * return its `s3://` URL.
 *
 * @param treeId UUID of the owning dialogue tree.
 * @param chunkKey The chunk's entry-node id.
 * @param payload The serialized `{ nodes, leaves }` chunk content.
 * @returns `s3://bucket/chunks/<treeId>/<chunkKey>__<hash>.json`
 */
export async function publishDialogueChunk(
  treeId: string,
  chunkKey: string,
  payload: string
): Promise<string> {
  const hash = shortHash(payload);
  // chunkKey originates from YAML/compiler node ids; keep it URL-safe.
  const safeChunkKey = encodeURIComponent(chunkKey);
  const objectKey = `chunks/${treeId}/${safeChunkKey}__${hash}.json`;
  return uploadToMinio(Buffer.from(payload, 'utf-8'), objectKey, CONTENT_TYPE_JSON);
}