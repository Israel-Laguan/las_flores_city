// api/planning/src/edges/flag-tracking.ts
// SC-205: Track flags set vs read per entity
// Uses SC-203's static flag-slug list (not a second parser)
// Shape consumable by later entity_edges projection

import type {
  ConditionExpr,
  FlagCondition,
} from '@las-flores/api-contracts';
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
 * Result of extracting flag usage from an entity payload.
 * Contains two sets: flags that are SET (written) and flags that are READ.
 */
export interface FlagUsage {
  /** Flags that are set/cleared by this entity or its children */
  sets: Set<string>;
  /** Flags that are read/checked by conditions in this entity or its children */
  reads: Set<string>;
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
 * Extracts flag usage from an entity payload.
 * Walks conditions and effects to find all flag references.
 * Uses extractFlagSlugs from SC-203 (not a second parser).
 */
export function extractFlagUsage(payload: EntityPayload): FlagUsage {
  const sets = new Set<string>();
  const reads = new Set<string>();

  extractFlagUsageFromPayload(payload, sets, reads);

  return { sets, reads };
}

function extractFlagUsageFromPayload(
  payload: EntityPayload,
  sets: Set<string>,
  reads: Set<string>,
): void {
  // Extract from conditions
  if (payload.conditions) {
    const conditions = Array.isArray(payload.conditions)
      ? payload.conditions
      : [payload.conditions];
    for (const condition of conditions) {
      if (isConditionExpr(condition)) {
        const slugs = extractFlagSlugs(condition);
        for (const slug of slugs) {
          reads.add(slug);
        }
      }
    }
  }

  // Extract from effects
  if (payload.effects) {
    extractFromEffects(payload.effects, sets);
  }

  // Recursively extract from children
  if (payload.children) {
    for (const child of payload.children) {
      extractFlagUsageFromPayload(child, sets, reads);
    }
  }
}

function extractFromEffects(effects: EntityEffects, sets: Set<string>): void {
  if (effects.flag_set) {
    for (const { flag, value } of effects.flag_set) {
      sets.add(flag);
    }
  }

  if (effects.flag_clear) {
    for (const flag of effects.flag_clear) {
      sets.add(flag);
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
  extractFromEffects(effects, sets);
  return sets;
}

/**
 * Converts flag usage to edges for entity_edges projection.
 * Per SC-S1's finding, requires_flag edges MUST retain choice_id in attrs.
 * 
 * @param usage - The flag usage to convert
 * @param entity - The source entity information
 * @param choiceId - Optional choice_id to include in attrs (for choice-level edges)
 */
export function flagUsageToEdges(
  usage: FlagUsage,
  entity: { type: string; slug: string },
  choiceId?: string,
): FlagEdge[] {
  const edges: FlagEdge[] = [];

  // Create requires_flag edges for read flags
  for (const flag of usage.reads) {
    edges.push({
      from_type: entity.type,
      from_slug: entity.slug,
      edge_kind: 'requires_flag',
      to_type: 'flag',
      to_slug: flag,
      attrs: choiceId ? { choice_id: choiceId } : {},
    });
  }

  // Create sets_flag edges for set flags
  // We don't know the value from just the slug, so we use a default
  for (const flag of usage.sets) {
    edges.push({
      from_type: entity.type,
      from_slug: entity.slug,
      edge_kind: 'sets_flag',
      to_type: 'flag',
      to_slug: flag,
      attrs: {},
    });
  }

  return edges;
}

/**
 * Creates flag edges from an entity payload with choice_id support.
 * This is the main entry point for SC-S1 integration.
 */
export function createFlagEdges(
  payload: EntityPayload,
  choiceId?: string,
): FlagEdge[] {
  const usage = extractFlagUsage(payload);
  return flagUsageToEdges(usage, { type: payload.type, slug: payload.id }, choiceId);
}

/**
 * Validates that all flags referenced in conditions exist in the registry.
 * This would be used during content compilation to catch typos.
 */
export function validateFlagReferences(
  payload: EntityPayload,
  knownFlagSlugs: Set<string> | string[],
): { valid: boolean; missing: string[] } {
  const knownSlugs = new Set(knownFlagSlugs);
  const usage = extractFlagUsage(payload);
  const missing: string[] = [];

  for (const flag of usage.reads) {
    if (!knownSlugs.has(flag)) {
      missing.push(flag);
    }
  }

  for (const flag of usage.sets) {
    if (!knownSlugs.has(flag)) {
      missing.push(flag);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
