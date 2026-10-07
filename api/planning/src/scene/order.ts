// api/planning/src/scene/order.ts
// The one overlay compose order (SC-303b): `(priority asc, slug asc)`.

export const compareSlug = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Copy of `overlays` sorted `(priority asc, slug asc)`; the input is not mutated. */
export function sortOverlays<T extends { priority: number; slug: string }>(overlays: ReadonlyArray<T>): T[] {
  return [...overlays].sort((a, b) => a.priority - b.priority || compareSlug(a.slug, b.slug));
}
