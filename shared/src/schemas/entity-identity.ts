import { z } from 'zod';
import { zodUuid } from './uuid.js';

// ---------------------------------------------------------------------------
// M25: Entity Identity Resolution + Bounded Conflict Detection
//
// §15.3 — Split entity identity from entity existence. Every entity has a
// stable `entity_id` separate from its aliases/names. Resolution is a
// dedicated pass that never lets the LLM silently decide identity: it returns
// exactly one of `matched` (a stable id), `new_candidate`, or `ambiguous`
// (with a set of alternatives for a human to pick from).
//
// §15.6 — Conflict detection is bounded, not exhaustive. Each run is scoped to
// the patch's neighborhood (nearby timeline, same location, same lineage) and
// records an honest "checked scope" so "how much did we check?" is answerable.
// ---------------------------------------------------------------------------

/** One known name/alias an entity goes by. Backed by the `entity_aliases` row. */
export const EntityAliasSchema = z.object({
  entityType: z.string(),
  entityId: zodUuid(),
  alias: z.string().min(1),
  source: z.string().min(1), // e.g. 'canonical_name' | 'yaml_aliases' | 'implicit'
  isPrimary: z.boolean().default(false),
});

export type EntityAlias = z.infer<typeof EntityAliasSchema>;

/** A single alternative offered when an identity is ambiguous. */
export const ResolutionAlternativeSchema = z.discriminatedUnion('kind', [
  // An already-existing entity the author can collapse to. `id` is the stable
  // entity id (must be present), `alias` is the entity's real canonical alias
  // (NOT the picker short-name) so server-side alias lookups key on the actual
  // stored spelling.
  z.object({
    kind: z.literal('existing'),
    /** Entity id — required; without it a choice is invalid and must never be
     *  silently committed as a brand-new entity. */
    id: zodUuid(),
    /** Stable entity_type.slug short-name for the picker, e.g. `a193 Marcus`. */
    name: z.string(),
    /** The entity's canonical alias this picker option maps to (e.g. `Marcus`). */
    alias: z.string(),
  }),
  // A brand-new variant the author wants to create (e.g. `Marcus II`). No id.
  z.object({
    kind: z.literal('new'),
    /** Stable entity_type.slug short-name for the picker, e.g. `new: Marcus II`. */
    name: z.string(),
    /** When true, the suffix space for this base name is exhausted and `name`
     *  is a human-readable "exhausted" notice, NOT a safe new variant. Callers
     *  must not commit it as a brand-new entity. Defaults to false. */
    exhausted: z.boolean().optional(),
  }),
]);

export type ResolutionAlternative = z.infer<typeof ResolutionAlternativeSchema>;

/**
 * Result of routing one candidate entity name through `IdentityResolver`.
 * Discriminated by `status` — never silently decides identity.
 */
export const IdentityResolutionSchema = z.discriminatedUnion('status', [
  // Exactly one existing entity matches. `entityId` is the stable identity.
  z.object({
    status: z.literal('matched'),
    entityType: z.string(),
    entityId: zodUuid(),
    alias: z.string(),
  }),
  // No existing entity matches — this is a brand-new candidate.
  z.object({
    status: z.literal('new_candidate'),
    entityType: z.string(),
    suggestedName: z.string(),
  }),
  // Several plausible identities (or a plausible existing identity AND a new
  // variant). Surfaces alternatives for a human picker; the resolver never
  // guesses between them.
  z.object({
    status: z.literal('ambiguous'),
    entityType: z.string(),
    alternatives: z.array(ResolutionAlternativeSchema).min(1),
  }),
]);

export type IdentityResolution = z.infer<typeof IdentityResolutionSchema>;

/**
 * The honest record of "what did we check and over what neighborhood" for one
 * conflict-detection rule run. Backed by `conflict_reports.checked_scope`.
 */
export const CheckedScopeSchema = z.object({
  entityType: z.string(),
  rule: z.enum(['location_conflict', 'timeline_overlap', 'lineage_conflict']),
  scopeDescriptor: z.string(), // human readable neighborhood, e.g. "scenes in district: Alameda"
  // Identifiers of the entities/beats actually examined. May be UUIDs (entity ids)
  // or slugs (e.g. story-beat slug), so kept as free-form strings.
  entityIdsChecked: z.array(z.string()).default([]),
  checkedAt: z.string(),
});

export type CheckedScope = z.infer<typeof CheckedScopeSchema>;

/** One bounded conflict finding, referencing entities within the checked scope. */
export const BoundedConflictSchema = z.object({
  rule: z.enum(['location_conflict', 'timeline_overlap', 'lineage_conflict']),
  severity: z.enum(['error', 'warning']),
  description: z.string().min(1),
  entityRefs: z.array(zodUuid()).default([]),
  itemIds: z.array(z.string()).default([]),
  hitByCheckedScope: z.boolean().default(false),
});

export type BoundedConflict = z.infer<typeof BoundedConflictSchema>;

/** Full report of one bounded conflict-detection job (recorded checked-scope). */
export const ConflictReportSchema = z.object({
  planId: zodUuid(),
  patchId: zodUuid().nullable().optional(),
  checkedAt: z.string(),
  passed: z.boolean(),
  checkedScopes: z.array(CheckedScopeSchema).default([]),
  findings: z.array(BoundedConflictSchema).default([]),
});

export type ConflictReport = z.infer<typeof ConflictReportSchema>;