import { describe, it, expect } from '@jest/globals';
import {
  WEATHER_TAGS,
  TIME_OF_DAY_VARIANT_TAGS,
  DEFAULT_WEATHER_TAG,
  InvalidWeatherTagError,
  isWeatherTag,
  validateWeatherTag,
} from './weather-tag.js';

describe('validateWeatherTag', () => {
  it.each([...WEATHER_TAGS])('accepts %s', (tag) => {
    expect(validateWeatherTag(tag)).toBe(tag);
  });

  it('treats null and undefined as inherit (null)', () => {
    expect(validateWeatherTag(null)).toBeNull();
    expect(validateWeatherTag(undefined)).toBeNull();
  });

  it.each(['plasma', '', 'Rain', ' rain', 'night', 'sunset'])('rejects %j', (tag) => {
    expect(() => validateWeatherTag(tag)).toThrow(InvalidWeatherTagError);
  });

  it.each([1, true, {}, []])('rejects non-string %j', (tag) => {
    expect(() => validateWeatherTag(tag)).toThrow(InvalidWeatherTagError);
  });

  it('names the offending tag and the allowed set in the message', () => {
    expect(() => validateWeatherTag('plasma')).toThrow(/plasma.*clear/);
  });
});

describe('weather vocabulary', () => {
  it('never collides with a time-of-day tag', () => {
    for (const t of TIME_OF_DAY_VARIANT_TAGS) {
      expect(isWeatherTag(t)).toBe(false);
    }
  });

  it('has lowercase filename-safe tags and a valid default', () => {
    for (const t of WEATHER_TAGS) {
      expect(t).toMatch(/^[a-z]+$/);
    }
    expect(isWeatherTag(DEFAULT_WEATHER_TAG)).toBe(true);
  });
});
