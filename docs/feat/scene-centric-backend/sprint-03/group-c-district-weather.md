# Group C — District weather (SC-309, split into 3 tasks)

The weather *source* is already decided (A6 / `spikes/SC-S5-weather-source.md`): a
`districts.weather` default plus an optional per-scene override, **snapshotted at compile and
never read live at runtime**. SC-309 was one S ticket; its real surface (vocabulary, DDL,
tooling) is three tasks. This group is the only part of the sprint that touches the existing
server/content, so it ships early and independently.

Critical path: **C1 → C2 → C3**; C2 also unblocks E4 (SC-305).

> **Status: ✅ Done (merged).** Delivered as specified; deviations and facts downstream groups rely on:
> - **Vocabulary (final):** `clear | overcast | rain | storm | fog | smog | dust` (`WEATHER_TAGS`, `DEFAULT_WEATHER_TAG = 'clear'`), exported from `@las-flores/api-contracts` with `validateWeatherTag()` (`null`/`undefined` → `null` = inherit), `isWeatherTag()`, `InvalidWeatherTagError`.
> - **098** uses a named, drop-and-re-add `districts_weather_check`; seeds only touch rows still at `'clear'` (city `overcast`, old-town `fog`, industrial `smog`). Real DB slugs today: south, city, downtown, old-town, commercial, industrial, unknown.
> - **Parity test already exists** (`server/tests/integration/districts-weather.test.ts`: SQL CHECK list ⇔ `WEATHER_TAGS`) — SC-318 reuses/extends it rather than writing a new one.
> - **Content:** districts had no YAML. New `district` content type: `content/districts/<slug>/district_<slug>.yaml` (`type`, `slug`, optional nullable `weather`), upsert updates an existing row by slug only. `shared` takes `weather` as a plain string (it cannot import contracts); the server validator enforces the vocabulary. Admin: `/districts/[slug]` + `/edit`, free-text field.
> - Nothing reads `districts.weather` at runtime.

---

## SC-309a · Weather vocabulary + contract type · S · P0

**Scope in**
- A closed set of weather tags in `api/contracts/src/weather/` (`WeatherTag`), e.g. `clear | rain | fog | storm | …` — final list decided here against `docs/ASSET_EXPRESSION_VOCABULARY.md` §2 so every tag is a valid `background_urls[].variant` hint for `buildBackgroundHints`.
- Resolve the overlap: time-of-day tags (`day`/`sunset`/`night`) and weather tags share the **same** variant namespace (`__rain`, `__night`). Document that they are different axes that feed one ordered hint chain, and that `weather` outranks time-of-day (AGENTS precedence list).
- `validateWeatherTag()` + a `null` meaning "inherit".

**Acceptance**
- Every tag maps to a documented variant name; the vocabulary doc gains a "Weather tags" subsection.
- Type lives in `contracts`, imports nothing from planning/runtime.

- m-30 Add `weather/` module, export from `api/contracts/src/index.ts`.
- m-31 Unit test: valid/invalid tags, `null` = inherit.
- m-32 Update `docs/ASSET_EXPRESSION_VOCABULARY.md`.

---

## SC-309b · Migration 098 — `districts.weather` + seed defaults · M · P0

**Scope in**
- `098_districts_weather.sql` (oltp array): `ALTER TABLE districts ADD COLUMN IF NOT EXISTS weather text` with a CHECK against the C1 vocabulary (or a lookup constraint that is rewritten in one place — see the `mysteries.status` CHECK precedent in AGENTS), `NOT NULL DEFAULT 'clear'`.
- Seed per-district defaults by updating the rows seeded in `034_seed_districts.sql` / `035_seed_districts_extended.sql` (do **not** edit those files — they are already applied; use `UPDATE … WHERE slug = …` in 098).
- Idempotent; follows the AGENTS "verify the column doesn't already exist (`\d districts`)" rule — verified by the SC-S5 inventory (no weather column anywhere today).

**Acceptance**
- Re-run is a no-op; every existing district row has a non-null valid weather afterwards.
- A CHECK violation test proves an unknown tag is rejected at the DB.
- Registered in exactly one target array; no `current_database()` dispatch.

- m-33 Write 098 + register it.
- m-34 Integration test: column exists, defaults seeded, CHECK rejects `'plasma'`.
- m-35 Add the column to `docs`'s schema reference if one lists `districts`.

---

## SC-309c · District content + admin tooling for weather · M · P1

**Scope in**
- `content/districts/<slug>/` metadata (the folder layout is per-slug; confirm where district fields live — `content/districts/central/` has only `central.md` + `locations/`, so first locate the YAML/seed source of truth) gains an optional `weather:`.
- Shared schema (district shape in `shared/`) accepts `weather`; `server/src/content/migrate.ts` + `validate.ts` read/write it; admin district editor exposes it (read/write only — no new endpoints beyond the existing admin content routes).
- `npm run validate:content` rejects an unknown weather tag with a path-qualified message.

**Scope out:** any runtime read of `districts.weather` (forbidden — compile snapshots it; see SC-305).

**Acceptance**
- A district with `weather: rain` round-trips YAML → DB → admin → YAML.
- Content with an invalid tag fails `validate:content`.

- m-36 Locate the district source of truth and add the optional field.
- m-37 Extend migrate/validate + the shared schema.
- m-38 Admin form field + a validation test.
