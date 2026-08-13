-- ============================================================
-- 066_claims.sql
--
-- M24: Claims / Evidence Store (Phase 5)
--
-- Append-only deliberation store for uncertain AI output. The
-- `claims` table records a candidate statement; `evidence` stores
-- the supporting source excerpts (immutable); `claim_transitions`
-- journals every status change so the store itself stays append-only
-- while `claims.status` remains directly queryable.
--
-- Statuses: proposed / accepted / rejected / merged.
--
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------------
-- 1. claims
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES content_plans(id) ON DELETE SET NULL,
  patch_id UUID REFERENCES patches(id) ON DELETE SET NULL,
  source_span TEXT,
  source_ref TEXT,
  confidence NUMERIC(4,3)
    CHECK (confidence BETWEEN 0 AND 1),
  status VARCHAR(20) NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'rejected', 'merged')),
  conflict_reason TEXT,
  claim_text TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_plan_id ON claims(plan_id);
CREATE INDEX IF NOT EXISTS idx_claims_patch_id ON claims(patch_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_source_ref ON claims(source_ref);

-- ------------------------------------------------------------------
-- 2. evidence — append-only, immutable per claim
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The audit trail is append-only: a claim with evidence must never be
  -- cascade-deleted out of existence. `ON DELETE RESTRICT` forces callers to
  -- explicitly delete (or retain) the evidence rows before removing a claim,
  -- so history cannot be silently erased by removing the parent row.
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE RESTRICT,
  source_span TEXT,
  source_ref TEXT,
  evidence_text TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_claim_id ON evidence(claim_id);

-- ------------------------------------------------------------------
-- 3. claim_transitions — append-only status journal
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Same append-only guard as `evidence`: removing a claim must require the
  -- journal rows to be explicitly handled, not cascaded away.
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE RESTRICT,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  conflict_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mirror the shared ClaimTransition status enum at the DB level so direct SQL
-- (or a buggy writer) cannot insert an arbitrary value into the journal and
-- poison detail reads. `from_status` is nullable (the initial null→proposed
-- transition has no prior status), so the CHECK must allow NULL explicitly
-- (PostgreSQL CHECK returns UNKNOWN for NULL operands, which is accepted).
ALTER TABLE claim_transitions DROP CONSTRAINT IF EXISTS claim_transitions_from_status_check;
ALTER TABLE claim_transitions
  ADD CONSTRAINT claim_transitions_from_status_check
  CHECK (from_status IS NULL OR from_status IN ('proposed', 'accepted', 'rejected', 'merged'));
ALTER TABLE claim_transitions DROP CONSTRAINT IF EXISTS claim_transitions_to_status_check;
ALTER TABLE claim_transitions
  ADD CONSTRAINT claim_transitions_to_status_check
  CHECK (to_status IN ('proposed', 'accepted', 'rejected', 'merged'));

CREATE INDEX IF NOT EXISTS idx_claim_transitions_claim_id ON claim_transitions(claim_id);

COMMIT;