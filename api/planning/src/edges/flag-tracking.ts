// api/planning/src/edges/flag-tracking.ts
// SC-205: Track flags set vs read per entity
// Uses SC-203's static flag-slug list (not a second parser)
// Shape consumable by later entity_edges projection

import type { ConditionExpr, SceneDef } from '@las-flores/api-contracts';
import { extractFlagSlugs, isConditionExpr } from '@las-flores/api-contracts';

/**
 * Entity payload structure that may contain conditions and effects.
 * This is a simplified representation of the full entity structure.
 * In practice, this would come from dialogue trees, scenes, missions, etc.
 */
export interface EntityPayload {
  /** Unique identifier for this entity */
  id: string;
  /** Entity type (e.g., 'scene', 'dialogue', 'choice', 'effect') */
  type: string;
  /** Conditions that must be true for this entity to be active/visible */
  conditions?: ConditionExpr | ConditionExpr[];
  /** Effects that this entity triggers when activated */
  effects?: EntityEffects;
  /** Child entities (for hierarchical structures) */
  children?: EntityPayload[];
}

/**
 * Effects that an entity can trigger.
 */
export interface EntityEffects {
  /** Flags to set when this entity is activated */
  flag_set?: FlagSetEffect[];
  /** Flags to clear when this entity is activated */
  flag_clear?: string[];
  /** Other effects (non-flag) */
  other?: Record<string, unknown>;
}

/**
 * Effect to set a flag to a specific value.
 */
export interface FlagSetEffect {
  /** The flag slug to set */
  flag: string;
  /** The value to set (true = set, false = clear) */
  value: boolean;
}

/**
 * A single reader of a flag: the entity that reads it plus, when the read is
 * choice-scoped, the id of the choice that owns it.
 */
export interface FlagRead {
  /** The flag slug read */
  flag: string;
  /**
   * The choice_id of the choice that reads it, or undefined when the read is not
   * choice-scoped.
   */
  choiceId?: string;
}

/**
 * A single write to a flag, attributed to the entity whose effects performed it.
 *
 * Attribution is required, not cosmetic: a scene that sets a flag while a nested
 * choice later clears it has two *different* edges (sets_flag on the scene,
 * clears_flag on the choice). Collapsing to one per-slug last-writer-wins value
 * would emit a lone clears_flag stamped with the scene's from_slug, losing both
 * the scene's sets_flag and the child's own edge.
 */
export interface FlagWrite {
  /** The flag slug written */
  flag: string;
  /** The value written (true = sets_flag, false = clears_flag) */
  value: boolean;
  /** The id of the entity whose effects performed the write */
  entityId: string;
  /** The type of that entity (e.g. 'scene', 'dialogue', 'choice') */
  entityType: string;
}

/**
 * Result of extracting flag usage from an entity payload.
 * Contains two sets: flags that are SET (written) and flags that are READ.
 */
export interface FlagUsage {
  /**
   * Every flag slug written by this entity or its children.
   *
   * The *values* and their attribution live in `writes` — `sets` cannot express
   * them (a `flag_set` with value false and a `flag_clear` entry are both
   * "touched" flags, and projecting both as `sets_flag` reported a clear as a
   * set).
   */
  sets: Set<string>;
  /** Every write, one entry per writing entity, in walk order. */
  writes: FlagWrite[];
  /**
   * Every read, one entry per reader, in walk order.
   *
   * Per SC-S1's finding, requires_flag edges MUST retain choice_id. A plain
   * Set<string> collapsed child choice reads into the parent, and even a
   * Map<string, choiceId> keyed by slug conflated two choices reading the same
   * flag — parents are walked before children, so the parent's entry won and the
   * child choice_id was dropped, emitting a single requires_flag edge for that
   * slug. That is precisely the gated-vs-ungated conflation SC-701 / SC-S1 calls
   * out, so readers are kept as a list rather than collapsed per slug.
   */
  reads: FlagRead[];
}

/**
 * Shape consumable by entity_edges projection.
 * Per SC-S1's finding, requires_flag edges MUST retain choice_id in attrs.
 * This is the output format for the flag-tracking analysis.
 */
export interface FlagEdge {
  /** Source entity type */
  from_type: string;
  /** Source entity slug/ID */
  from_slug: string;
  /** Type of edge (requires_flag, sets_flag, clears_flag) */
  edge_kind: 'requires_flag' | 'sets_flag' | 'clears_flag';
  /** Target entity type (always 'flag' for flag edges) */
  to_type: 'flag';
  /** Target flag slug */
  to_slug: string;
  /** Additional attributes for the edge */
  attrs: {
    /** For choice edges: the choice_id that requires this flag */
    choice_id?: string;
    /** For set edges: the value being set */
    value?: boolean;
  };
}

/**
 * Entity type stamped on edges from a SceneDef. Deliberately NOT `scene`: in the
 * plan-intake/graph code a bare "scene" means a legacy location row (SC-S12), so the
 * new entity gets its own kind.
 */
export const SCENE_DEF_ENTITY_TYPE = 'scene_def';

/** A SceneDef is told apart from an EntityPayload by having a `slug` and no `type`. */
function isSceneDef(input: EntityPayload | SceneDef): input is SceneDef {
  return 'slug' in input && !('type' in input);
}

/**
 * Adapts a SceneDef to the payload walked by the extractor (SC-310). Its only flag
 * reads are in `availability`; it carries no effects yet, so `sets` is always empty —
 * when scenes gain effects, set them here so the extraction below picks them up.
 */
function sceneDefToPayload(scene: SceneDef): EntityPayload {
  return { id: scene.slug, type: SCENE_DEF_ENTITY_TYPE, conditions: scene.availability };
}

function toEntityPayload(input: EntityPayload | SceneDef): EntityPayload {
  return isSceneDef(input) ? sceneDefToPayload(input) : input;
}

/**
 * Extracts flag usage from an entity payload (or a SceneDef — SC-310).
 * Walks conditions and effects to find all flag references.
 * Uses extractFlagSlugs from SC-203 (not a second parser).
 */
export function extractFlagUsage(input: EntityPayload | SceneDef): FlagUsage {
  const payload = toEntityPayload(input);
  const sets = new Set<string>();
  const writes: FlagWrite[] = [];
  const reads: FlagRead[] = [];

  extractFlagUsageFromPayload(payload, sets, writes, reads);

  return { sets, writes, reads };
}

/**
 * Entity types whose own reads are attributed to their own id as choice_id.
 * A child choice that requires a flag owns that requires_flag edge; merging it
 * into the parent under the parent's choice_id loses the reference SC-S1 needs.
 */
const CHOICE_ENTITY_TYPES = new Set(['choice']);

function extractFlagUsageFromPayload(
  payload: EntityPayload,
  sets: Set<string>,
  writes: FlagWrite[],
  reads: FlagRead[],
  choiceId?: string,
): void {
  // A choice child carries its own choice_id for its condition reads.
  const effectiveChoiceId = CHOICE_ENTITY_TYPES.has(payload.type)
    ? payload.id
    : choiceId;

  // Extract from conditions
  if (payload.conditions) {
    const conditions = Array.isArray(payload.conditions)
      ? payload.conditions
      : [payload.conditions];
    for (const condition of conditions) {
      if (isConditionExpr(condition)) {
        const slugs = extractFlagSlugs(condition);
        for (const slug of slugs) {
          // One entry per reader: a parent and a child choice reading the same
          // slug are two distinct requires_flag edges, so neither may displace
          // the other.
          reads.push({ flag: slug, choiceId: effectiveChoiceId });
        }
      }
    }
  }

  // Extract from effects, attributed to *this* entity.
  if (payload.effects) {
    extractFromEffects(payload.effects, sets, writes, payload.id, payload.type);
  }

  // Recursively extract from children
  if (payload.children) {
    for (const child of payload.children) {
      extractFlagUsageFromPayload(child, sets, writes, reads, effectiveChoiceId);
    }
  }
}

function extractFromEffects(
  effects: EntityEffects,
  sets: Set<string>,
  writes: FlagWrite[],
  entityId: string,
  entityType: string,
): void {
  if (effects.flag_set) {
    for (const { flag, value } of effects.flag_set) {
      sets.add(flag);
      writes.push({ flag, value, entityId, entityType });
    }
  }

  if (effects.flag_clear) {
    for (const flag of effects.flag_clear) {
      sets.add(flag);
      writes.push({ flag, value: false, entityId, entityType });
    }
  }
}

/**
 * Extracts flag usage from a condition expression directly.
 * Returns only the read flags (since conditions only read, not set).
 */
export function extractFlagReadsFromCondition(
  condition: ConditionExpr,
): Set<string> {
  const reads = new Set<string>();
  const slugs = extractFlagSlugs(condition);
  for (const slug of slugs) {
    reads.add(slug);
  }
  return reads;
}

/**
 * Extracts flag sets from effects.
 * Returns the flags that are set/cleared.
 */
export function extractFlagSetsFromEffects(effects: EntityEffects): Set<string> {
  const sets = new Set<string>();
  extractFromEffects(effects, sets, [], '', '');
  return sets;
}

/**
 * Converts flag usage to edges for entity_edges projection.
 * Per SC-S1's finding, requires_flag edges MUST retain choice_id in attrs.
 *
 * One edge is emitted per *reader* for reads and per *writing entity* for writes.
 * Collapsing either to one edge per slug loses information the projection cannot
 * recover: a second choice gated on the same flag would vanish into the first
 * reader's edge, and a scene whose nested choice clears the flag it set would
 * lose its own sets_flag edge.
 *
 * @param usage - The flag usage to convert
 * @param entity - The source entity information
 * @param choiceId - Optional choice_id to include in attrs (for choice-level edges)
 */
export function flagUsageToEdges(
  usage: FlagUsage,
  entity: { type: string; slug: string },
  choiceId?: string,
  /**
   * The *id* of the entity the walk started from (`payload.id` in
   * `extractFlagUsage`). `usage.writes[].entityId` lives in that id domain, so
   * it must be compared against this, never against `entity.slug`.
   */
  rootId?: string,
): FlagEdge[] {
  const edges: FlagEdge[] = [];

  // requires_flag edges: one per read entry, each keeping its own choice_id when
  // the walk attributed one (a child choice); otherwise fall back to the choice_id
  // supplied by the caller.
  for (const { flag, choiceId: readChoiceId } of usage.reads) {
    const attrsChoiceId = readChoiceId ?? choiceId;
    edges.push({
      from_type: entity.type,
      from_slug: entity.slug,
      edge_kind: 'requires_flag',
      to_type: 'flag',
      to_slug: flag,
      attrs: attrsChoiceId ? { choice_id: attrsChoiceId } : {},
    });
  }

  // sets_flag / clears_flag edges: one per write, carrying the value that was
  // actually written and stamped with the entity whose effects performed it.
  // `sets` is the union of all written slugs, so a hand-built usage with an empty
  // `writes` list still emits an edge for every touched slug — `true` is the
  // fallback when no write detail is known.
  const writtenSlugs = new Set(usage.writes.map((w) => w.flag));
  for (const flag of usage.sets) {
    if (!writtenSlugs.has(flag)) {
      edges.push({
        from_type: entity.type,
        from_slug: entity.slug,
        edge_kind: 'sets_flag',
        to_type: 'flag',
        to_slug: flag,
        attrs: { value: true },
      });
    }
  }
  for (const write of usage.writes) {
    // A write by the root entity the caller named keeps that entity's identity;
    // a descendant's write is attributed to the descendant, which is what makes
    // "scene sets X, nested choice clears X" two edges instead of one.
    const isRootEntity =
      !entity.slug ||
      write.entityId === '' ||
      (rootId !== undefined ? write.entityId === rootId : false);
    edges.push({
      from_type: isRootEntity ? entity.type : write.entityType,
      from_slug: isRootEntity ? entity.slug : write.entityId,
      edge_kind: write.value ? 'sets_flag' : 'clears_flag',
      to_type: 'flag',
      to_slug: write.flag,
      attrs: { value: write.value },
    });
  }

  return edges;
}

/**
 * Creates flag edges from an entity payload with choice_id support.
 * This is the main entry point for SC-S1 integration.
 */
export function createFlagEdges(
  input: EntityPayload | SceneDef,
  choiceId?: string,
): FlagEdge[] {
  const payload = toEntityPayload(input);
  const usage = extractFlagUsage(payload);
  return flagUsageToEdges(
    usage,
    { type: payload.type, slug: payload.id },
    choiceId,
    payload.id,
  );
}

/**
 * Validates that all flags referenced in conditions exist in the registry.
 * This would be used during content compilation to catch typos.
 */
export function validateFlagReferences(
  payload: EntityPayload | SceneDef,
  knownFlagSlugs: Set<string> | string[],
): { valid: boolean; missing: string[] } {
  const knownSlugs = new Set(knownFlagSlugs);
  const usage = extractFlagUsage(payload);
  const missing = new Set<string>();

  for (const { flag } of usage.reads) {
    if (!knownSlugs.has(flag)) {
      missing.add(flag);
    }
  }

  for (const flag of usage.sets) {
    if (!knownSlugs.has(flag)) {
      missing.add(flag);
    }
  }

  // A flag that is both read and written appeared in both loops above. Report it
  // once: duplicate entries read as two distinct defects to any consumer that
  // renders the list.
  const missingSlugs = [...missing].sort();
  return {
    valid: missingSlugs.length === 0,
    missing: missingSlugs,
  };
}
