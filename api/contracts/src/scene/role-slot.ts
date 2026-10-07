// api/contracts/src/scene/role-slot.ts
// SC-302: role slots as a scene attribute.
//
// A slot only NAMES a cast (a character slug) or is open (`null`) for overlay/runtime
// assignment. It never carries personality or relationship data (proposal.md §2.5), so
// deleting a scene cannot corrupt a character — enforced by the strict key set.

/**
 * VN portrait positions. Redeclared here because contracts may not import `shared`;
 * the values must equal `DialogueNodeVisualSchema.position` in
 * shared/src/schemas/dialogue.ts — guarded by server/tests/unit/slotPositionParity.test.ts.
 */
export const SLOT_POSITIONS = ['left', 'center', 'right'] as const;
export type SlotPosition = (typeof SLOT_POSITIONS)[number];

export function isSlotPosition(value: unknown): value is SlotPosition {
  return typeof value === 'string' && (SLOT_POSITIONS as readonly string[]).includes(value);
}

export interface RoleSlot {
  /** Unique within a scene. Identifier-valid slug. */
  slot_id: string;
  /** Character slug, or `null` = open for overlay/runtime assignment. */
  cast: string | null;
  position: SlotPosition;
}

/** Every key of the serialized form, sorted (the only keys a slot may carry). */
export const ROLE_SLOT_JSON_KEYS = ['cast', 'position', 'slot_id'] as const;

/** `slot_id`s that appear more than once, each once, sorted. */
export function findDuplicateSlotIds(slots: ReadonlyArray<RoleSlot>): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { slot_id } of slots) {
    if (seen.has(slot_id)) dupes.add(slot_id);
    seen.add(slot_id);
  }
  return [...dupes].sort();
}

export function roleSlotToJSON(slot: RoleSlot): Record<string, unknown> {
  return { cast: slot.cast ?? null, position: slot.position, slot_id: slot.slot_id };
}
