import { z } from 'zod';
import { zodUuid } from './uuid.js';
import { DialogueNodeSchema, EffectsSchema } from './dialogue.js';

// ============================================================
// Chunk Schemas — validate AOT-compiled dialogue sub-graphs
//
// A "chunk" is a ≤15-node safe sub-graph extracted from a
// dialogue tree at migration time. Every server-authoritative
// transition (TB cost, effect, conditional, mystery solve, vault,
// relationship, overlay gate) sits on a boundary "leaf" — never
// buried inside the chunk.  The future chunk-based runtime
// (Project B) will serve one chunk at a time to the client.
// ============================================================

export const FreeLeafSchema = z.object({
  type: z.literal('FREE'),
  target_chunk: z.string(),
}).strict();

export type FreeLeaf = z.infer<typeof FreeLeafSchema>;

export const BoundaryReasonSchema = z.enum([
  'time_block_cost',
  'effects',
  'conditional',
  'mystery_solve',
  'overlay_gate',
  'vault_unlock',
  'relationship_change',
]);

export type BoundaryReason = z.infer<typeof BoundaryReasonSchema>;

export const GuardedLeafSchema = z.object({
  type: z.literal('GUARDED'),
  target_chunk: z.string(),
  reasons: z.array(BoundaryReasonSchema).min(1),
  tb_cost: z.number().int().min(1).max(24).optional(),
  effects: EffectsSchema.optional(),
  // Choice-level effects (from DialogueChoice.effects) applied when the
  // player selects this choice at a chunk boundary. Stored separately from
  // `effects` (which carries the TARGET NODE's effects) so the validator can
  // apply choice effects BEFORE node effects — mirroring the intra-chunk
  // processChoice path where choice effects precede destination-node effects.
  choice_effects: EffectsSchema.optional(),
}).strict();

export type GuardedLeaf = z.infer<typeof GuardedLeafSchema>;

export type Leaf = FreeLeaf | GuardedLeaf;

export const LeafSchema = z.union([FreeLeafSchema, GuardedLeafSchema]);

export const ChunkSchema = z.object({
  tree_id: zodUuid(),
  chunk_key: z.string(),
  nodes: z.record(z.string(), DialogueNodeSchema),
  leaves: z.record(z.string(), LeafSchema),
}).strict();

export type Chunk = z.infer<typeof ChunkSchema>;

// ============================================================
// evaluateBoundary — pure function for the 8 Iron Rules
//
// Given a choice (the edge) and the target node it points to,
// determine whether this edge triggers a chunk cut and why.
// Returns { isCut, type, reasons, tbCost?, effects? }.
//
// This function is the single source of truth for boundary
// evaluation, shared by the compiler and (in future) any
// tooling that needs to validate chunk correctness.
// ============================================================

export interface BoundaryResult {
  isCut: boolean;
  type?: 'FREE' | 'GUARDED';
  reasons: BoundaryReason[];
  tbCost?: number;
  effects?: z.infer<typeof EffectsSchema>;
  // Choice-level effects (DialogueChoice.effects). Carried into the
  // GUARDED leaf so the IronGateValidator can apply them at the
  // boundary — without this, choice.effects are silently dropped
  // when the edge crosses a chunk boundary.
  choiceEffects?: z.infer<typeof EffectsSchema>;
}

export function evaluateBoundary(
  choice: {
    time_block_cost?: { amount: number };
    required_flags?: Record<string, boolean>;
    hidden_if?: Record<string, boolean>;
    // Typed condition gates (see shared/src/schemas/dialogue.ts).
    required_state?: Record<string, string>;
    hidden_if_state?: Record<string, string>;
    required_stats?: Record<string, string>;
    hidden_if_stats?: Record<string, string>;
    unlock_condition?: string;
    alignment_change?: string;
    mystery_solve?: string;
    vault_unlock?: string;
    relationship_change?: { stat: string; amount: number };
    // Choice-level effects applied when the player selects this choice.
    effects?: z.infer<typeof EffectsSchema>;
  },
  targetNode: {
    effects?: z.infer<typeof EffectsSchema>;
  } | null | undefined,
  gateSet: Set<string>,
  targetNodeId: string
): BoundaryResult {
  const reasons: BoundaryReason[] = [];
  let tbCost: number | undefined;
  let effects: z.infer<typeof EffectsSchema> | undefined;
  let choiceEffects: z.infer<typeof EffectsSchema> | undefined;

  // Rule 1: Economy — time_block_cost.amount > 0
  if (choice.time_block_cost && choice.time_block_cost.amount > 0) {
    reasons.push('time_block_cost');
    tbCost = choice.time_block_cost.amount;
  }

  // Rule 2: State mutation — target node has effects
  if (targetNode?.effects) {
    const effectKeys = Object.keys(targetNode.effects).filter(
      (k) => targetNode.effects![k as keyof typeof targetNode.effects] !== undefined
    );
    if (effectKeys.length > 0) {
      reasons.push('effects');
      effects = targetNode.effects;
    }
  }

  // Capture choice-level effects so they are carried into the GUARDED
  // leaf and applied at the boundary. If the choice has effects but no
  // other boundary reason exists, we force a GUARDED cut so the
  // choice effects are not silently dropped.
  if (choice.effects) {
    const choiceEffectKeys = Object.keys(choice.effects).filter(
      (k) => choice.effects![k as keyof typeof choice.effects] !== undefined
    );
    if (choiceEffectKeys.length > 0) {
      choiceEffects = choice.effects;
      // Only add 'effects' reason if target-node effects didn't already
      // add it — we don't want duplicate reasons. The validator applies
      // choice_effects separately from leaf.effects.
      if (!reasons.includes('effects')) {
        reasons.push('effects');
      }
    }
  }

  // Rule 3: Conditional
  if (
    choice.required_flags ||
    choice.hidden_if ||
    choice.required_state ||
    choice.hidden_if_state ||
    choice.required_stats ||
    choice.hidden_if_stats ||
    choice.unlock_condition ||
    choice.alignment_change
  ) {
    reasons.push('conditional');
  }

  // Rule 4: Mystery solve
  if (choice.mystery_solve) {
    reasons.push('mystery_solve');
  }

  // Rule 5: Overlay gate — target is in the gate set
  if (gateSet.has(targetNodeId)) {
    reasons.push('overlay_gate');
  }

  // Rule 6: Vault unlock
  if (choice.vault_unlock) {
    reasons.push('vault_unlock');
  }

  // Rule 7: Relationship change
  if (choice.relationship_change) {
    reasons.push('relationship_change');
  }

  if (reasons.length > 0) {
    return { isCut: true, type: 'GUARDED', reasons, tbCost, effects, choiceEffects };
  }

  return { isCut: false, type: undefined, reasons: [] };
}
