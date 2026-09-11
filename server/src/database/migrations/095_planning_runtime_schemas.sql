-- ============================================================
-- 095_planning_runtime_schemas.sql
--
-- SC-103: `planning` and `runtime` schemas plus two LOGIN roles on the
-- existing las_flores OLTP database (same target as migrate.ts / CI postgres-oltp).
--
-- Scope: CI/dev postgres-oltp only this sprint. CREATE ROLE assumes CREATEROLE,
-- which the official postgres image grants to POSTGRES_USER=las_flores. Production
-- provisioning on managed Postgres (often no CREATEROLE) is an open question —
-- do not treat this file as production-ready role setup.
--
-- Grants do not touch existing server/ tables or the las_flores app role beyond
-- default privileges on the NEW schemas so future migration-created objects are
-- usable by the matching role.
--
-- Rollback: forward-only (SC-104). Dropping login roles that may own objects is
-- not a safe automatic reverse.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS planning;
CREATE SCHEMA IF NOT EXISTS runtime;

COMMENT ON SCHEMA planning IS
  'SC-103: planning canon, plan deltas, entity_edges. Written only by las_flores_planning.';
COMMENT ON SCHEMA runtime IS
  'SC-103: player runtime state. Written only by las_flores_runtime.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'las_flores_planning') THEN
    CREATE ROLE las_flores_planning LOGIN PASSWORD 'las_flores_planning_dev_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'las_flores_runtime') THEN
    CREATE ROLE las_flores_runtime LOGIN PASSWORD 'las_flores_runtime_dev_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE las_flores TO las_flores_planning;
GRANT CONNECT ON DATABASE las_flores TO las_flores_runtime;

GRANT USAGE, CREATE ON SCHEMA planning TO las_flores_planning;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA planning TO las_flores_planning;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA planning TO las_flores_planning;
ALTER DEFAULT PRIVILEGES FOR ROLE las_flores IN SCHEMA planning
  GRANT ALL PRIVILEGES ON TABLES TO las_flores_planning;
ALTER DEFAULT PRIVILEGES FOR ROLE las_flores IN SCHEMA planning
  GRANT ALL PRIVILEGES ON SEQUENCES TO las_flores_planning;

GRANT USAGE, CREATE ON SCHEMA runtime TO las_flores_runtime;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA runtime TO las_flores_runtime;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA runtime TO las_flores_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE las_flores IN SCHEMA runtime
  GRANT ALL PRIVILEGES ON TABLES TO las_flores_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE las_flores IN SCHEMA runtime
  GRANT ALL PRIVILEGES ON SEQUENCES TO las_flores_runtime;

-- Explicit denials: runtime must not even USAGE planning, and vice versa.
REVOKE ALL ON SCHEMA planning FROM PUBLIC;
REVOKE ALL ON SCHEMA runtime FROM PUBLIC;
REVOKE ALL ON SCHEMA planning FROM las_flores_runtime;
REVOKE ALL ON SCHEMA runtime FROM las_flores_planning;
