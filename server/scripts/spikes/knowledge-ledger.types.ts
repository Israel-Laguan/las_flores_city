/**
 * SC-S8 SCRATCH DRAFT — NOT MERGED. Intended home: api/contracts/src/knowledge
 * (a scratch branch was not cut: no commits were allowed in this session, so the
 * draft lives next to the harness). Compiles standalone; nothing imports it.
 *
 * Recommendation implemented here: explicit-only ledger over a REGISTRY of facts.
 */

/** Registry entry. Authored once per secret (dozens, not hundreds). */
export interface FactDef {
  readonly fact_id: string; // snake_case slug, unique, stable
  readonly summary: string; // one line, shown to authors/checker only
  readonly owner_character_id?: string; // who originally holds it (seed knowledge)
  readonly story_beat?: string; // optional visibility floor (beats from content/story_beats.yaml)
}

export type AcquiredVia = 'witnessed' | 'told' | 'inferred';

/** The knows_fact edge. character_id is the SUBJECT who knows (NPC or the player sentinel). */
export interface CharacterKnowsFact {
  readonly character_id: string;
  readonly fact_id: string;
  readonly source_scene: string; // scene/dialogue node that exposed it
  readonly acquired_via: AcquiredVia; // 'inferred' is never written by the deterministic projection
}

/** Authored on dialogue nodes / overlays / scenes: the ONLY way exposure is recorded. */
export interface FactExposure {
  readonly fact_refs: readonly string[]; // fact_ids revealed by this node/scene
  /** Who learns it. Default = every character in the scene's role slots + the player.
   *  `thought` text never exposes; list exclusions explicitly for eavesdropping cases. */
  readonly audience?: 'scene' | readonly string[];
  readonly excluded?: readonly string[];
}

/** Checker rule (deterministic, tier-3): a node whose speaker/subject asserts fact F
 *  (fact_refs ∋ F) is an error if the asserting character has no CharacterKnowsFact(F)
 *  and is not the registry owner. Projects into entity_edges as edge_kind 'knows_fact'. */
export type KnowsFactEdgeRow = {
  from_type: 'character';
  from_slug: string;
  edge_kind: 'knows_fact';
  to_type: 'fact';
  to_slug: string;
  attrs: { source_scene: string; acquired_via: AcquiredVia };
};
