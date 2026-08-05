// ============================================================
// Client-side expression portrait resolution
//
// Mirrors the server's AssetStageResolver.resolveAssetUrl filter
// semantics (expression-tagged `portrait_urls` entries with a
// fallback to the first usable URL) for the VN viewport. The
// browser does not have NODE_ENV stage priority — stage-tagged
// URLs in the payload are already the env-appropriate set served
// by the server — so stage ranking is intentionally omitted.
// ============================================================

import type { DialogueSpeakerInfo } from '../types/dialogue';

export function resolvePortraitUrl(
  speaker: DialogueSpeakerInfo | undefined | null,
  expression?: string
): string | null {
  if (!speaker) return null;

  const entries = Array.isArray(speaker.portrait_urls) ? speaker.portrait_urls : [];

  const usable = (url: string | undefined): url is string =>
    typeof url === 'string' && url.length > 0;

  // 1. Prefer an entry whose expression tag matches (case-insensitive).
  if (expression) {
    const match = entries.find(
      (e) => e && typeof e.expression === 'string' && e.expression.toLowerCase() === expression.toLowerCase()
    );
    if (match && usable(match.url)) return match.url;
  }

  // 2. Fallback: the first usable URL in the array (default portrait).
  const fallback = entries.find((e) => e && usable(e.url));
  if (fallback) return fallback.url;

  // 3. Last resort: the legacy avatar_url.
  return usable(speaker.avatar_url ?? undefined) ? speaker.avatar_url! : null;
}

/**
 * A single asset entry (mirrors shared `AssetEntry` / `AssetEntrySchema`).
 */
export interface ResolvableAssetEntry {
  url: string;
  label?: string;
  expression?: string;
}

/**
 * Resolve a dialogue backdrop from the node's `visual.background`, the
 * scene's expression-tagged variant pool, or the current scene backdrop.
 *
 * Resolution priority:
 *   1. `visualBackground` — when present (a URL or plain filename) it is
 *      authoritative and returned directly.
 *   2. `expression` + `backgroundUrls[]` — a variant whose `expression` tag
 *      matches (case-insensitive) is preferred over the default.
 *   3. First usable URL in `backgroundUrls[]` (the default variant).
 *   4. `sceneBackground` — the current scene backdrop fallback.
 */
export function resolveBackgroundUrl(
  visualBackground: string | undefined,
  sceneBackground: string | undefined,
  expression?: string,
  backgroundUrls?: ResolvableAssetEntry[],
): string | null {
  if (typeof visualBackground === 'string' && visualBackground.trim().length > 0) {
    return visualBackground.trim();
  }

  const usable = (url: string | undefined): url is string =>
    typeof url === 'string' && url.length > 0;

  if (Array.isArray(backgroundUrls) && backgroundUrls.length > 0) {
    // 2. Prefer a variant whose expression tag matches the hint.
    if (expression) {
      const match = backgroundUrls.find(
        (e) => e && typeof e.expression === 'string' &&
          e.expression.toLowerCase() === expression.toLowerCase() &&
          usable(e.url),
      );
      if (match) return match.url;
    }
    // 3. Fall back to the first usable variant (the default).
    const fallback = backgroundUrls.find((e) => e && usable(e.url));
    if (fallback) return fallback.url;
  }

  // 4. Last resort: the current scene backdrop.
  return typeof sceneBackground === 'string' && sceneBackground.trim().length > 0
    ? sceneBackground.trim()
    : null;
}