-- 098_districts_weather.sql
-- SC-309b: per-district default weather. Snapshotted into the scene at compile
-- time (SC-305) and NEVER read live at runtime.
--
-- The CHECK list mirrors WEATHER_TAGS in api/contracts/src/weather/weather-tag.ts.
-- Adding a tag = a new migration that drops and re-adds districts_weather_check
-- (same rewrite pattern as mysteries_status_check in 021). Parity between this
-- list and the contract is asserted by tests/integration/districts-weather.test.ts.
-- Transactional and idempotent. Verified no prior weather column (SC-S5).

-- Seed defaults only on the run that introduces the column, so a re-run never
-- overwrites an authored value (including an authored 'clear').
DO $$
DECLARE
  column_added boolean := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'districts' AND column_name = 'weather'
  );
BEGIN
  ALTER TABLE districts ADD COLUMN IF NOT EXISTS weather text NOT NULL DEFAULT 'clear';
  IF column_added THEN
    UPDATE districts SET weather = 'overcast' WHERE slug = 'city';
    UPDATE districts SET weather = 'fog'      WHERE slug = 'old-town';
    UPDATE districts SET weather = 'smog'     WHERE slug = 'industrial';
  END IF;
END $$;

ALTER TABLE districts DROP CONSTRAINT IF EXISTS districts_weather_check;
ALTER TABLE districts
  ADD CONSTRAINT districts_weather_check
  CHECK (weather IN ('clear', 'overcast', 'rain', 'storm', 'fog', 'smog', 'dust'));

COMMENT ON COLUMN districts.weather IS 'SC-309: default weather tag (WeatherTag vocabulary). Scenes may override; compile snapshots it.';

