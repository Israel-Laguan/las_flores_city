type Env = 'development' | 'staging' | 'production';
type Stage = 'dev' | 'staging' | 'production';

export const STAGE_PRIORITY: Record<Env, ReadonlyArray<Stage>> = {
  development: ['dev', 'staging', 'production'],
  staging:     ['dev', 'staging', 'production'],
  production:  ['production', 'staging', 'dev'],
};

export function getEnv(): Env {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'development' || nodeEnv === 'staging') return nodeEnv;
  return 'production';
}

export interface AssetEntry { url: string; label?: string; expression?: string; }

function parseEntries(entries: any): AssetEntry[] | null {
  if (!entries) return null;
  if (Array.isArray(entries)) return entries;
  if (typeof entries === 'string' && entries.trim().startsWith('[')) {
    try {
      return JSON.parse(entries);
    } catch {
      return null;
    }
  }
  return null;
}

// Resolve the best URL for an asset from its stage-tagged entries.
// `expression` narrows eligible entries by mood before stage priority is
// applied (preserves the existing mood-match behavior).
export function resolveAssetUrl(
  entries: any,
  opts?: { expression?: string },
): string | null {
  const parsed = parseEntries(entries);
  if (!parsed || parsed.length === 0) return null;
  const env = getEnv();
  const eligible = opts?.expression
    ? parsed.filter(e => e && (e.expression || '').toLowerCase() === opts.expression!.toLowerCase())
    : parsed;
  // If the expression filter emptied the set, fall back to all entries.
  const pool = eligible.length > 0 ? eligible : parsed;

  for (const stage of STAGE_PRIORITY[env]) {
    const match = pool.find(e => e && e.label === stage && typeof e.url === 'string' && e.url.length > 0);
    if (match) return match.url;
  }
  // Fallback: first entry with a usable URL (canonical).
  return pool.find(e => e && typeof e.url === 'string' && e.url.length > 0)?.url ?? null;
}

// Companion that returns the resolved URL and which stage it came from.
export function resolveAssetStage(
  entries: any,
  opts?: { expression?: string },
): { url: string; stage: string } | null {
  const parsed = parseEntries(entries);
  if (!parsed || parsed.length === 0) return null;
  const env = getEnv();
  const eligible = opts?.expression
    ? parsed.filter(e => e && (e.expression || '').toLowerCase() === opts.expression!.toLowerCase())
    : parsed;
  const pool = eligible.length > 0 ? eligible : parsed;

  for (const stage of STAGE_PRIORITY[env]) {
    const match = pool.find(e => e && e.label === stage && typeof e.url === 'string' && e.url.length > 0);
    if (match) return { url: match.url, stage };
  }
  const fallback = pool.find(e => e && typeof e.url === 'string' && e.url.length > 0);
  return fallback ? { url: fallback.url, stage: fallback.label || 'unknown' } : null;
}
