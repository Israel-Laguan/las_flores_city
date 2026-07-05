import { describe, it, expect } from '@jest/globals';
import { findLeafByChoiceId } from '../../src/routes/dialogue-choose.js';

describe('findLeafByChoiceId', () => {
  const leafA = { type: 'FREE', target_chunk: 'chunk_a' };
  const leafB = { type: 'GUARDED', target_chunk: 'chunk_b' };

  it('returns undefined when leaves is empty', () => {
    expect(findLeafByChoiceId({}, 'any_choice')).toBeUndefined();
  });

  it('returns undefined when no leaf key ends with :choiceId', () => {
    const leaves: Record<string, any> = {
      'node1:c_alpha': leafA,
      'node2:c_beta': leafB,
    };
    expect(findLeafByChoiceId(leaves, 'c_gamma')).toBeUndefined();
  });

  it('matches a leaf whose key ends with :choiceId', () => {
    const leaves: Record<string, any> = {
      'node1:c_alpha': leafA,
      'node2:c_beta': leafB,
    };
    expect(findLeafByChoiceId(leaves, 'c_beta')).toBe(leafB);
  });

  it('returns the first match when multiple leaves share the same choiceId suffix', () => {
    const leaves: Record<string, any> = {
      'node1:c_dup': leafA,
      'node2:c_dup': leafB,
    };
    // Object.entries order is insertion order
    expect(findLeafByChoiceId(leaves, 'c_dup')).toBe(leafA);
  });

  it('does not false-positive on partial suffix matches', () => {
    const leaves: Record<string, any> = {
      'node1:c_alpha_extra': leafA,
    };
    // 'c_alpha' suffix check: key 'node1:c_alpha_extra' does NOT end with ':c_alpha'
    expect(findLeafByChoiceId(leaves, 'c_alpha')).toBeUndefined();
  });

  it('direct key lookup does not interfere (function only checks suffix)', () => {
    // findLeafByChoiceId only does suffix matching; the caller handles direct lookup
    const leaves: Record<string, any> = {
      c_choice: leafA,
    };
    // Key 'c_choice' ends with ':c_choice'? No — it IS 'c_choice', no colon prefix
    expect(findLeafByChoiceId(leaves, 'c_choice')).toBeUndefined();
  });
});
