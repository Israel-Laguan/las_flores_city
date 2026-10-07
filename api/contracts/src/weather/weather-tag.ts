// api/contracts/src/weather/weather-tag.ts
// SC-309a: Closed weather vocabulary shared by district defaults, scene
// overrides, and the compile-time snapshot.
//
// Weather tags and time-of-day tags (`day` / `sunset` / `night`) are DIFFERENT
// axes that share ONE variant namespace in asset filenames
// (`<slug>__rain.png`, `<slug>__night.png`). Every WeatherTag is therefore also
// a valid `background_urls[].variant` hint. When the client builds its ordered
// hint chain, weather outranks time-of-day: weather > time-of-day > mood.
// No WeatherTag may ever equal a time-of-day tag (enforced by unit test).

export const WEATHER_TAGS = [
  'clear',
  'overcast',
  'rain',
  'storm',
  'fog',
  'smog',
  'dust',
] as const;

export type WeatherTag = (typeof WEATHER_TAGS)[number];

/** Weather used when nothing else is specified; the DB column default. */
export const DEFAULT_WEATHER_TAG: WeatherTag = 'clear';

/**
 * Time-of-day variant tags. Listed here only to document (and test) that the
 * two vocabularies never collide; they are not weather.
 */
export const TIME_OF_DAY_VARIANT_TAGS = ['day', 'sunset', 'night'] as const;

export class InvalidWeatherTagError extends Error {
  constructor(tag: unknown, message: string) {
    super(`Invalid weather tag '${String(tag)}': ${message}`);
    this.name = 'InvalidWeatherTagError';
  }
}

export function isWeatherTag(value: unknown): value is WeatherTag {
  return typeof value === 'string' && (WEATHER_TAGS as readonly string[]).includes(value);
}

/**
 * Validates a weather tag. `null` (or `undefined`) means "inherit from the
 * district" and is returned as `null`. Anything else must be an exact member of
 * WEATHER_TAGS (case-sensitive, matching the lowercase variant filenames).
 */
export function validateWeatherTag(tag: unknown): WeatherTag | null {
  if (tag === null || tag === undefined) {
    return null;
  }
  if (typeof tag !== 'string') {
    throw new InvalidWeatherTagError(tag, 'tag must be a string or null');
  }
  if (!isWeatherTag(tag)) {
    throw new InvalidWeatherTagError(tag, `must be one of: ${WEATHER_TAGS.join(', ')}`);
  }
  return tag;
}
