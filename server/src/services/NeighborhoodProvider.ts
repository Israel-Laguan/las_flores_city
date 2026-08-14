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
