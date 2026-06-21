-- Las Flores 2077 - Allow Player State Credit Overdraft
-- Enables sleep rent deduction to create negative credits with overdraft=true.

BEGIN;

ALTER TABLE player_states
  DROP CONSTRAINT IF EXISTS player_states_credits_check;

COMMIT;
