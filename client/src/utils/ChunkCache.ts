/**
 * 7.5.4 — Radar Prefetcher: client-side chunk cache.
 *
 * When a chunk is rendered, its FREE leaves (no TB cost, no conditions) are
 * prefetched in the background and stored here. On a cache hit, the UI swaps
 * instantly without a network round-trip; the /choose call fires in the
 * background to update server save state.
 */

import * as api from './api';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedChunk {
  id: string;
  chunk_key: string;
  nodes: Record<string, any>;
  leaves: Record<string, any>;
  fetchedAt: number;
}

class ChunkCache {
  private cache = new Map<string, CachedChunk>();

  /**
   * Prefetch a chunk by ID if not already cached. Silent on failure —
   * prefetch is best-effort; the normal network path is the fallback.
   */
  async prefetch(chunkId: string): Promise<void> {
    if (this.has(chunkId)) return;
    try {
      const res = await api.getDialogueChunk(chunkId);
      if (res.success && res.data) {
        this.set(chunkId, res.data);
      }
    } catch {
      // Intentionally swallowed — prefetch failures are non-fatal
    }
  }

  get(chunkId: string): CachedChunk | undefined {
    const entry = this.cache.get(chunkId);
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      this.cache.delete(chunkId);
      return undefined;
    }
    return entry;
  }

  has(chunkId: string): boolean {
    return this.get(chunkId) !== undefined;
  }

  set(chunkId: string, chunk: Omit<CachedChunk, 'fetchedAt'>): void {
    this.cache.set(chunkId, { ...chunk, fetchedAt: Date.now() });
  }

  evict(chunkId: string): void {
    this.cache.delete(chunkId);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const chunkCache = new ChunkCache();
