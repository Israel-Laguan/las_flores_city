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
 * Resolve a dialogue backdrop: node.visual.background is authoritative
 * when present (URL or plain filename). Otherwise fall back to the
 * current scene background URL captured on the VN layer.
 */
export function resolveBackgroundUrl(
  visualBackground: string | undefined,
  sceneBackground: string | undefined
): string | null {
  if (typeof visualBackground === 'string' && visualBackground.trim().length > 0) {
    return visualBackground.trim();
  }
  return typeof sceneBackground === 'string' && sceneBackground.trim().length > 0
    ? sceneBackground.trim()
    : null;
}