// api/planning/src/scene/resolve-weather.ts
// SC-305: final weather for a composed scene, with where it came from (SC-S5).
//
// Scene/overlay value wins; otherwise the district default. The district weather is an
// ARGUMENT (compile passes the `districts.weather` snapshot read at revision R) — this
// never reads a district row. `null` and `undefined` both mean "inherit". The resolved
// value is part of the result so nothing downstream recomputes it.

import type { ComposedScene, WeatherTag } from '@las-flores/api-contracts';

export type WeatherSource = 'scene' | 'district' | `overlay:${string}`;

export interface ResolvedWeather {
  weather: WeatherTag;
  source: WeatherSource;
}

export interface WeatherInput {
  weather?: ComposedScene['weather'];
  provenance: Partial<ComposedScene['provenance']>;
}

export function resolveWeather(composed: WeatherInput, districtWeather: WeatherTag): ResolvedWeather {
  if (composed.weather === null || composed.weather === undefined) {
    return { weather: districtWeather, source: 'district' };
  }
  const origin = composed.provenance.weather;
  return {
    weather: composed.weather,
    source: origin === undefined || origin === 'base' ? 'scene' : `overlay:${origin}`,
  };
}
