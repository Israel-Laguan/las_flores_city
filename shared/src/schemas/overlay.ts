import { z } from 'zod';
import { DialogueNodeSchema } from '../index.js';

// ============================================================
// Mystery Overlay Schema (Task 3.1)
// ============================================================
// An "overlay" is a partial set of nodes that augments a base
// dialogue tree for players actively investigating a mystery.
// Deep-merged with the base tree's `nodes` keyed by node id.
// Arrays (e.g. `choices`) are fully replaced by the overlay's
// version (predictable author control, no element-wise merging).
// ============================================================

export const OverlaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  target_tree_id: z.string().uuid(),
  mystery_id: z.string().uuid().nullable().optional(),
  gate_node_id: z.string().uuid().optional().describe('Documentation: where the branch diverges'),
  priority: z.number().int().default(0),
  nodes: z.record(z.string(), DialogueNodeSchema).default({}),
});

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
