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

import type { DialogueNodeVisual, DialogueSpeakerInfo } from '../types/dialogue';
import type { TimeOfDay } from './time';

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
 *      authoritative and returned directly (node authoring always wins).
 *   2. `hints` — an ordered list of expression tags tried in sequence; the
 *      first variant whose `expression` matches (case-insensitive) wins.
 *      A single string is treated as a one-element list (backward
 *      compatible). The caller builds precedence via `buildBackgroundHints`
 *      (game environment: weather > time-of-day > node mood).
 *   3. First usable URL in `backgroundUrls[]` (the default variant).
 *   4. `sceneBackground` — the current scene backdrop fallback.
 */
export function resolveBackgroundUrl(
  visualBackground: string | undefined,
  sceneBackground: string | undefined,
  hints?: string | string[],
  backgroundUrls?: ResolvableAssetEntry[],
): string | null {
  if (typeof visualBackground === 'string' && visualBackground.trim().length > 0) {
    return visualBackground.trim();
  }

  const usable = (url: string | undefined): url is string =>
    typeof url === 'string' && url.length > 0;

  if (Array.isArray(backgroundUrls) && backgroundUrls.length > 0) {
    // 2. Try each hint in order; first expression-tag match wins.
    for (const hint of normalizeHints(hints)) {
      const match = backgroundUrls.find(
        (e) => e && typeof e.expression === 'string' &&
          e.expression.toLowerCase() === hint.toLowerCase() &&
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

/**
 * Normalize a hint payload into a trimmed, de-duplicated (case-insensitive),
 * order-preserving list. Accepts a single tag or an ordered chain.
 */
function normalizeHints(hints: string | string[] | undefined): string[] {
  const raw = Array.isArray(hints) ? hints : hints ? [hints] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const hint of raw) {
    const trimmed = typeof hint === 'string' ? hint.trim() : '';
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Game-driven environment hint chain for background variants (Phase 4).
 *
 * Builds the ordered list the resolver tries against `background_urls[].expression`:
 *   1. `weather`    — strongest game signal, when it is NOT `'clear'`/absent.
 *   2. `timeOfDay`  — from the real in-game clock (`getTimeOfDay(timeBlocks)`);
 *                     `dusk` is mapped to the asset vocabulary tag `sunset`.
 *   3. `mood`       — soft author hint (Phase 1–3), CSS-canvas `mood` doubles
 *                     here; `'none'` contributes nothing.
 *
 * `weather` intentionally has no live source of truth today, so callers pass
 * `undefined` (or `'clear'`) and the auto-selection is time-of-day driven.
 * When a weather source lands, pass it in FIRST so it outranks time-of-day.
 */
const TIME_OF_DAY_ENV_TAGS: Record<TimeOfDay, string> = {
  day: 'day',
  dusk: 'sunset',
  night: 'night',
};

export function buildBackgroundHints(
  timeOfDay: TimeOfDay | undefined,
  weather?: string,
  mood?: DialogueNodeVisual['mood'],
): string[] {
  const hints: string[] = [];
  if (typeof weather === 'string' && weather.trim() && weather.trim().toLowerCase() !== 'clear') {
    hints.push(weather.trim());
  }
  if (timeOfDay) hints.push(TIME_OF_DAY_ENV_TAGS[timeOfDay]);
  if (mood && mood !== 'none') hints.push(mood);
  return normalizeHints(hints);
}