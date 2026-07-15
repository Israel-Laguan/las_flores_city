import { describe, it, expect } from '@jest/globals';
import { isStoryBeatAllowed } from '../../src/routes/dialogue-helpers.js';

// ============================================================
// isStoryBeatAllowed — pure-function tests
//
// Mirrors the runtime gate used by resolveDialogueTree() and the
// DialogueResolver cache key. Also matches the scene-gate logic
// in server/src/routes/location.ts:265-271 — if the scene logic
// changes, this should be kept in sync (or extracted to a shared
// helper).
//
// No mocks: isStoryBeatAllowed is a pure function — no DB, no
// network, no filesystem.
// ============================================================

describe('isStoryBeatAllowed', () => {
  describe('backwards-compatible default', () => {
    it('returns true when required is undefined', () => {
      expect(isStoryBeatAllowed(undefined, 'prologue')).toBe(true);
      expect(isStoryBeatAllowed(undefined, 'act3_finale_unlocked')).toBe(true);
    });

    it('returns true when required is null', () => {
      expect(isStoryBeatAllowed(null, 'prologue')).toBe(true);
      expect(isStoryBeatAllowed(null, 'act3_finale_unlocked')).toBe(true);
    });
  });

  describe('string requirement (single beat)', () => {
    it('returns true when player story_beat equals the required string', () => {
      expect(isStoryBeatAllowed('act1_awakening', 'act1_awakening')).toBe(true);
    });

    it('returns false when player story_beat differs from the required string', () => {
      expect(isStoryBeatAllowed('act1_awakening', 'prologue')).toBe(false);
      expect(isStoryBeatAllowed('finale_complete', 'act1_awakening')).toBe(false);
    });

    it('treats empty-string required as a real (and unsatisfiable) gate', () => {
      // Authors should never use '' as a gate, but the helper must
      // not silently treat it like undefined.
      expect(isStoryBeatAllowed('', 'prologue')).toBe(false);
    });
  });

  describe('array requirement (allow-list of beats)', () => {
    it('returns true when player story_beat is in the array', () => {
      expect(isStoryBeatAllowed(['act1_awakening', 'act1_first_contact'], 'act1_awakening')).toBe(true);
      expect(isStoryBeatAllowed(['act1_awakening', 'act1_first_contact'], 'act1_first_contact')).toBe(true);
    });

    it('returns false when player story_beat is not in the array', () => {
      expect(isStoryBeatAllowed(['act1_awakening', 'act1_first_contact'], 'prologue')).toBe(false);
      expect(isStoryBeatAllowed(['act1_awakening'], 'act3_finale_unlocked')).toBe(false);
    });

    it('treats an empty array as a gate that nothing satisfies', () => {
      expect(isStoryBeatAllowed([], 'prologue')).toBe(false);
      expect(isStoryBeatAllowed([], 'act1_awakening')).toBe(false);
    });
  });

  describe('defensive failure modes', () => {
    it('fails closed for non-string, non-array types', () => {
      // number, boolean, object — anything that is not the documented
      // string / string[] / undefined / null should NOT let the
      // player through. (A future schema change can tighten this.)
      expect(isStoryBeatAllowed(42 as unknown, 'prologue')).toBe(false);
      expect(isStoryBeatAllowed(true as unknown, 'prologue')).toBe(false);
      expect(isStoryBeatAllowed({ slug: 'act1_awakening' } as unknown, 'act1_awakening')).toBe(false);
    });
  });
});
