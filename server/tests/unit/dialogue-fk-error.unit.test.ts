import { describe, it, expect } from '@jest/globals';
import {
  mapDialogueWriteError,
  DIALOGUE_TREE_FK_CONSTRAINTS,
} from '../../src/routes/dialogue-errors.js';

// ============================================================
// Dialogue write-path FK error mapping
//
// dialogue-start / dialogue-choose / archive all write
// `player_states.active_dialogue_id` (and seed
// `player_dialogue_states.dialogue_tree_id`). When the referenced
// dialogue tree no longer exists in `dialogue_trees`, Postgres
// raises SQLSTATE 23503 naming the constraint. This must map to a
// clean, typed 404 instead of leaking an opaque 500.
// ============================================================

describe('mapDialogueWriteError', () => {
  it.each([...DIALOGUE_TREE_FK_CONSTRAINTS])(
    'maps a %s foreign-key violation to a clean 404 dialogue_not_found',
    (constraint) => {
      const error = { code: '23503', constraint, detail: 'Key (active_dialogue_id)=(...) is not present in table "dialogue_trees".' };
      expect(mapDialogueWriteError(error)).toEqual({ status: 404, code: 'dialogue_not_found' });
    }
  );

  it('returns null for non-FK errors', () => {
    expect(mapDialogueWriteError(new Error('boom'))).toBeNull();
    expect(mapDialogueWriteError({ code: '23514', constraint: 'player_states_time_blocks_check' })).toBeNull();
    expect(mapDialogueWriteError(null)).toBeNull();
    expect(mapDialogueWriteError(undefined)).toBeNull();
    expect(mapDialogueWriteError('23503')).toBeNull();
  });

  it('returns null for an FK violation on an unrelated constraint', () => {
    const error = { code: '23503', constraint: 'player_states_user_id_fkey' };
    expect(mapDialogueWriteError(error)).toBeNull();
  });

  it('returns null when the FK lacks a constraint name and detail', () => {
    expect(mapDialogueWriteError({ code: '23503' })).toBeNull();
  });

  it('maps a 23503 with no constraint name when detail references dialogue_trees', () => {
    const error = {
      code: '23503',
      detail: 'Key (active_dialogue_id)=(...) is not present in table "dialogue_trees".',
    };
    expect(mapDialogueWriteError(error)).toEqual({ status: 404, code: 'dialogue_not_found' });
  });

  it('returns null for a 23503 with no constraint name and unrelated detail', () => {
    expect(
      mapDialogueWriteError({ code: '23503', detail: 'Key (...) is not present in table "other_table".' })
    ).toBeNull();
  });
});
