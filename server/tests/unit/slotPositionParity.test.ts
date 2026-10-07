/**
 * SC-302 parity guard: `@las-flores/api-contracts` redeclares the VN portrait
 * position enum (contracts is a leaf and may not import `shared`). This fails if the
 * two ever diverge.
 */
import { describe, test, expect } from '@jest/globals';
import { SLOT_POSITIONS } from '@las-flores/api-contracts';
import { DialogueNodeVisualSchema } from '@las-flores/shared';

describe('RoleSlot position parity (SC-302)', () => {
  test('contracts SLOT_POSITIONS equals the shared dialogue visual position enum', () => {
    const shared = DialogueNodeVisualSchema.shape.position.unwrap().options;
    expect([...SLOT_POSITIONS]).toEqual([...shared]);
  });
});
