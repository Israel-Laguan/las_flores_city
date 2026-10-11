// api/runtime/src/resolve/scene.ts
// SC-312: runtime consumer of a compiled scene artifact (SC-S13 / SC-402 shape).
// Reads the player's flags (read-only) and selects + applies the active layers with the
// shared contracts engine — runtime never sorts layers or re-checks conflicts.

import { resolveSceneForPlayer, type PlayerScene, type ResolvedScene } from '@las-flores/api-contracts';
import type { FlagStateRepository } from '../flags.js';

/**
 * Resolves the player-visible scene from a compiled artifact.
 *
 * Reads the player's true flags via the repository and delegates
 * to the shared contracts `resolveSceneForPlayer`. Runtime never
 * sorts layers or re-checks conflicts.
 *
 * @param artifact - Compiled scene artifact (ResolvedScene)
 * @param playerId - Player identifier
 * @param flags - Repository providing the player's flag state
 * @returns PlayerScene with composed scene, active layers, and issues
 */
export async function resolvePlayerScene(
  artifact: ResolvedScene,
  playerId: string,
  flags: Pick<FlagStateRepository, 'getTrueFlags'>,
): Promise<PlayerScene> {
  return resolveSceneForPlayer(artifact, await flags.getTrueFlags(playerId));
}
