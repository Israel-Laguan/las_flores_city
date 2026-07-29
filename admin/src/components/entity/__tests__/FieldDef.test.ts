import { describe, it, expect } from 'vitest';
import { getByPath, setByPath } from '../FieldDef';

describe('FieldDef helpers', () => {
  it('getByPath reads nested values', () => {
    const obj = { a: { b: { c: 42 } }, d: 'x' };
    expect(getByPath(obj, 'a.b.c')).toBe(42);
    expect(getByPath(obj, 'a.b')).toEqual({ c: 42 });
    expect(getByPath(obj, 'd')).toBe('x');
    expect(getByPath(obj, 'missing')).toBeUndefined();
  });

  it('setByPath mutates immutably and guards prototype pollution', () => {
    const obj = { a: { b: 1 } };
    const next = setByPath(obj, 'a.b', 2);
    expect(next).not.toBe(obj);
    expect(obj.a.b).toBe(1);
    expect((next as any).a.b).toBe(2);

    const polluted = setByPath(obj, '__proto__.polluted', true);
    expect((polluted as any).__proto__.polluted).toBeUndefined();

    const constructorPolluted = setByPath(obj, 'constructor.prototype.polluted', true);
    expect((constructorPolluted as any).constructor?.prototype?.polluted).toBeUndefined();
  });
});
