import { z } from 'zod';
import { zodUuid, zodUuidNullable } from './uuid.js';

// ---------------------------------------------------------------------------
// M24: Claims / Evidence Store
//
// Append-only deliberation store for uncertain AI output. `evidence` and
// `claim_transitions` are immutable; `claims.status` is dynamically queried.
// ---------------------------------------------------------------------------

export const ClaimStatusSchema = z.enum(['proposed', 'accepted', 'rejected', 'merged']);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const ClaimSchema = z.object({
  id: zodUuid(),
  planId: zodUuidNullable(),
  patchId: zodUuidNullable(),
  sourceSpan: z.string().nullable(),
  sourceRef: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  status: ClaimStatusSchema.default('proposed'),
  conflictReason: z.string().nullable(),
  claimText: z.string(),
  createdBy: zodUuidNullable(),
  createdAt: z.string(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const ClaimCreateSchema = z.object({
  planId: zodUuidNullable().optional(),
  patchId: zodUuidNullable().optional(),
  sourceSpan: z.string().optional(),
  sourceRef: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  conflictReason: z.string().optional(),
  claimText: z.string().min(1),
});
export type ClaimCreate = z.infer<typeof ClaimCreateSchema>;

export const EvidenceSchema = z.object({
  id: zodUuid(),
  claimId: zodUuid(),
  sourceSpan: z.string().nullable(),
  sourceRef: z.string().nullable(),
  evidenceText: z.string(),
  createdBy: zodUuidNullable(),
  createdAt: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const EvidenceCreateSchema = z.object({
  sourceSpan: z.string().optional(),
  sourceRef: z.string().optional(),
  evidenceText: z.string().min(1),
});
export type EvidenceCreate = z.infer<typeof EvidenceCreateSchema>;

export const ClaimTransitionSchema = z.object({
  id: zodUuid(),
  claimId: zodUuid(),
  fromStatus: ClaimStatusSchema.nullable(),
  toStatus: ClaimStatusSchema,
  conflictReason: z.string().nullable(),
  createdBy: zodUuidNullable(),
  createdAt: z.string(),
});
export type ClaimTransition = z.infer<typeof ClaimTransitionSchema>;

export const ClaimTransitionRequestSchema = z.object({
  to: ClaimStatusSchema,
  conflictReason: z.string().optional(),
});
export type ClaimTransitionRequest = z.infer<typeof ClaimTransitionRequestSchema>;

/** A claim with its append-only evidence + transition journal. */
export const ClaimDetailSchema = z.object({
  claim: ClaimSchema,
  evidence: z.array(EvidenceSchema).default([]),
  transitions: z.array(ClaimTransitionSchema).default([]),
});
export type ClaimDetail = z.infer<typeof ClaimDetailSchema>;