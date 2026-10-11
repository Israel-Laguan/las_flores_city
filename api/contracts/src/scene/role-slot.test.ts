// api/contracts/src/scene/role-slot.test.ts
// SC-302: role slots — uniqueness, nullable cast, closed position enum, name-only invariant.

import { TRUE } from '../condition/expression.js';
import {
  SLOT_POSITIONS,
  findDuplicateSlotIds,
  isSlotPosition,
  type RoleSlot,
} from './role-slot.js';
import { InvalidSceneDefError, sceneDefFromJSON, sceneDefToJSON, type SceneDef } from './scene-def.js';

function makeScene(role_slots: RoleSlot[]): SceneDef {
  return {
    id: 'c3000000-0000-4000-8000-000000000002',
    slug: 'vq_airport_gate',
    title: 'Airport gate',
    description: '',
    location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    time: null,
    weather: null,
    items: [],
    dialogue_refs: [],
    role_slots,
    slot_lines: [],
    availability: TRUE,
    priority: 0,
  };
}

const wire = (slots: unknown): Record<string, unknown> => ({
  ...sceneDefToJSON(makeScene([])),
  role_slots: slots,
});

describe('role slots (SC-302)', () => {
  test('SLOT_POSITIONS is the VN position enum', () => {
    expect([...SLOT_POSITIONS]).toEqual(['left', 'center', 'right']);
  });

  test('isSlotPosition accepts members and rejects the rest', () => {
    expect(isSlotPosition('left')).toBe(true);
    expect(isSlotPosition('top')).toBe(false);
    expect(isSlotPosition(null)).toBe(false);
  });

  describe('findDuplicateSlotIds', () => {
    test('returns [] when unique', () => {
      expect(
        findDuplicateSlotIds([
          { slot_id: 'a', cast: null, position: 'left' },
          { slot_id: 'b', cast: null, position: 'right' },
        ]),
      ).toEqual([]);
    });

    test('reports each duplicated id once, sorted', () => {
      const slot = (slot_id: string): RoleSlot => ({ slot_id, cast: null, position: 'center' });
      expect(findDuplicateSlotIds([slot('b'), slot('a'), slot('b'), slot('a'), slot('b')])).toEqual(['a', 'b']);
    });
  });

  describe('on SceneDef', () => {
    test('round-trips, null cast allowed', () => {
      const scene = makeScene([
        { slot_id: 'valentina', cast: 'valentina_quan', position: 'left' },
        { slot_id: 'bystander', cast: null, position: 'right' },
      ]);
      expect(sceneDefFromJSON(sceneDefToJSON(scene))).toEqual(scene);
    });

    test('slot key order does not change the wire form', () => {
      const w = sceneDefToJSON(makeScene([{ slot_id: 'a', cast: null, position: 'left' }])) as {
        role_slots: Record<string, unknown>[];
      };
      expect(Object.keys(w.role_slots[0])).toEqual(['cast', 'position', 'slot_id']);
    });

    test('rejects a duplicate slot_id', () => {
      expect(() =>
        sceneDefFromJSON(
          wire([
            { slot_id: 'a', cast: null, position: 'left' },
            { slot_id: 'a', cast: 'x', position: 'right' },
          ]),
        ),
      ).toThrow(/duplicate slot_id 'a'/);
    });

    test('rejects an unknown position', () => {
      expect(() => sceneDefFromJSON(wire([{ slot_id: 'a', cast: null, position: 'top' }]))).toThrow(
        /role_slots\[0\]\.position/,
      );
    });

    test('rejects an invalid slot_id and cast', () => {
      expect(() => sceneDefFromJSON(wire([{ slot_id: 'no good', cast: null, position: 'left' }]))).toThrow(
        /slot_id/,
      );
      expect(() => sceneDefFromJSON(wire([{ slot_id: 'a', cast: 'no good', position: 'left' }]))).toThrow(/cast/);
      expect(() => sceneDefFromJSON(wire([{ slot_id: 'a', cast: undefined, position: 'left' }]))).toThrow(/cast/);
    });

    test('a slot only names a cast: personality/relationship keys are rejected', () => {
      expect(() =>
        sceneDefFromJSON(wire([{ slot_id: 'a', cast: 'x', position: 'left', personality: 'cold' }])),
      ).toThrow(InvalidSceneDefError);
      expect(() =>
        sceneDefFromJSON(wire([{ slot_id: 'a', cast: 'x', position: 'left', relationship: { trust: 3 } }])),
      ).toThrow(/unknown field 'personality'|unknown field 'relationship'/);
    });

    test('role_slots must be an array', () => {
      expect(() => sceneDefFromJSON(wire({}))).toThrow(/role_slots/);
    });

    test('slot order is preserved', () => {
      const scene = makeScene([
        { slot_id: 'z', cast: null, position: 'left' },
        { slot_id: 'a', cast: null, position: 'left' },
      ]);
      expect(sceneDefFromJSON(sceneDefToJSON(scene)).role_slots.map((s) => s.slot_id)).toEqual(['z', 'a']);
    });
  });
});
