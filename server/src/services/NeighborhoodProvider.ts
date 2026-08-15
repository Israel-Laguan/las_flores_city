// ============================================================
// NeighborhoodProvider — gather the canon context for a plan's critique
//
// M26 seam (§13): the AI Critique Service queries a *neighborhood* (not a full
// content dump) before calling the LLM. This interface isolates where that
// neighborhood comes from so the substrate can change without touching the
// critique semantics:
//   - M26  (this milestone): `PostgresExistingNeighborhoodProvider` — reuses the
//     existing `ContentPlanService.gatherContext()` (Postgres + file-backed canon).
//   - M27-b (follow-up):        `Neo4jNeighborhoodProvider` — a bounded Cypher
//     traversal around each entity, once the graph substrate exists.
//
// The returned `ExistingContentContext` is also the cache-key input: two runs
// with an identical canon neighborhood hash are treated as the same subgraph.
//
// ── M27-b ADJACENCY (substrate contract — MUST stay true) ──────────────────
// The future `Neo4jNeighborhoodProvider` must reproduce the EXACT
// `ExistingContentContext` shape in `types/LLMTypes.ts`:
//   { characters: {id,name,role?,faction?,personality?,description?}[]
//     scenes:     {id,name,district,mood?,description?}[]
//     dialogues:  {id,name}[]
//     missions:   {id,title,description?}[]
//     overlays:   {id,name}[]
//     locations:  {id,name,district?,daytime?,nightlife?,history?}[] }
// The M27 base graph seeds the `(:Content)` nodes that map 1:1 onto these
// buckets (nodeType: Character, Scene, Dialogue, Mission, Overlay, Location),
// so a bounded Cypher traversal can gather exactly this shape. Because the
// provider is the ONLY consumer of that shape for the LLM prompt + input-hash,
// swapping the implementation must not change the prompt/cache logic at all.
// ============================================================

import { contentPlanService } from './ContentPlanService.js';
import type { ExistingContentContext } from './types/LLMTypes.js';

export interface NeighborhoodProvider {
  /** Gather the existing-canon context that defines the plan's neighborhood. */
  gatherContext(): Promise<ExistingContentContext>;
}

/** M26 default: gather canon from Postgres + files via the existing gatherer. */
export class PostgresExistingNeighborhoodProvider implements NeighborhoodProvider {
  async gatherContext(): Promise<ExistingContentContext> {
    return contentPlanService.gatherContext();
  }
}

export const postgresNeighborhoodProvider = new PostgresExistingNeighborhoodProvider();
