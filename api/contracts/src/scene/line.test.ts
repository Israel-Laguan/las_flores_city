// api/contracts/src/scene/line.test.ts
// SC-307/306: the shared line shape — canonical JSON, specificity count, shape checks.

import {
  checkLineWhen,
  checkSlotLine,
  lineWhenSpecificity,
  lineWhenToJSON,
  slotLineFromJSON,
  slotLineKey,
  slotLineToJSON,
} from './line.js';

describe('line `when`', () => {
  test('canonical JSON sorts and de-duplicates lists and omits absent keys', () => {
    expect(lineWhenToJSON({ weather: ['rain', 'fog', 'rain'], time: ['night', 'day'] })).toEqual({
      time: ['day', 'night'],
      weather: ['fog', 'rain'],
    });
    expect(lineWhenToJSON({})).toEqual({});
  });

  test('authoring order does not change the canonical bytes', () => {
    const a = JSON.stringify(lineWhenToJSON({ time: ['day', 'night'] }));
    const b = JSON.stringify(lineWhenToJSON({ time: ['night', 'day'] }));
    expect(a).toBe(b);
  });

  test('specificity counts constrained dimensions', () => {
    expect(lineWhenSpecificity({})).toBe(0);
    expect(lineWhenSpecificity({ time: ['day'] })).toBe(1);
    expect(lineWhenSpecificity({ time: ['day'], weather: ['rain'] })).toBe(2);
  });

  test.each([
    ['not an object', 'x'],
    ['unknown key', { mood: ['sad'] }],
    ['empty list', { time: [] }],
    ['non-array', { weather: 'rain' }],
    ['bad time', { time: ['dawn'] }],
    ['bad weather', { weather: ['hail'] }],
  ])('rejects %s', (_name, value) => {
    expect(checkLineWhen(value, 'w').length).toBeGreaterThan(0);
  });

  test('accepts {} and valid lists', () => {
    expect(checkLineWhen({}, 'w')).toEqual([]);
    expect(checkLineWhen({ time: ['sunset'], weather: ['rain'] }, 'w')).toEqual([]);
  });
});

describe('slot line', () => {
  const good = { slot_id: 'host', line_id: 'greet', text: 'Hi.', when: { time: ['day'] } };

  test('round-trips and copies without aliasing', () => {
    const parsed = slotLineFromJSON(slotLineToJSON(slotLineFromJSON(good)));
    expect(parsed).toEqual(good);
    expect(parsed.when.time).not.toBe(good.when.time);
  });

  test('slotLineKey is slot_id.line_id', () => {
    expect(slotLineKey(good)).toBe('host.greet');
  });

  test.each([
    ['unknown key', { ...good, character: 'x' }],
    ['bad slot_id', { ...good, slot_id: 'no good' }],
    ['bad line_id', { ...good, line_id: '' }],
    ['blank text', { ...good, text: ' ' }],
    ['missing when', { slot_id: 'host', line_id: 'greet', text: 'Hi.' }],
  ])('rejects %s', (_name, value) => {
    expect(checkSlotLine(value, 'l').length).toBeGreaterThan(0);
  });

  test('accepts a valid line', () => {
    expect(checkSlotLine(good, 'l')).toEqual([]);
  });
});
