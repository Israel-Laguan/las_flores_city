import { z } from 'zod';

export const RelationshipStatusSchema = z.enum([
  'STRANGER', 'ACQUAINTANCE', 'CONFIDANT', 'ROMANTIC', 'PARTNER', 'DISTANCED', 'ENDED',
]);
export type RelationshipStatus = z.infer<typeof RelationshipStatusSchema>;

export const RelationshipAxesSchema = z.object({
  trust: z.number().int().min(-100).max(100),
  familiarity: z.number().int().min(0).max(100),
  alignment: z.number().int().min(-100).max(100),
  tension: z.number().int().min(0).max(100),
  debt: z.number().int().min(-100).max(100),
  visibility: z.number().int().min(0).max(100),
});
export type RelationshipAxes = z.infer<typeof RelationshipAxesSchema>;

export const RelationshipDeltaSchema = z.object({
  axes: z.object({
    trust: z.number().int().optional(), familiarity: z.number().int().optional(),
    alignment: z.number().int().optional(), tension: z.number().int().optional(),
    debt: z.number().int().optional(), visibility: z.number().int().optional(),
  }).strict().optional(),
  friendship: z.number().int().optional(), romance: z.number().int().optional(),
  bond: z.number().int().optional(), vibe: z.number().int().optional(),
  memory: z.record(z.string().min(1).max(80), z.number().int().min(-100).max(100)).optional(),
  flags: z.record(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/), z.boolean()).optional(),
  status: RelationshipStatusSchema.optional(),
}).strict();
export type RelationshipDelta = z.infer<typeof RelationshipDeltaSchema>;

export const RelationshipSnapshotSchema = z.object({
  characterId: z.string().uuid(),
  friendshipLevel: z.number().int().min(0).max(100), romanceLevel: z.number().int().min(0).max(100),
  axes: RelationshipAxesSchema, bondLevel: z.number().int().min(0).max(100),
  dailyVibe: z.number().int().min(-100).max(100), status: RelationshipStatusSchema,
  lastInteractionDay: z.number().int().nullable(), lastMilestoneDay: z.number().int().nullable(),
  memory: z.record(z.string(), z.number().int()).default({}),
  flags: z.record(z.string(), z.boolean()).default({}),
});
export type RelationshipSnapshot = z.infer<typeof RelationshipSnapshotSchema>;
