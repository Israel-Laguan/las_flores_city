import { z } from 'zod';
import { zodUuid, zodUuidOptional } from './uuid.js';
import { RelationshipDeltaSchema, RelationshipStatusSchema } from './relationship.js';

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

// ============================================================
// Relationship gate contract (M48)
//
// A relationship gate evaluates against the target character's
// canonical `user_relationships` row (axes / bond / vibe /
// romance / friendship / status / flags / memory). It runs
// *alongside* the legacy player-state `required_stats` gates so
// existing arcs keep working while new content migrates.
//
// Fail-closed by default: a `required_relationship` gate with no
// relationship row hides the choice, and a `hidden_if_relationship`
// gate with no row never matches. Opt-in `neutral_default: true`
// evaluates against a STRANGER / zero baseline instead.
// ============================================================

export const RelationshipAxis = z.enum(['trust', 'familiarity', 'alignment', 'tension', 'debt', 'visibility']);

export type RelationshipAxisEnum = z.infer<typeof RelationshipAxis>;

export const PostureSchema = z.enum([
  'WARM',
  'CURIOUS',
  'GUARDED',
  'VOLATILE_ROMANCE',
  'DISTANT',
  'CONFRONTATIONAL',
  'RECONCILIATORY',
  'BROKEN',
]);

export type Posture = z.infer<typeof PostureSchema>;

// Evaluated against the target character's user_relationships row.
export const RelationshipGateSchema = z
  .object({
    target_character_id: zodUuidOptional(),
    axes: z
      .object({
        trust: NumericComparisonSchema.optional(),
        familiarity: NumericComparisonSchema.optional(),
        alignment: NumericComparisonSchema.optional(),
        tension: NumericComparisonSchema.optional(),
        debt: NumericComparisonSchema.optional(),
        visibility: NumericComparisonSchema.optional(),
      })
      .strict()
      .optional(),
    bond: NumericComparisonSchema.optional(),
    vibe: NumericComparisonSchema.optional(),
    romance: NumericComparisonSchema.optional(),
    friendship: NumericComparisonSchema.optional(),
    status: RelationshipStatusSchema.optional(),
    flags: z.record(z.string(), z.boolean()).optional(),
    memory: z.record(z.string(), NumericComparisonSchema).optional(),
    neutral_default: z.boolean().default(false),
  })
  .strict();

export type RelationshipGate = z.infer<typeof RelationshipGateSchema>;

// Strict effects schema: reject undocumented properties during content
// migration so YAML authors get feedback immediately.
// Defined before DialogueChoiceSchema because choices can carry their own
// effects (applied at choice time, in addition to the destination node).
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
  grant_item: zodUuidOptional(),
  // Canonical player-character relationship mutation. The speaking character
  // is the target when this is attached to a dialogue node or choice.
  relationship_effect: RelationshipDeltaSchema.optional(),
}).strict();

export type Effects = z.infer<typeof EffectsSchema>;

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
  vault_unlock: zodUuidOptional(),
  mystery_solve: zodUuidOptional(),
  // Boolean flag gates (presence check). Backwards-compatible.
  required_flags: z.record(z.string(), z.boolean()).optional(),
  hidden_if: z.record(z.string(), z.boolean()).optional(),
  // Categorical state gates (string equality).
  required_state: z.record(z.string(), z.string()).optional(),
  hidden_if_state: z.record(z.string(), z.string()).optional(),
  // Numeric stat gates (op:number comparison, e.g. "gt:50").
  required_stats: z.record(z.string(), NumericComparisonSchema).optional(),
  hidden_if_stats: z.record(z.string(), NumericComparisonSchema).optional(),
  // M48 relationship gates: evaluated against the target character's
  // canonical user_relationships row (see shared/src/relationshipGates.ts).
  required_relationship: RelationshipGateSchema.optional(),
  hidden_if_relationship: RelationshipGateSchema.optional(),
  required_posture: PostureSchema.optional(),
  hidden_if_posture: PostureSchema.optional(),
  // Meta-plot finale alignment directive. When set,
  // /dialogue/choose flips the user into this faction (and emits
  // an `alignment_locked` OLAP event). Authors should only attach
  // this to one choice per tree — the finale branch.
  alignment_change: z.enum(['loyalist', 'fugitive']).optional(),
  // Choice-level effects applied when the player selects this choice,
  // in addition to the destination node's effects. Applied BEFORE
  // the node's effects so node-level flag_set/state_set take
  // precedence (overwrite semantics), while stat_set deltas
  // accumulate from both.
  effects: EffectsSchema.optional(),
});

export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;

export const DialogueNodeVisualSchema = z.object({
  // Expression tag used to select a variant from the speaker's
  // portrait_urls[].expression entries (e.g. neutral, vulnerable,
  // shocked, calculating, tender). Falls back to the default entry.
  expression: z.string().max(50).optional(),
  // Dialogue backdrop URL applied verbatim by the client VN viewport, e.g. a
  // published scene/overlay background URL. The client does NOT resolve scene
  // slugs here — a bare slug (e.g. `central_plaza`) would render as a relative
  // `url("central_plaza")`. Leave empty to fall back to the scene/environment
  // variant pool resolved from `location:background`.
  background: z.string().max(255).optional(),
  // CSS/Canvas2D mood treatment ('night' tints, 'alert' pulses).
  mood: z.enum(['rain', 'tense', 'night', 'soft_bloom', 'alert', 'none']).optional(),
  // Portrait placement on the VN stage.
  position: z.enum(['left', 'center', 'right']).optional(),
  // Transition applied when entering this node's visual state.
  transition: z.enum(['fade', 'slide', 'flash', 'none']).optional(),
  // Cinematic mode: hide the bottom bar and center the text
  // full-screen over the background/mood layers.
  cinematic: z.boolean().optional(),
});

export type DialogueNodeVisual = z.infer<typeof DialogueNodeVisualSchema>;

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
  // Visual Novel staging metadata. Optional; when absent the client
  // falls back to the default portrait + scene backdrop.
  visual: DialogueNodeVisualSchema.optional(),
});

export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

export const DialogueTreeSchema = z.object({
  id: zodUuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  start_node_id: z.string(),
  nodes: z.record(z.string(), DialogueNodeSchema),
  character_id: zodUuidOptional(),
  scene_id: zodUuidOptional(),
  mission_id: zodUuidOptional(),
  dialogue_scope: z.enum(['character', 'scene', 'mission', 'onboarding', 'system']).default('character'),
  metadata: z.record(z.string(), z.any()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type DialogueTree = z.infer<typeof DialogueTreeSchema>;

export const DialogueOverlaySchema = z.object({
  id: zodUuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  target_tree_id: zodUuid(),
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
