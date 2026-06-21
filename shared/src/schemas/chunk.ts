import { z } from 'zod';
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
}).strict();

export type GuardedLeaf = z.infer<typeof GuardedLeafSchema>;

export type Leaf = FreeLeaf | GuardedLeaf;

export const LeafSchema = z.union([FreeLeafSchema, GuardedLeafSchema]);

export const ChunkSchema = z.object({
  tree_id: z.string().uuid(),
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
}

export function evaluateBoundary(
  choice: {
    time_block_cost?: { amount: number };
    required_flags?: Record<string, boolean>;
    hidden_if?: Record<string, boolean>;
    unlock_condition?: string;
    alignment_change?: string;
    mystery_solve?: string;
    vault_unlock?: string;
    relationship_change?: { stat: string; amount: number };
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

  // Rule 3: Conditional
  if (choice.required_flags || choice.hidden_if || choice.unlock_condition || choice.alignment_change) {
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
    return { isCut: true, type: 'GUARDED', reasons, tbCost, effects };
  }

  return { isCut: false, type: undefined, reasons: [] };
}
