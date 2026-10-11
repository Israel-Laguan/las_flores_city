// api/planning/src/dialogue/resolve-character-line.ts
// SC-308: gather candidates from every rung for one character and run the ladder
// (`resolveLine`, in contracts). Planning-level only: runtime serving of the same ladder from
// compiled artifacts is SC-M3's first task.
//
// - scene rung:        the lines on the role slot the character is cast in (scene given)
// - relationship rung: lines the CALLER supplies. There is no relationship content model in the
//                      new backend yet (the legacy `*_relationship` dialogues are whole dialogue
//                      trees, not lines), so this rung is an input, not a lookup.
// - personality rung:  every line of every ACTIVE pool the character is linked to

import {
  poolLineCandidates,
  resolveLine,
  slotLineCandidates,
  type ComposedScene,
  type LineCandidate,
  type LineContext,
} from '@las-flores/api-contracts';
import type { CharacterPoolRepository } from '../canon/personality-pool-repository.js';

export interface ResolveCharacterLineInput {
  characterSlug: string;
  ctx: LineContext;
  /** The composed scene the character is speaking in, with the slot they occupy. Both or neither. */
  scene?: Pick<ComposedScene, 'slot_lines'>;
  slotId?: string;
  /** Caller-supplied relationship-rung lines; their `rung` is forced to `relationship`. */
  relationship?: ReadonlyArray<Omit<LineCandidate, 'rung'>>;
}

/** The line this character says now, or undefined when nothing applies. */
export async function resolveCharacterLine(
  links: CharacterPoolRepository,
  input: ResolveCharacterLineInput,
): Promise<LineCandidate | undefined> {
  if ((input.scene === undefined) !== (input.slotId === undefined)) {
    throw new Error('scene and slotId must be given together');
  }
  const pools = (await links.poolsFor(input.characterSlug)).map((r) => r.pool);
  const candidates: LineCandidate[] = [
    ...(input.scene !== undefined && input.slotId !== undefined ? slotLineCandidates(input.scene, input.slotId) : []),
    ...(input.relationship ?? []).map((r) => ({ ...r, rung: 'relationship' as const })),
    ...poolLineCandidates(pools),
  ];
  return resolveLine(input.ctx, candidates);
}

/**
 * The line spoken from a role slot: resolves for whoever is CAST in the slot right now. An open
 * slot (`cast: null`) has no speaker, so it yields undefined.
 */
export async function resolveSlotLine(
  links: CharacterPoolRepository,
  scene: Pick<ComposedScene, 'slot_lines' | 'role_slots'>,
  slotId: string,
  ctx: LineContext,
  relationship?: ResolveCharacterLineInput['relationship'],
): Promise<{ characterSlug: string; line: LineCandidate } | undefined> {
  const slot = scene.role_slots.find((s) => s.slot_id === slotId);
  if (slot === undefined || slot.cast === null) return undefined;
  const line = await resolveCharacterLine(links, { characterSlug: slot.cast, ctx, scene, slotId, relationship });
  return line === undefined ? undefined : { characterSlug: slot.cast, line };
}
