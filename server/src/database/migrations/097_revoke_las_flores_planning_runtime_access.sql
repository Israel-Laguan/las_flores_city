-- ============================================================
-- 097_revoke_las_flores_planning_runtime_access.sql
--
-- SC-103 upgrade: revoke app-role (las_flores) access to planning/runtime
-- schemas. This is the permission lockdown step.
--
-- Execution order for manual application (all "manual" entries):
--   095_planning_runtime_schemas.sql (creates roles, schemas owned by them;
--     deliberately does *not* issue any GRANT USAGE/CREATE TO las_flores
--     (removed after ownership transfer) for partial-apply safety)
--   096_migrate_to_planning_runtime_roles.sql (legacy long-role rename + revokes)
--   097 (this file: final revoke of any las_flores grants from legacy 095)
--
-- After 097, only the owner roles (planning, runtime) hold CREATE/USAGE
-- on their schemas. The las_flores DATABASE_URL user and server app role
-- must not be able to write planning/runtime objects.
--
-- DDL for planning/runtime objects must always be run as/under the owner roles.
--
-- Scope: dev/CI only. 095/096/097 are not production-ready:
-- hard-coded dev passwords; CREATE ROLE assumes CREATEROLE (not available
-- on many managed Postgres). Production roles/schemas must be provisioned
-- out of band with environment-specific credentials.
--
-- Listed under the "manual" key in migration-targets.json.
-- The runner (migrate.ts) never applies "manual" entries.
-- ============================================================

-- Revoke any CREATE/USAGE (and more) that las_flores may hold from legacy 095/096.
-- (Current 095 issues none.) Idempotent; safe if re-run or on fresh DBs (no-op if no privilege).
REVOKE ALL ON SCHEMA planning FROM las_flores;
REVOKE ALL ON SCHEMA runtime FROM las_flores;

COMMENT ON SCHEMA planning IS
  'SC-103: planning canon, plan deltas, entity_edges. Written only by planning.';
COMMENT ON SCHEMA runtime IS
  'SC-103: player runtime state. Written only by runtime.';

-- Re-assert denials.
REVOKE ALL ON SCHEMA planning FROM PUBLIC;
REVOKE ALL ON SCHEMA runtime FROM PUBLIC;
REVOKE ALL ON SCHEMA planning FROM runtime;
REVOKE ALL ON SCHEMA runtime FROM planning;
