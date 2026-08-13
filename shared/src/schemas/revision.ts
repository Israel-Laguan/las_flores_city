import { z } from 'zod';
import { zodUuid, zodUuidNullable } from './uuid.js';

// ---------------------------------------------------------------------------
// M24: Patch-Level Versioning
//
// `patches` is the unit of versioning; `canon_revisions` is the immutable
// per-entity canon history used for rollback-by-lookup.
// ---------------------------------------------------------------------------

export const PatchStatusSchema = z.enum(['proposed', 'applied', 'rejected', 'rolled_back']);
export type PatchStatus = z.infer<typeof PatchStatusSchema>;

/** JSON delta of a single affected entity within a patch. */
export const PatchOpSchema = z.object({
  entityType: z.string(),
  entityId: zodUuid(),
  op: z.enum(['create', 'update', 'delete']),
  before: z.unknown().optional(), // serialized prior DB row (or absent for creates)
  after: z.unknown().optional(), // serialized post-patch DB row (or absent for deletes)
});
export type PatchOp = z.infer<typeof PatchOpSchema>;

export const PatchSchema = z.object({
  id: zodUuid(),
  planId: zodUuidNullable(),
  title: z.string(),
  description: z.string().nullable(),
  patchJson: z.object({
    ops: z.array(PatchOpSchema).default([]),
  }),
  status: PatchStatusSchema.default('proposed'),
  conflictReason: z.string().nullable(),
  appliedBy: zodUuidNullable(),
  appliedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  createdBy: zodUuidNullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Patch = z.infer<typeof PatchSchema>;

/** Create-payload shape accepted by the service/route (id/audit timestamp omitted). */
export const PatchCreateSchema = z.object({
  planId: zodUuidNullable(),
  title: z.string().min(1),
  description: z.string().optional(),
  patchJson: z.object({
    ops: z.array(PatchOpSchema).default([]),
  }),
});
export type PatchCreate = z.infer<typeof PatchCreateSchema>;

export const CanonRevisionSchema = z.object({
  id: zodUuid(),
  entityType: z.string(),
  entityId: zodUuid(),
  revisionNumber: z.number().int().positive(),
  contentSnapshot: z.unknown(),
  appliedPatchId: zodUuidNullable(),
  planId: zodUuidNullable(),
  createdBy: zodUuidNullable(),
  createdAt: z.string(),
});
export type CanonRevision = z.infer<typeof CanonRevisionSchema>;

export const RollbackResultSchema = z.object({
  patchId: zodUuid(),
  restored: z.array(z.object({
    entityType: z.string(),
    entityId: zodUuid(),
    toRevision: z.number().int().positive().nullable(),
  })),
});
export type RollbackResult = z.infer<typeof RollbackResultSchema>;