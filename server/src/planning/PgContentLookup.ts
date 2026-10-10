// SC-405: Postgres-backed ContentLookup over the LEGACY content tables (scenes, districts,
// characters). Reads go through the existing oltpPool via queryOLTP — no new pools.
//
// `dialogues` is deliberately NOT implemented: legacy `dialogue_trees` has no slug column
// (its identity is a UUID + a display `name`), so a `dialogue_refs` slug cannot be resolved
// honestly. Compile therefore reports COMPILE_DIALOGUE_REFS_UNVERIFIED (a hint) rather than
// passing the refs unchecked. Giving dialogues a slug identity is part of A1 (file- vs
// DB-canonical content), not SC-M2.
//
// Characters resolve through `characters.slug`, which the content migration backfills
// (migration 102): a character without a slug is reported as missing until it is backfilled.

import { queryOLTP } from '@las-flores/infra';
import { isWeatherTag } from '@las-flores/api-contracts';
import type { ContentLookup, LocationInfo } from '@las-flores/api-planning';

export class PgContentLookup implements ContentLookup {
  constructor(private readonly query: typeof queryOLTP = queryOLTP) {}

  async locations(ids: readonly string[]): Promise<ReadonlyMap<string, LocationInfo>> {
    if (ids.length === 0) return new Map();
    const { rows } = await this.query<{ id: string; weather: string }>(
      `SELECT s.id::text AS id, d.weather
         FROM scenes s JOIN districts d ON d.id = s.district_id
        WHERE s.id = ANY($1::uuid[])`,
      [ids],
    );
    const out = new Map<string, LocationInfo>();
    for (const row of rows) {
      // districts_weather_check mirrors WEATHER_TAGS; a mismatch means the contract drifted.
      if (!isWeatherTag(row.weather)) throw new Error(`district weather '${row.weather}' is not a WeatherTag`);
      out.set(row.id, { districtWeather: row.weather });
    }
    return out;
  }

  async characters(slugs: readonly string[]): Promise<ReadonlySet<string>> {
    if (slugs.length === 0) return new Set();
    const { rows } = await this.query<{ slug: string }>('SELECT slug FROM characters WHERE slug = ANY($1::text[])', [slugs]);
    return new Set(rows.map((r) => r.slug));
  }
}
