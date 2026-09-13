-- ============================================================
-- 095_planning_runtime_schemas.sql
--
-- SC-103: `planning` and `runtime` schemas plus two LOGIN roles on the
-- existing las_flores OLTP database (same target as migrate.ts / CI postgres-oltp).
--
-- Registered in oltp (CREATE ROLE / CREATE SCHEMA / ALTER are transactional in Postgres
-- and run safely inside the migration's BEGIN/COMMIT wrapper). Nontransactional mode
-- would risk partial schema+role creation with no schema_migrations row on mid-file failure.
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

-- Roles first (non-transactional), then schemas owned by them so the
-- DATABASE_URL migration user (las_flores) does not remain owner.
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

CREATE SCHEMA IF NOT EXISTS planning AUTHORIZATION planning;
CREATE SCHEMA IF NOT EXISTS runtime AUTHORIZATION runtime;
-- Ensure owner even on re-run or pre-existing schema (idempotent).
ALTER SCHEMA planning OWNER TO planning;
ALTER SCHEMA runtime OWNER TO runtime;

-- The DATABASE_URL user (las_flores) and server app role must be able to create
-- objects in these schemas (future migrations, default-privs mechanism). After
-- AUTHORIZATION/OWNER change the implicit rights are gone; grant explicitly.
GRANT USAGE, CREATE ON SCHEMA planning TO las_flores;
GRANT USAGE, CREATE ON SCHEMA runtime TO las_flores;

COMMENT ON SCHEMA planning IS
  'SC-103: planning canon, plan deltas, entity_edges. Written only by planning.';
COMMENT ON SCHEMA runtime IS
  'SC-103: player runtime state. Written only by runtime.';

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

-- Explicit denials: runtime must not even USAGE planning, and vice versa.
REVOKE ALL ON SCHEMA planning FROM PUBLIC;
REVOKE ALL ON SCHEMA runtime FROM PUBLIC;
REVOKE ALL ON SCHEMA planning FROM runtime;
REVOKE ALL ON SCHEMA runtime FROM planning;
