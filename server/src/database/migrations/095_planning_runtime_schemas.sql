-- 095_planning_runtime_schemas.sql
-- SC-103: planning + runtime schemas and LOGIN roles (nontransactional).
-- Full context and scope notes at end of file.
--
-- Rollback: FORWARD-ONLY. The roles/schemas are dev/CI-only and are
-- re-creatable by re-running this migration (IF NOT EXISTS guards).
-- No down-migration is provided; deleting the schemas would require
-- manual REVOKEN/ALTER OWNER steps and is not worth the maintenance
-- cost for an interim sprint-1 artifact. See roadmap.md §4 rollback boundary.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'planning') THEN
    CREATE ROLE planning LOGIN PASSWORD 'dev_planning';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime') THEN
    CREATE ROLE runtime LOGIN PASSWORD 'dev_runtime';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS planning;
CREATE SCHEMA IF NOT EXISTS runtime;

ALTER SCHEMA planning OWNER TO planning;
ALTER SCHEMA runtime OWNER TO runtime;

COMMENT ON SCHEMA planning IS 'SC-103 rung 2: planning canon, plan_deltas, entity_edges etc. Owned by planning role.';
COMMENT ON SCHEMA runtime IS 'SC-103 rung 2: player runtime state. Owned by runtime role.';

GRANT CONNECT ON DATABASE las_flores TO planning;
GRANT CONNECT ON DATABASE las_flores TO runtime;

GRANT USAGE, CREATE ON SCHEMA planning TO planning;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA planning TO planning;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA planning TO planning;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning GRANT ALL ON TABLES TO planning;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning GRANT ALL ON SEQUENCES TO planning;

GRANT USAGE, CREATE ON SCHEMA runtime TO runtime;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA runtime TO runtime;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA runtime TO runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA runtime GRANT ALL ON TABLES TO runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA runtime GRANT ALL ON SEQUENCES TO runtime;

REVOKE ALL ON SCHEMA planning FROM PUBLIC;
REVOKE ALL ON SCHEMA runtime FROM PUBLIC;
REVOKE ALL ON SCHEMA planning FROM runtime;
REVOKE ALL ON SCHEMA runtime FROM planning;
REVOKE ALL ON SCHEMA planning FROM las_flores;
REVOKE ALL ON SCHEMA runtime FROM las_flores;

-- ============================================================
-- SC-103 implementation notes (per ticket + architecture.md §3):
-- - nontransactional registration (CREATE ROLE)
-- - fixed dev passwords, LOGIN roles (required for SC-106 raw client)
-- - owner + explicit grants + default privs
-- - zero grants to las_flores / cross-role / public
-- - dev/CI only; CREATEROLE assumed; prod provisioning open
-- - no new pools; existing server/ tables untouched
-- - forward only for this sprint
-- ============================================================
