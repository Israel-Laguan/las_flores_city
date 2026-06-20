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
  required_flags: z.record(z.string(), z.boolean()).optional(),
  hidden_if: z.record(z.string(), z.boolean()).optional(),
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
  // Established pattern: nested flag bag (see recordChoiceAndEffects)
  flag_set: z.record(z.string(), z.boolean()).optional(),
  // Story-progression cursor (STORY_PROGRESSION_CONTEXT.md)
  story_beat: z.string().max(100).optional(),
  // Parsed content-side; retained for compatibility
  location_discovered: z.string().max(100).optional(),
  app_opened: z.string().max(50).optional(),
  message_read: z.string().max(100).optional(),
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
