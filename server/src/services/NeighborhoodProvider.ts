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
import { isNeo4jEnabled, runNeo4jQuery } from './Neo4jClient.js';
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

/** Coerce a value to an optional non-empty string (undefined when blank). */
function s(v: unknown): string | undefined {
  if (v == null) return undefined;
  const str = String(v);
  return str.length > 0 ? str : undefined;
}

/** A raw row from the base `:Content` traversal. */
interface ContentRow {
  nodeType: string;
  nodeId: string;
  name: string | null;
  props: Record<string, unknown>;
}

/**
 * Reassemble the seeded base graph into the exact `ExistingContentContext`
 * shape the M26 Postgres gatherer produces — the critique LLM + input-hash
 * depend on these field names, so this mapping must stay 1:1 with
 * `ContentPlanService.gatherContext()`.
 */
function groupContext(rows: ContentRow[]): ExistingContentContext {
  const ctx: ExistingContentContext = {
    characters: [],
    scenes: [],
    dialogues: [],
    missions: [],
    overlays: [],
    locations: [],
  };
  for (const row of rows) {
    const id = String(row.nodeId);
    const name = row.name ?? '';
    const props = row.props ?? {};
    switch (row.nodeType) {
      case 'Character':
        ctx.characters.push({
          id,
          name,
          role: s(props.role),
          faction: s(props.faction),
          personality: s(props.personality),
          description: s(props.description),
        });
        break;
      case 'Scene':
        // `district` is required (non-optional) in ExistingContentContext.
        ctx.scenes.push({
          id,
          name,
          district: s(props.district) ?? '',
          mood: s(props.mood),
          description: s(props.description),
        });
        break;
      case 'Dialogue':
        ctx.dialogues.push({ id, name });
        break;
      case 'Mission':
        // ExistingContentContext.missions uses `title` (not `name`); the base
        // graph stores a mission's title as its `name`.
        ctx.missions.push({ id, title: name, description: s(props.description) });
        break;
      case 'Overlay':
        ctx.overlays.push({ id, name });
        break;
      case 'Location':
        ctx.locations.push({
          id,
          name,
          district: s(props.district),
          daytime: s(props.daytime),
          nightlife: s(props.nightlife),
          history: s(props.history),
        });
        break;
      default:
        // District (and any future node types) are not part of the critique context.
        break;
    }
  }
  return ctx;
}

/**
 * M27-b: gather the critique neighborhood from the authoring graph. Traverses
 * the canonical base `:Content` layer (planId = null) and reassembles
 * `ExistingContentContext`. Degrades to the Postgres gatherer when Neo4j is
 * disabled/unreachable so critique semantics never change.
 */
export class Neo4jNeighborhoodProvider implements NeighborhoodProvider {
  async gatherContext(): Promise<ExistingContentContext> {
    if (!isNeo4jEnabled()) {
      return contentPlanService.gatherContext();
    }
    try {
      const rows = await runNeo4jQuery<ContentRow>(
        `MATCH (c:Content)
         WHERE c.planId IS null
           AND c.nodeType IN ['Character', 'Scene', 'Dialogue', 'Mission', 'Overlay', 'Location']
           AND (c.isEvidence IS NULL OR c.isEvidence = false)
         RETURN c.nodeType AS nodeType, c.nodeId AS nodeId, c.name AS name, properties(c) AS props
         ORDER BY c.nodeType, c.name, c.nodeId`,
      );
      return groupContext(rows);
    } catch (err) {
      console.warn('[NeighborhoodProvider] graph traversal failed, falling back to Postgres context:', (err as Error).message);
      return contentPlanService.gatherContext();
    }
  }
}

export const postgresNeighborhoodProvider = new PostgresExistingNeighborhoodProvider();
export const neo4jNeighborhoodProvider = new Neo4jNeighborhoodProvider();
