import { z } from 'zod';
import { DialogueNodeSchema } from './dialogue.js';

// ============================================================
// Mystery Overlay Schema
// ============================================================
// An "overlay" is a partial set of nodes that augments a base
// dialogue tree for players actively investigating a mystery.
// Deep-merged with the base tree's `nodes` keyed by node id.
// Arrays (e.g. `choices`) are fully replaced by the overlay's
// version (predictable author control, no element-wise merging).
// ============================================================

export const UnlockConditionSchema = z.enum([
  'none',
  'patreon_nsfw',
  // Meta-plot finale overlays gate on user.alignment.
  // `loyalist_only` is visible only to players who chose the
  // loyalist finale; `fugitive_only` to those who went fugitive.
  // The DialogueResolver reads `users.alignment` and skips
  // overlays whose gate the user does not satisfy.
  'loyalist_only',
  'fugitive_only',
]);
export type UnlockCondition = z.infer<typeof UnlockConditionSchema>;

export const OverlaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  target_tree_id: z.string().uuid(),
  mystery_id: z.string().uuid().nullable().optional(),
  gate_node_id: z.string().uuid().optional().describe('Documentation: where the branch diverges'),
  priority: z.number().int().default(0),
  is_nsfw: z.boolean().default(false),
  unlock_condition: UnlockConditionSchema.optional(),
  nodes: z.record(z.string(), DialogueNodeSchema).default({}),
}).transform((data) => ({
  ...data,
  is_nsfw: data.is_nsfw || data.unlock_condition === 'patreon_nsfw',
}));

export type Overlay = z.infer<typeof OverlaySchema>;

// ============================================================
// Overlay File Schema (for YAML bundling)
// ============================================================
// A single YAML file can contain multiple overlays as a
// `overlays: [...]` array, mirroring the multi-item bundles
// used elsewhere in the content pipeline (e.g. `gigs.yaml`).
// ============================================================

export const OverlayFileSchema = z.object({
  overlays: z.array(OverlaySchema),
});

export type OverlayFile = z.infer<typeof OverlayFileSchema>;
