export function finiteInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  if (!/^-?\d+$/.test(trimmed)) return fallback;
  const parsed = parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}