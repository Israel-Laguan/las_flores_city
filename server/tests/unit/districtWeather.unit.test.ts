import { describe, test, expect } from '@jest/globals';
import { validateContentString, validateYAMLFile } from '../../src/content/validate.js';
import { getContentTypeFromPath, extractContentIds } from '../../src/content/path-utils.js';
import { getContentTypeFromPath as getTypeFromValidateTypes } from '../../src/content/validate-types.js';
import path from 'node:path';

// SC-309c: district YAML carries an optional `weather:` tag. Pure tests — no DB/Redis.

describe('district content type', () => {
  const districtPath = '/repo/content/districts/industrial/district_industrial.yaml';
  const locationPath = '/repo/content/districts/industrial/locations/foo/location_foo.yaml';

  test('path detection: district yaml vs nested location yaml', () => {
    expect(getContentTypeFromPath(districtPath)).toBe('district');
    expect(getTypeFromValidateTypes(districtPath)).toBe('district');
    expect(getContentTypeFromPath(locationPath)).toBe('location');
    expect(getTypeFromValidateTypes(locationPath)).toBe('location');
  });

  test('districts are identified by slug', () => {
    expect(extractContentIds('district', { slug: 'old-town' })).toEqual(['old-town']);
    expect(extractContentIds('district', {})).toEqual([]);
  });
});

describe('district weather validation', () => {
  test('accepts a valid tag', async () => {
    const r = await validateContentString('type: district\nslug: industrial\nweather: smog\n', 'district');
    expect(r.valid).toBe(true);
  });

  test('weather is optional (null/absent = inherit/keep)', async () => {
    expect((await validateContentString('type: district\nslug: city\n', 'district')).valid).toBe(true);
    expect((await validateContentString('type: district\nslug: city\nweather: null\n', 'district')).valid).toBe(true);
  });

  test('rejects an unknown tag with a field-qualified message', async () => {
    const r = await validateContentString('type: district\nslug: city\nweather: plasma\n', 'district');
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/weather: .*plasma/);
  });

  test('rejects a bad slug', async () => {
    const r = await validateContentString('type: district\nslug: Bad Slug\nweather: rain\n', 'district');
    expect(r.valid).toBe(false);
  });

  test('shipped district files validate (path-qualified)', async () => {
    for (const s of ['industrial', 'city']) {
      const file = path.resolve(process.cwd(), `../content/districts/${s}/district_${s}.yaml`);
      const r = await validateYAMLFile(file, true);
      expect(r.errors).toEqual([]);
    }
  });
});
