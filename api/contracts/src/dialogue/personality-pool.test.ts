// api/contracts/src/dialogue/personality-pool.test.ts
// SC-306: pool validation (one case per code), strict round trip, canonical hash input.

import {
  InvalidPersonalityPoolError,
  POOL_ISSUE_CODES,
  createPersonalityPool,
  personalityPoolFromJSON,
  personalityPoolToJSON,
  stringifyPersonalityPool,
  validatePersonalityPool,
  type PersonalityPool,
} from './personality-pool.js';

const pool = (): PersonalityPool =>
  createPersonalityPool({
    slug: 'street_vendor',
    lines: [
      { line_id: 'hello', text: 'Fresh today!', when: {} },
      { line_id: 'rain_hello', text: 'Wet day, hot soup.', when: { weather: ['rain', 'storm'], time: ['night', 'day'] } },
    ],
  });

const valid = (): Record<string, any> => personalityPoolToJSON(pool());
const mutate = (fn: (o: Record<string, any>) => void) => () => {
  const o = valid();
  fn(o);
  return o;
};

type Case = [code: string, path: string, input: () => unknown];

const CASES: Case[] = [
  ['POOL_NOT_OBJECT', '', () => []],
  ['POOL_FIELD_UNKNOWN', 'traits', mutate((o) => (o.traits = ['gruff']))],
  ['POOL_FIELD_UNKNOWN', 'stats', mutate((o) => (o.stats = { charm: 3 }))],
  ['POOL_FIELD_UNKNOWN', 'characters', mutate((o) => (o.characters = ['a']))],
  ['POOL_FIELD_MISSING', 'slug', mutate((o) => delete o.slug)],
  ['POOL_FIELD_MISSING', 'lines', mutate((o) => delete o.lines)],
  ['POOL_FIELD_TYPE', 'lines', mutate((o) => (o.lines = 'hi'))],
  ['POOL_SCHEMA_VERSION_MISMATCH', 'schema_version', mutate((o) => (o.schema_version = 2))],
  ['POOL_SLUG_INVALID', 'slug', mutate((o) => (o.slug = 'has space'))],
  ['POOL_LINES_EMPTY', 'lines', mutate((o) => (o.lines = []))],
  ['POOL_LINE_INVALID', 'lines[0].text', mutate((o) => (o.lines[0].text = ' '))],
  ['POOL_LINE_INVALID', 'lines[0].line_id', mutate((o) => (o.lines[0].line_id = 'no good'))],
  ['POOL_LINE_INVALID', 'lines[0].when', mutate((o) => delete o.lines[0].when)],
  ['POOL_LINE_INVALID', 'lines[1].when.weather', mutate((o) => (o.lines[1].when.weather = []))],
  ['POOL_LINE_INVALID', 'lines[1].when.time', mutate((o) => (o.lines[1].when.time = ['dawn']))],
  ['POOL_LINE_INVALID', 'lines[0].mood', mutate((o) => (o.lines[0].mood = 'sad'))],
  ['POOL_LINE_INVALID', 'lines[0].slot_id', mutate((o) => (o.lines[0].slot_id = 'host'))],
  ['POOL_LINE_INVALID', 'lines[0]', mutate((o) => (o.lines[0] = 'hello'))],
  ['POOL_LINE_DUPLICATE', 'lines[1]', mutate((o) => (o.lines[1].line_id = 'hello'))],
];

describe('validatePersonalityPool (SC-306)', () => {
  test('a valid pool has no issues', () => {
    expect(validatePersonalityPool(valid())).toEqual({ valid: true, issues: [] });
  });

  test.each(CASES)('%s at %p', (code, path, input) => {
    const { issues, valid: ok } = validatePersonalityPool(input());
    expect(issues).toContainEqual(expect.objectContaining({ code, path, severity: 'error' }));
    expect(ok).toBe(false);
  });

  test('every documented code has a case; codes equal their keys', () => {
    const covered = new Set(CASES.map(([c]) => c));
    for (const [k, v] of Object.entries(POOL_ISSUE_CODES)) {
      expect(v).toBe(k);
      expect(covered).toContain(v);
    }
  });

  test('a pool can never carry traits, stats or character data: those keys are errors', () => {
    for (const key of ['traits', 'stats', 'personality', 'relationships', 'character', 'characters']) {
      const o = valid();
      o[key] = {};
      expect(validatePersonalityPool(o).valid).toBe(false);
    }
  });

  test('collects every issue in one pass and never throws on hostile input', () => {
    const { issues } = validatePersonalityPool({ slug: 'bad slug', lines: [], schema_version: 9, extra: 1 });
    expect(issues.map((i) => i.code).sort()).toEqual(
      ['POOL_FIELD_UNKNOWN', 'POOL_LINES_EMPTY', 'POOL_SCHEMA_VERSION_MISMATCH', 'POOL_SLUG_INVALID'].sort(),
    );
    for (const input of [null, undefined, 'x', 3, { lines: [null, 3, []] }]) expect(() => validatePersonalityPool(input)).not.toThrow();
  });
});

describe('serialization', () => {
  test('round-trips and copies without aliasing', () => {
    const raw = valid();
    const parsed = personalityPoolFromJSON(JSON.parse(JSON.stringify(raw)));
    expect(parsed).toEqual(pool().lines && { slug: 'street_vendor', lines: [pool().lines[0], { ...pool().lines[1], when: { time: ['day', 'night'], weather: ['rain', 'storm'] } }] });
    raw.lines[0].text = 'mutated';
    expect(parsed.lines[0].text).toBe('Fresh today!');
  });

  test('canonical bytes ignore `when` authoring order and key order', () => {
    const a = stringifyPersonalityPool(pool());
    const reordered = createPersonalityPool({
      slug: 'street_vendor',
      lines: [pool().lines[0], { ...pool().lines[1], when: { time: ['day', 'night'], weather: ['storm', 'rain'] } }],
    });
    expect(stringifyPersonalityPool(reordered)).toBe(a);
  });

  test('line order is meaningful and kept (it is authored content, ids are the identity)', () => {
    const swapped = createPersonalityPool({ slug: 'street_vendor', lines: [pool().lines[1], pool().lines[0]] });
    expect(stringifyPersonalityPool(swapped)).not.toBe(stringifyPersonalityPool(pool()));
  });

  test('fromJSON throws InvalidPersonalityPoolError carrying every error', () => {
    try {
      personalityPoolFromJSON({ ...valid(), slug: 'bad slug', lines: [] });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPersonalityPoolError);
      expect((err as InvalidPersonalityPoolError).issues.map((i) => i.code).sort()).toEqual(['POOL_LINES_EMPTY', 'POOL_SLUG_INVALID']);
    }
  });

  test('toJSON emits sorted keys and stamps the schema version', () => {
    const json = personalityPoolToJSON(pool());
    expect(Object.keys(json)).toEqual(['lines', 'schema_version', 'slug']);
    expect(json.schema_version).toBe(1);
  });
});
