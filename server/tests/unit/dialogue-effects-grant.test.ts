import { describe, it, expect } from '@jest/globals';
import { EffectsSchema } from '@las-flores/shared';

describe('EffectsSchema - M15 grant effects', () => {
  it('accepts grant_credits with valid fields', () => {
    const result = EffectsSchema.safeParse({
      grant_credits: { amount: 100, currency: 'credits' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts grant_credits with gold_credits currency', () => {
    const result = EffectsSchema.safeParse({
      grant_credits: { amount: 50, currency: 'gold_credits' },
    });
    expect(result.success).toBe(true);
  });

  it('defaults currency to credits when not specified', () => {
    const result = EffectsSchema.safeParse({
      grant_credits: { amount: 100 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grant_credits?.currency).toBe('credits');
    }
  });

  it('rejects grant_credits with amount below 1', () => {
    const result = EffectsSchema.safeParse({
      grant_credits: { amount: 0, currency: 'credits' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects grant_credits with amount above 100000', () => {
    const result = EffectsSchema.safeParse({
      grant_credits: { amount: 100001, currency: 'credits' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects grant_credits with invalid currency', () => {
    const result = EffectsSchema.safeParse({
      grant_credits: { amount: 100, currency: 'bitcoin' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts grant_item with valid UUID', () => {
    const result = EffectsSchema.safeParse({
      grant_item: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects grant_item with invalid UUID', () => {
    const result = EffectsSchema.safeParse({
      grant_item: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts both grant_credits and grant_item together', () => {
    const result = EffectsSchema.safeParse({
      grant_credits: { amount: 100, currency: 'credits' },
      grant_item: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts grant effects alongside existing effects', () => {
    const result = EffectsSchema.safeParse({
      flag_set: { mission_started: true },
      story_beat: 'chapter_2',
      grant_credits: { amount: 50, currency: 'credits' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown properties (strict mode preserved)', () => {
    const result = EffectsSchema.safeParse({
      unknown_field: 'value',
    });
    expect(result.success).toBe(false);
  });
});
