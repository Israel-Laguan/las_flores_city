-- 100_migration_log_district_validate.sql
-- Follow-up to 099_migration_log_district.sql, which added
-- migration_log_content_type_check as NOT VALID. Now that 099 has committed,
-- scan existing rows once to confirm they satisfy the allowed set.
-- Idempotent: re-validating an already-validated constraint is a no-op.

ALTER TABLE migration_log VALIDATE CONSTRAINT migration_log_content_type_check;
