import { describe, test, expect } from '@jest/globals';
import { preserveImportantTags } from '@las-flores/shared';

// ============================================================
// preserveImportantTags Unit Tests
//
// The <important> tag is the safety net that keeps puzzle clue
// text — the only clickable, server-validated hint a player gets —
// unaltered across the LLM rewrite. These tests pin down the
// three behaviors specified in the BYOK design doc.
// ============================================================

describe('preserveImportantTags', () => {
  test('returns rewritten text untouched when original has no tags', () => {
    const original = 'Hello there, friend.';
    const rewritten = 'Hey buddy!';
    expect(preserveImportantTags(original, rewritten)).toBe('Hey buddy!');
  });

  test('keeps rewritten text when original has tags and rewrite preserved them', () => {
    const original = 'Meet me at the <important>Clocktower</important> at midnight.';
    const rewritten = 'Come hang at the <important>Clocktower</important> tonight, alright?';
    const out = preserveImportantTags(original, rewritten);
    expect(out).toContain('<important>Clocktower</important>');
    expect(out).toContain('Come hang');
  });

  test('overwrites a paraphrased tag with the original tag verbatim', () => {
    // LLM preserved the tag wrapper but changed the clue text inside.
    const original = 'The code is <important>7421</important>.';
    const rewritten = 'The digits are <important>seven-four-two-one</important>.';
    const out = preserveImportantTags(original, rewritten);
    expect(out).toBe('The digits are <important>7421</important>.');
  });

  test('REJECTS the rewrite when the LLM drops <important> tags (desync protection)', () => {
    // §4.1 of the BYOK spec: if the original has tags but the rewrite
    // has none, the function must return the ORIGINAL string. Losing
    // a clue is worse than showing the un-rewritten fallback.
    const original = 'The key is hidden at the <important>Old Pier</important>.';
    const rewritten = 'You should check the docks, the old wooden one down the coast.';
    expect(preserveImportantTags(original, rewritten)).toBe(original);
  });

  test('handles multiple tags in order', () => {
    const original = 'I have <important>a</important> and <important>b</important>.';
    const rewritten = 'I hold <important>X</important> and <important>Y</important> here.';
    const out = preserveImportantTags(original, rewritten);
    expect(out).toBe('I hold <important>a</important> and <important>b</important> here.');
  });

  test('handles tags across line breaks with the /s flag', () => {
    const original = 'Line one\n<important>SECRET\nCODE</important>\nLine three';
    const rewritten = 'Line one\n<important>WRONG</important>\nLine three';
    const out = preserveImportantTags(original, rewritten);
    expect(out).toContain('<important>SECRET\nCODE</important>');
    expect(out).not.toContain('WRONG');
  });

  test('preserves tag content even when no surrounding text changed', () => {
    const original = '<important>REDACTED</important>';
    const rewritten = 'something completely different';
    expect(preserveImportantTags(original, rewritten)).toBe(original);
  });

  test('does not crash on empty strings', () => {
    expect(preserveImportantTags('', '')).toBe('');
    expect(preserveImportantTags('plain', '')).toBe('');
    expect(preserveImportantTags('', 'rewritten')).toBe('rewritten');
  });
});
