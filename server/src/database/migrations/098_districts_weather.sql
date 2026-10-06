-- 098_districts_weather.sql
-- SC-309b: per-district default weather. Snapshotted into the scene at compile
-- time (SC-305) and NEVER read live at runtime.
--
-- The CHECK list mirrors WEATHER_TAGS in api/contracts/src/weather/weather-tag.ts.
-- Adding a tag = a new migration that drops and re-adds districts_weather_check
-- (same rewrite pattern as mysteries_status_check in 021). Parity between this
-- list and the contract is asserted by tests/integration/districts-weather.test.ts.
-- Transactional and idempotent. Verified no prior weather column (SC-S5).

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS weather text NOT NULL DEFAULT 'clear';

ALTER TABLE districts DROP CONSTRAINT IF EXISTS districts_weather_check;
ALTER TABLE districts
  ADD CONSTRAINT districts_weather_check
  CHECK (weather IN ('clear', 'overcast', 'rain', 'storm', 'fog', 'smog', 'dust'));

COMMENT ON COLUMN districts.weather IS 'SC-309: default weather tag (WeatherTag vocabulary). Scenes may override; compile snapshots it.';

-- Seed defaults for rows created by 034/035 (those files stay untouched).
-- Only rows still at the column default are touched, so a re-run never
-- clobbers a value an author has since changed.
UPDATE districts SET weather = 'overcast' WHERE slug = 'city'       AND weather = 'clear';
UPDATE districts SET weather = 'fog'      WHERE slug = 'old-town'   AND weather = 'clear';
UPDATE districts SET weather = 'smog'     WHERE slug = 'industrial' AND weather = 'clear';
