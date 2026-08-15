-- Las Flores 2077 - Meta-Plot Finale Alignment: OLTP (Task 5.3)
--
-- Split out of the former dual-target `028_metaplot_alignment.sql` so this file
-- targets ONLY the OLTP database. It follows the one-file-per-DB convention used
-- by every other migration in this repo — no `current_database()` guard.
--
-- The version prefix stays `028` (matching the parent migration) so databases
-- that already recorded version `028` for `las_flores` are skipped by the
-- runner's `isAppliedOn` version check.
--
-- OLTP: `faction_alignment` enum + `users.alignment` column + the
-- `dialogue_overlays.unlock_condition` gate. `users.alignment` is defaulted to
-- 'neutral', set by /dialogue/choose when a YAML choice carries an
-- `alignment_change` directive. Drives overlay unlock gating
-- (`loyalist_only` / `fugitive_only`) in the DialogueResolver.
--
-- Note: Drift #13 — the spec's `alignment_locked` event type is not in the
-- existing CHECK constraint (added by 020_add_mystery_solved_event_type.sql).
-- That CHECK rewrite is handled by the OLAP counterpart `028_metaplot_olap.sql`.

BEGIN;

CREATE TYPE faction_alignment AS ENUM ('neutral', 'loyalist', 'fugitive');
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS alignment faction_alignment NOT NULL DEFAULT 'neutral';
-- Task 5.3: unlock_condition gate on dialogue_overlays.
-- nullable because existing overlay rows have no gate;
-- 'none' and 'patreon_nsfw' are the only pre-existing
-- values; 'loyalist_only' and 'fugitive_only' are new.
ALTER TABLE dialogue_overlays
    ADD COLUMN IF NOT EXISTS unlock_condition VARCHAR(50) DEFAULT 'none';

COMMIT;