// ============================================================
// ClaimsService - claims/evidence deliberation store (M24)
//
// Append-only store for the "messy middle" of AI authoring: every
// candidate claim carries a source span, confidence and a status
// (proposed/accepted/rejected/merged). `claim_transitions` is an
// append-only journal of status changes; `evidence` is immutable per
// claim. The `claims.status` column is kept in sync so the current
// state remains directly queryable.
// ============================================================

import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import type {
  Claim,
  ClaimCreate,
  Evidence,
  ClaimStatus,
  ClaimDetail,
} from '@las-flores/shared';
import { ClaimSchema, EvidenceSchema, ClaimTransitionSchema, ClaimDetailSchema } from '@las-flores/shared';
import { emitAdminEvent } from './AdminEventEmitter.js';
import { ClaimNotFoundError, ClaimTransitionError } from './errors.js';

const VALID_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  proposed: ['accepted', 'rejected', 'merged'],
  merged: [],
  accepted: ['rejected', 'merged'],
  rejected: ['accepted', 'merged'],
};

/** SQL row → Claim DTO. */
function mapClaim(row: Record<string, any>): Claim {
  return ClaimSchema.parse({
    id: row.id,
    planId: row.plan_id,
    patchId: row.patch_id,
    sourceSpan: row.source_span,
    sourceRef: row.source_ref,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    status: row.status,
    conflictReason: row.conflict_reason,
    claimText: row.claim_text,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  });
}

/** Create a new proposed claim and record its initial transition. */
export async function createClaim(
  input: Omit<ClaimCreate, 'planId' | 'patchId'> & { planId?: string | null; patchId?: string | null },
  userId?: string,
): Promise<string> {
  // Both the claims insert and its initial journal row must commit together so a
  // failed transition insert can never leave an unjournaled claim.
  const claimId = await withOLTPTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO claims
         (plan_id, patch_id, source_span, source_ref, confidence, status, conflict_reason, claim_text, created_by)
       VALUES ($1, $2, $3, $4, $5, 'proposed', $6, $7, $8)
       RETURNING id`,
      [
        input.planId || null,
        input.patchId || null,
        input.sourceSpan || null,
        input.sourceRef || null,
        input.confidence ?? null,
        input.conflictReason || null,
        input.claimText,
        userId || null,
      ],
    );
    const createdId = result.rows[0].id;
    await client.query(
      `INSERT INTO claim_transitions (claim_id, from_status, to_status, created_by)
       VALUES ($1, NULL, 'proposed', $2)`,
      [createdId, userId || null],
    );
    return createdId;
  });
  emitAdminEvent('claim_created', { claimId, status: 'proposed' }, input.planId ?? undefined, userId);
  return claimId;
}

/** Propose claims from an intake conflict preview list (LLM uncertainty). */
export async function proposeClaims(planId: string, conflicts: Array<{
  description: string;
  severity: 'error' | 'warning';
  relatedItems?: string[];
  relatedExisting?: string[];
}>, userId?: string): Promise<string[]> {
  const ids: string[] = [];
  for (const c of conflicts) {
    const claimId = await createClaim(
      {
        planId,
        patchId: undefined,
        claimText: c.description,
        confidence: c.severity === 'error' ? 0.8 : 0.5,
        sourceRef: c.relatedExisting?.join(',') || undefined,
        sourceSpan: c.relatedItems?.join(',') || undefined,
      },
      userId,
    );
    ids.push(claimId);
  }
  return ids;
}

/**
 * Transition a claim's status, writing an append-only transition journal row
 * and updating the queryable status column. Validates the allowed edge set.
 */
export async function transitionClaim(
  claimId: string,
  to: ClaimStatus,
  conflictReason?: string,
  userId?: string,
): Promise<Claim> {
  // Lock the claim row, validate the transition, and write both the journal row
  // and the status update in one transaction so concurrent transitions cannot
  // record conflicting edges from the same status.
  const { claim, from } = await withOLTPTransaction(async (client) => {
    const locked = await client.query<Record<string, any>>(
      `SELECT id, plan_id, patch_id, source_span, source_ref, confidence, status,
              conflict_reason, claim_text, created_by, created_at
         FROM claims WHERE id = $1
         FOR UPDATE`,
      [claimId],
    );
    if (locked.rows.length === 0) throw new ClaimNotFoundError(claimId);
    const row = locked.rows[0];
    const fromStatus = row.status as ClaimStatus;
    const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(to)) {
      throw new ClaimTransitionError(`Invalid transition ${fromStatus} -> ${to}`);
    }

    await client.query(
      `INSERT INTO claim_transitions (claim_id, from_status, to_status, conflict_reason, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [claimId, fromStatus, to, conflictReason || null, userId || null],
    );
    await client.query(
      `UPDATE claims SET status = $1, conflict_reason = $2 WHERE id = $3`,
      [to, conflictReason || null, claimId],
    );
    const updated = mapClaim({ ...row, status: to, conflict_reason: conflictReason || null });
    return { claim: updated, from: fromStatus };
  });

  emitAdminEvent('claim_updated', { claimId, from, to }, feedbackPlanId(claim), userId);
  return claim;
}

function feedbackPlanId(claim: Claim): string | undefined {
  return claim.planId ?? undefined;
}

export async function getClaim(claimId: string): Promise<Claim> {
  const result = await queryOLTP<Record<string, any>>(
    `SELECT id, plan_id, patch_id, source_span, source_ref, confidence, status,
            conflict_reason, claim_text, created_by, created_at
       FROM claims WHERE id = $1`,
    [claimId],
  );
  if (result.rows.length === 0) throw new ClaimNotFoundError(claimId);
  return mapClaim(result.rows[0]);
}
export async function getClaimDetail(claimId: string): Promise<ClaimDetail> {
  const claim = await getClaim(claimId);
  const ev = await queryOLTP<Record<string, any>>(
    `SELECT id, claim_id, source_span, source_ref, evidence_text, created_by, created_at
       FROM evidence WHERE claim_id = $1 ORDER BY created_at ASC`,
    [claimId],
  );
  const tr = await queryOLTP<Record<string, any>>(
    `SELECT id, claim_id, from_status, to_status, conflict_reason, created_by, created_at
       FROM claim_transitions WHERE claim_id = $1 ORDER BY created_at ASC`,
    [claimId],
  );
  return ClaimDetailSchema.parse({
    claim,
    evidence: ev.rows.map((r) => EvidenceSchema.parse({
      id: r.id,
      claimId: r.claim_id,
      sourceSpan: r.source_span,
      sourceRef: r.source_ref,
      evidenceText: r.evidence_text,
      createdBy: r.created_by,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    transitions: tr.rows.map((r) => ClaimTransitionSchema.parse({
      id: r.id,
      claimId: r.claim_id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      conflictReason: r.conflict_reason,
      createdBy: r.created_by,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  });
}

/** Append immutable evidence to a claim. */
export async function recordEvidence(claimId: string, evidence: {
  sourceSpan?: string;
  sourceRef?: string;
  evidenceText: string;
}, userId?: string): Promise<Evidence> {
  await getClaim(claimId); // throws if missing
  const result = await queryOLTP<Record<string, any>>(
    `INSERT INTO evidence (claim_id, source_span, source_ref, evidence_text, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, claim_id, source_span, source_ref, evidence_text, created_by, created_at`,
    [claimId, evidence.sourceSpan || null, evidence.sourceRef || null, evidence.evidenceText, userId || null],
  );
  const r = result.rows[0];
  return EvidenceSchema.parse({
    id: r.id,
    claimId: r.claim_id,
    sourceSpan: r.source_span,
    sourceRef: r.source_ref,
    evidenceText: r.evidence_text,
    createdBy: r.created_by,
    createdAt: new Date(r.created_at).toISOString(),
  });
}
export async function listClaims(opts?: {
  planId?: string;
  status?: ClaimStatus;
  patchId?: string;
}): Promise<Claim[]> {
  const clauses: string[] = [];
  const params: any[] = [];
  if (opts?.planId) {
    params.push(opts.planId);
    clauses.push(`plan_id = $${params.length}`);
  }
  if (opts?.patchId) {
    params.push(opts.patchId);
    clauses.push(`patch_id = $${params.length}`);
  }
  if (opts?.status) {
    params.push(opts.status);
    clauses.push(`status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await queryOLTP<Record<string, any>>(
    `SELECT id, plan_id, patch_id, source_span, source_ref, confidence, status,
            conflict_reason, claim_text, created_by, created_at
       FROM claims ${where}
      ORDER BY created_at DESC`,
    params,
  );
  return result.rows.map(mapClaim);
}

/** Mark all proposed claims for a patch as rejected (used on patch rejection). */
export async function rejectClaimsForPatch(patchId: string, conflictReason: string, userId?: string): Promise<number> {
  const claims = await listClaims({ patchId });
  let count = 0;
  for (const c of claims) {
    if (c.status === 'proposed') {
      await transitionClaim(c.id, 'rejected', conflictReason, userId);
      count += 1;
    }
  }
  return count;
}