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

-- ------------------------------------------------------------------
-- 4. Append-only enforcement for evidence + claim_transitions
-- ------------------------------------------------------------------
-- Direct UPDATE/DELETE (and TRUNCATE) of immutable audit rows is blocked by
-- default. Controlled cleanup (test fixtures, approved retention workflows) may
-- bypass by setting `SET LOCAL claim_utils.allow_mutation = 'true'` inside a
-- transaction — but ONLY from a privileged session (a superuser or a member of
-- the dedicated `las_flores_claims_retention` role). The custom GUC alone is
-- NOT a gate: custom GUCs can be set by any role, so `mutation_allowed()`
-- additionally requires that the calling role actually hold the privilege. This
-- scopes the bypass to authorized cleanup operators instead of letting any code
-- path silently blanket-unlock the audit tables for the whole transaction.

CREATE SCHEMA IF NOT EXISTS claim_utils;

-- Dedicated retention role: the only non-superuser allowed to bypass the
-- append-only guards for controlled cleanup. Created idempotently as a NOLOGIN
-- group role; an operator grants membership (e.g. `GRANT las_flores_claims_retention
-- TO <operator_role>`) when a non-superuser session needs to run retention jobs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'las_flores_claims_retention') THEN
    CREATE ROLE las_flores_claims_retention NOLOGIN;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION claim_utils.mutation_allowed()
RETURNS boolean AS $$
BEGIN
  -- Bypass requires BOTH the GUC and a privilege. The custom GUC alone is not
  -- sufficient (any role can set a custom GUC), so the caller must also be a
  -- superuser or a member of the retention role. `IS DISTINCT FROM` makes the
  -- guard treat an unset GUC (current_setting(..., true) -> NULL) as "not
  -- enabled" so even a privileged session must opt in via SET LOCAL.
  IF current_setting('claim_utils.allow_mutation', true) IS DISTINCT FROM 'true' THEN
    RETURN false;
  END IF;
  RETURN
    (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
    OR pg_has_role(current_user, 'las_flores_claims_retention', 'USAGE');
END;
$$ LANGUAGE plpgsql;

-- Consolidated immutable guard: parameterized function for all four
-- trigger cases. Row-level triggers (UPDATE/DELETE) return COALESCE(NEW, OLD)
-- to skip the mutation; statement-level triggers (TRUNCATE) return NULL to
-- allow the statement. The table_name parameter customizes the error message.
CREATE OR REPLACE FUNCTION claim_utils.block_immutable_mutation(
  p_table_name TEXT,
  p_is_truncate BOOLEAN DEFAULT false
)
RETURNS TRIGGER AS $$
BEGIN
  IF claim_utils.mutation_allowed() THEN
    -- Row-level: return the row (COALESCE handles UPDATE vs DELETE);
    -- Statement-level (TRUNCATE): return NULL to proceed.
    IF p_is_truncate THEN
      RETURN NULL;
    ELSE
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;
  IF p_is_truncate THEN
    RAISE EXCEPTION '% rows are immutable and cannot be truncated; a privileged session must set claim_utils.allow_mutation to mutate', p_table_name;
  ELSE
    RAISE EXCEPTION '% rows are immutable; a privileged session must set claim_utils.allow_mutation to mutate', p_table_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Row-level triggers (UPDATE/DELETE): block mutation, return row on bypass
DROP TRIGGER IF EXISTS evidence_immutable ON evidence;
CREATE TRIGGER evidence_immutable
BEFORE UPDATE OR DELETE ON evidence
FOR EACH ROW EXECUTE FUNCTION claim_utils.block_immutable_mutation('evidence', false);

DROP TRIGGER IF EXISTS claim_transitions_immutable ON claim_transitions;
CREATE TRIGGER claim_transitions_immutable
BEFORE UPDATE OR DELETE ON claim_transitions
FOR EACH ROW EXECUTE FUNCTION claim_utils.block_immutable_mutation('claim_transitions', false);

-- Statement-level triggers (TRUNCATE): block truncate, return NULL on bypass
-- TRUNCATE is statement-level and would otherwise bypass the row-level
-- UPDATE/DELETE guards above and erase the whole audit history. Gate it with the
-- same privilege check so a non-privileged session cannot wipe the store.
DROP TRIGGER IF EXISTS evidence_immutable_truncate ON evidence;
CREATE TRIGGER evidence_immutable_truncate
BEFORE TRUNCATE ON evidence
EXECUTE FUNCTION claim_utils.block_immutable_mutation('evidence', true);

DROP TRIGGER IF EXISTS claim_transitions_immutable_truncate ON claim_transitions;
CREATE TRIGGER claim_transitions_immutable_truncate
BEFORE TRUNCATE ON claim_transitions
EXECUTE FUNCTION claim_utils.block_immutable_mutation('claim_transitions', true);

-- ------------------------------------------------------------------
-- 5. Valid transition edges + claim-state consistency
-- ------------------------------------------------------------------
-- The CHECK constraints above only restrict the value *set*, not the permitted
-- edges. This trigger enforces the same transition matrix as
-- `VALID_TRANSITIONS` in ClaimsService.ts, and requires each journal row's
-- `from_status` to match the claim's current `status`. The claim row is locked
-- with FOR UPDATE so a concurrent transition cannot create divergent history.
CREATE OR REPLACE FUNCTION claim_utils.validate_claim_transition()
RETURNS TRIGGER AS $$
DECLARE
  current_status VARCHAR(20);
BEGIN
  SELECT status INTO current_status
    FROM claims
   WHERE id = NEW.claim_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim % does not exist', NEW.claim_id;
  END IF;

  -- Initial transition: NULL -> proposed when the claim status is proposed.
  IF NEW.from_status IS NULL THEN
    IF NEW.to_status <> 'proposed' OR current_status <> 'proposed' THEN
      RAISE EXCEPTION 'Invalid initial transition from NULL to % for claim status %', NEW.to_status, current_status;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.from_status <> current_status THEN
    RAISE EXCEPTION 'Transition from_status % does not match claim status %', NEW.from_status, current_status;
  END IF;

  IF NOT (
    (current_status = 'proposed' AND NEW.to_status IN ('accepted', 'rejected', 'merged')) OR
    (current_status = 'accepted' AND NEW.to_status IN ('rejected', 'merged')) OR
    (current_status = 'rejected' AND NEW.to_status IN ('accepted', 'merged'))
  ) THEN
    RAISE EXCEPTION 'Invalid transition from % to %', current_status, NEW.to_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS claim_transitions_validate ON claim_transitions;
CREATE TRIGGER claim_transitions_validate
BEFORE INSERT ON claim_transitions
FOR EACH ROW EXECUTE FUNCTION claim_utils.validate_claim_transition();

COMMIT;