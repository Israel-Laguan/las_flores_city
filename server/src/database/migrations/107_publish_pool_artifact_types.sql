-- 107_publish_pool_artifact_types.sql
-- SC-M3 T1: widen the `publish` artifact_type CHECKs for pool artifacts.
--
--   personality_pool  a compiled personality pool; name = pool slug
--   character_pools   the active pools a character uses; name = character slug
--
-- Why new kinds and not `dialogue`: `dialogue` means a standalone dialogue tree, and a name is
-- unique per (artifact_type, name), so pools would eventually collide with real dialogue names.
--
-- Both tables carry the same inline CHECK (104 on artifacts, 105 on revision_entries), so both
-- are rewritten. The constraints keep their auto-generated names, which is what DROP ... IF
-- EXISTS targets; the new CHECK is a superset of the old one, so every existing row (and every
-- existing artifact id) stays valid and nothing is rewritten. Grants are untouched: this file
-- only changes constraints, never ACLs.
--
-- Transactional DDL for the OLTP database (`oltp` array in migration-targets.json: one file =
-- one database). Idempotent (drop-if-exists + add). Forward-only. Depends on 104 and 105.

ALTER TABLE publish.artifacts DROP CONSTRAINT IF EXISTS artifacts_artifact_type_check;
ALTER TABLE publish.artifacts
  ADD CONSTRAINT artifacts_artifact_type_check
  CHECK (artifact_type IN ('scene', 'dialogue', 'mission', 'character', 'overlay', 'personality_pool', 'character_pools'));

ALTER TABLE publish.revision_entries DROP CONSTRAINT IF EXISTS revision_entries_artifact_type_check;
ALTER TABLE publish.revision_entries
  ADD CONSTRAINT revision_entries_artifact_type_check
  CHECK (artifact_type IN ('scene', 'dialogue', 'mission', 'character', 'overlay', 'personality_pool', 'character_pools'));
