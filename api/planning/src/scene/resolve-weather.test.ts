// api/planning/src/scene/resolve-weather.test.ts
// SC-305 (m-64): weather resolution with provenance — table-driven.

import type { WeatherTag } from '@las-flores/api-contracts';
import { resolveWeather, type WeatherSource } from './resolve-weather.js';

type Row = [name: string, weather: WeatherTag | null | undefined, provenance: string | undefined, expected: { weather: WeatherTag; source: WeatherSource }];

const ROWS: Row[] = [
  ['scene value wins over district', 'fog', 'base', { weather: 'fog', source: 'scene' }],
  ['overlay value wins over district', 'rain', 'vq_pushed_away_rain', { weather: 'rain', source: 'overlay:vq_pushed_away_rain' }],
  ['null inherits the district default', null, 'base', { weather: 'overcast', source: 'district' }],
  ['undefined inherits the district default', undefined, undefined, { weather: 'overcast', source: 'district' }],
];

describe('resolveWeather (SC-305)', () => {
  test.each(ROWS)('%s', (_name, weather, prov, expected) => {
    const composed = { weather, provenance: prov === undefined ? {} : { weather: prov } };
    expect(resolveWeather(composed, 'overcast')).toEqual(expected);
  });

  test('an overlay that clears weather to null falls back to the district', () => {
    expect(resolveWeather({ weather: null, provenance: { weather: 'clear_it' } }, 'smog')).toEqual({ weather: 'smog', source: 'district' });
  });
});
