-- ============================================================
-- 096_migrate_to_planning_runtime_roles.sql
--
-- Transition migration for databases that applied an earlier revision of 095
-- which created the long-named roles (las_flores_planning / las_flores_runtime).
-- Renames the roles to the short canonical names (planning / runtime) and
-- ensures schema ownership + required grants.
--
-- Execution order (manual applies only): 095 (base schemas/roles; deliberately
-- issues no USAGE/CREATE grants to las_flores for partial-apply safety),
-- then 096 (legacy role rename + revokes), then 097 (final revoke + lockdown).
-- Idempotent. Safe to run on fresh DBs (no-op if target roles already exist).
-- Listed under "manual" in migration-targets.json (never auto-applied by runner).
-- ============================================================

DO $$
BEGIN
  -- Rename old roles to canonical short names if the old ones exist and the
  -- new ones do not. Role rename updates ownership references automatically.
  -- Collision (both legacy and canonical present) is explicit failure: do not
  -- silently leave the legacy principal active with its old grants.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'las_flores_planning')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'planning') THEN
    RAISE EXCEPTION 'Role collision: both las_flores_planning and planning exist. Retire legacy role (revoke, transfer ownership, DROP) before re-running 096.';
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'las_flores_planning') THEN
    ALTER ROLE las_flores_planning RENAME TO planning;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'las_flores_runtime')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime') THEN
    RAISE EXCEPTION 'Role collision: both las_flores_runtime and runtime exist. Retire legacy role (revoke, transfer ownership, DROP) before re-running 096.';
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'las_flores_runtime') THEN
    ALTER ROLE las_flores_runtime RENAME TO runtime;
  END IF;
END
$$;

-- Ensure the short-named schemas exist and are owned by the (possibly just-renamed) roles.
CREATE SCHEMA IF NOT EXISTS planning AUTHORIZATION planning;
CREATE SCHEMA IF NOT EXISTS runtime AUTHORIZATION runtime;

ALTER SCHEMA planning OWNER TO planning;
ALTER SCHEMA runtime OWNER TO runtime;

COMMENT ON SCHEMA planning IS
  'SC-103: planning canon, plan deltas, entity_edges. Written only by planning.';
COMMENT ON SCHEMA runtime IS
  'SC-103: player runtime state. Written only by runtime.';

-- Owner grants + default-privs (idempotent re-application for transitioned DBs).
-- 095 itself no longer issues any grants to las_flores.
GRANT CONNECT ON DATABASE las_flores TO planning;
GRANT CONNECT ON DATABASE las_flores TO runtime;

GRANT USAGE, CREATE ON SCHEMA planning TO planning;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA planning TO planning;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA planning TO planning;
ALTER DEFAULT PRIVILEGES FOR ROLE las_flores IN SCHEMA planning
  GRANT ALL PRIVILEGES ON TABLES TO planning;
ALTER DEFAULT PRIVILEGES FOR ROLE las_flores IN SCHEMA planning
  GRANT ALL PRIVILEGES ON SEQUENCES TO planning;

GRANT USAGE, CREATE ON SCHEMA runtime TO runtime;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA runtime TO runtime;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA runtime TO runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE las_flores IN SCHEMA runtime
  GRANT ALL PRIVILEGES ON TABLES TO runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE las_flores IN SCHEMA runtime
  GRANT ALL PRIVILEGES ON SEQUENCES TO runtime;

-- On legacy DBs that received USAGE,CREATE grants to las_flores from older
-- revisions of 095 (before the P2 violation fix that removed the grants
-- after ownership transfer), the GRANTs are not removed by just deleting
-- the statements from 095. Explicitly revoke here (and 097 re-asserts) so
-- app role cannot create objects in the dedicated schemas.
REVOKE ALL ON SCHEMA planning FROM las_flores;
REVOKE ALL ON SCHEMA runtime FROM las_flores;

-- No CREATE grants to the app role (las_flores) after 095/097.
-- DDL targeting planning/runtime schemas must be executed under the owning
-- role (or dedicated migration role with env creds). Apply order: 095→096→097.

-- Explicit denials (re-assert).
REVOKE ALL ON SCHEMA planning FROM PUBLIC;
REVOKE ALL ON SCHEMA runtime FROM PUBLIC;
REVOKE ALL ON SCHEMA planning FROM runtime;
REVOKE ALL ON SCHEMA runtime FROM planning;
