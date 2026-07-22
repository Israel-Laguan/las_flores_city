import { z } from 'zod';

export const DialogueNodeTypeSchema = z.enum([
  'narrator',
  'character',
  'choice',
  'system',
  'monologue',
]);

export type DialogueNodeType = z.infer<typeof DialogueNodeTypeSchema>;

export const RelationshipChangeSchema = z.object({
  stat: z.enum(['friendship', 'romance']),
  amount: z.number().int(),
});

export type RelationshipChange = z.infer<typeof RelationshipChangeSchema>;

// ============================================================
// Typed flag/state/stat condition grammar
//
// The dialogue flag system tracks three distinct kinds of player
// state, each with different write + read semantics:
//
//   flags  — Record<string, boolean>  (on/off; overwrite; === true)
//   state  — Record<string, string>   (categorical; overwrite; ===)
//   stats  — Record<string, number>   (accumulating; additive; op compare)
//
// On the READ side (required_*/hidden_if_*), numeric stats use an
// inline comparison operator string: "gt:50", "lt:75", "gte:10",
// "lte:10", "eq:0", "ne:100". Booleans use presence and strings use
// equality. See `shared/src/conditions.ts` for the evaluator.
// ============================================================

export const NumericComparisonSchema = z
  .string()
  .regex(/^(gt|lt|gte|lte|eq|ne):-?\d+$/, 'Expected "op:number", e.g. "gt:50"');

export type NumericComparison = z.infer<typeof NumericComparisonSchema>;

export const DialogueChoiceSchema = z.object({
  id: z.string(),
  text: z.string().max(500),
  next_node_id: z.string(),
  time_block_cost: z
    .object({
      amount: z.number().int().min(1).max(24),
      description: z.string().max(200),
    })
    .optional(),
  relationship_change: RelationshipChangeSchema.optional(),
  vault_unlock: z.string().uuid().optional(),
  mystery_solve: z.string().uuid().optional(),
  // Boolean flag gates (presence check). Backwards-compatible.
  required_flags: z.record(z.string(), z.boolean()).optional(),
  hidden_if: z.record(z.string(), z.boolean()).optional(),
  // Categorical state gates (string equality).
  required_state: z.record(z.string(), z.string()).optional(),
  hidden_if_state: z.record(z.string(), z.string()).optional(),
  // Numeric stat gates (op:number comparison, e.g. "gt:50").
  required_stats: z.record(z.string(), NumericComparisonSchema).optional(),
  hidden_if_stats: z.record(z.string(), NumericComparisonSchema).optional(),
  // Meta-plot finale alignment directive. When set,
  // /dialogue/choose flips the user into this faction (and emits
  // an `alignment_locked` OLAP event). Authors should only attach
  // this to one choice per tree — the finale branch.
  alignment_change: z.enum(['loyalist', 'fugitive']).optional(),
});

export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;

// Strict effects schema: reject undocumented properties during content
// migration so YAML authors get feedback immediately.
export const EffectsSchema = z.object({
  // Established pattern: nested flag bag (see recordChoiceAndEffects).
  // Boolean on/off flags — overwrite-merged via mergeFlags().
  flag_set: z.record(z.string(), z.boolean()).optional(),
  // Categorical story variables (e.g. awakening_path: "understood",
  // sofia_status: "romanced") — overwrite-merged via mergeState().
  state_set: z.record(z.string(), z.string()).optional(),
  // Numeric accumulating stats (e.g. sofia_trust: 10) — additively
  // merged via mergeStats() (coalesce(existing,0) + delta per key).
  // Write plain numbers here; comparison operators ("gt:50") belong
  // only on the read side (required_stats / hidden_if_stats).
  stat_set: z.record(z.string(), z.number()).optional(),
  // Story-progression cursor (STORY_PROGRESSION_CONTEXT.md)
  story_beat: z.string().max(100).optional(),
  // Parsed content-side; retained for compatibility
  location_discovered: z.string().max(100).optional(),
  app_opened: z.string().max(50).optional(),
  message_read: z.string().max(100).optional(),
  // M15: mission reward grants — credits or a vault item
  grant_credits: z
    .object({
      amount: z.number().int().min(1).max(100000),
      currency: z.enum(['credits', 'gold_credits']).default('credits'),
    })
    .optional(),
  grant_item: z.string().uuid().optional(),
}).strict();

export type Effects = z.infer<typeof EffectsSchema>;

export const DialogueNodeSchema = z.object({
  id: z.string(),
  type: DialogueNodeTypeSchema,
  speaker_id: z.string().optional(),
  text: z.string().max(2000),
  thought: z.string().max(2000).optional(),
  is_end: z.boolean().optional(),
  choices: z.array(DialogueChoiceSchema).optional(),
  effects: EffectsSchema.optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

export const DialogueTreeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  start_node_id: z.string(),
  nodes: z.record(z.string(), DialogueNodeSchema),
  metadata: z.record(z.string(), z.any()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type DialogueTree = z.infer<typeof DialogueTreeSchema>;

export const DialogueOverlaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  target_tree_id: z.string().uuid(),
  modifications: z.array(z.object({
    node_id: z.string(),
    action: z.enum(['replace', 'add_choice', 'remove_choice', 'modify_text']),
    data: z.record(z.string(), z.any()),
  })),
  conditions: z.record(z.string(), z.any()).optional(),
  priority: z.number().int().default(0),
  is_nsfw: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type DialogueOverlay = z.infer<typeof DialogueOverlaySchema>;
