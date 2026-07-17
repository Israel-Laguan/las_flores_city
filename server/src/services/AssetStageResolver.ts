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

// Resolve the best URL for an asset from its stage-tagged entries.
// `expression` narrows eligible entries by mood before stage priority is
// applied (preserves the existing mood-match behavior).
export function resolveAssetUrl(
  entries: AssetEntry[] | null | undefined,
  opts?: { expression?: string },
): string | null {
  if (!entries || entries.length === 0) return null;
  const env = getEnv();
  const eligible = opts?.expression
    ? entries.filter(e => (e.expression || '').toLowerCase() === opts.expression!.toLowerCase())
    : entries;
  // If the expression filter emptied the set, fall back to all entries.
  const pool = eligible.length > 0 ? eligible : entries;

  for (const stage of STAGE_PRIORITY[env]) {
    const match = pool.find(e => e.label === stage && typeof e.url === 'string' && e.url.length > 0);
    if (match) return match.url;
  }
  // Fallback: first entry with a usable URL (canonical).
  return pool.find(e => typeof e.url === 'string' && e.url.length > 0)?.url ?? null;
}

// Companion that returns the resolved URL and which stage it came from.
export function resolveAssetStage(
  entries: AssetEntry[] | null | undefined,
  opts?: { expression?: string },
): { url: string; stage: string } | null {
  if (!entries || entries.length === 0) return null;
  const env = getEnv();
  const eligible = opts?.expression
    ? entries.filter(e => (e.expression || '').toLowerCase() === opts.expression!.toLowerCase())
    : entries;
  const pool = eligible.length > 0 ? eligible : entries;

  for (const stage of STAGE_PRIORITY[env]) {
    const match = pool.find(e => e.label === stage && typeof e.url === 'string' && e.url.length > 0);
    if (match) return { url: match.url, stage };
  }
  const fallback = pool.find(e => typeof e.url === 'string' && e.url.length > 0);
  return fallback ? { url: fallback.url, stage: fallback.label || 'unknown' } : null;
}
