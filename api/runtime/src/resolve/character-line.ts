// api/runtime/src/resolve/character-line.ts
// SC-M3 T2: serve the specificity ladder (scene > relationship > personality) from the artifacts
// of ONE revision. Same candidate gathering as planning's `resolveCharacterLine`, but the
// personality rung comes from compiled `character_pools` + `personality_pool` artifacts instead of
// planning canon, and the ladder itself is the shared contracts `resolveLine`.
//
// A character with no `character_pools` artifact has no personality lines (absence = no pools). A
// link naming a pool the revision does not contain is an inconsistent revision and throws
// (`artifact_not_in_revision`); it is never skipped silently (R10).

import {
  poolLineCandidates,
  resolveLine,
  slotLineCandidates,
  type ComposedScene,
  type LineCandidate,
  type LineContext,
  type RevisionId,
} from '@las-flores/api-contracts';
import type { RevisionScopedLookup } from './lookup.js';

export interface ResolveCharacterLineAtInput {
  characterSlug: string;
  ctx: LineContext;
  /** The composed scene the character speaks in, with the slot they occupy. Both or neither. */
  scene?: Pick<ComposedScene, 'slot_lines'>;
  slotId?: string;
  /** Caller-supplied relationship-rung lines; their `rung` is forced to `relationship`. */
  relationship?: ReadonlyArray<Omit<LineCandidate, 'rung'>>;
}

/** The line this character says now, from `revisionId`'s artifacts; undefined when nothing applies. */
export async function resolveCharacterLineAt(
  lookup: RevisionScopedLookup,
  revisionId: RevisionId,
  input: ResolveCharacterLineAtInput,
): Promise<LineCandidate | undefined> {
  if ((input.scene === undefined) !== (input.slotId === undefined)) {
    throw new Error('scene and slotId must be given together');
  }
  const link = await lookup.getCharacterPools(revisionId, input.characterSlug);
  const pools = await Promise.all((link?.pools ?? []).map((slug) => lookup.getPool(revisionId, slug)));
  const candidates: LineCandidate[] = [
    ...(input.scene !== undefined && input.slotId !== undefined ? slotLineCandidates(input.scene, input.slotId) : []),
    ...(input.relationship ?? []).map((r) => ({ ...r, rung: 'relationship' as const })),
    ...poolLineCandidates(pools),
  ];
  return resolveLine(input.ctx, candidates);
}
