// api/runtime/src/resolve/scene.ts
// SC-312: runtime consumer of a compiled scene artifact (SC-S13 / SC-402 shape).
// Reads the player's flags (read-only) and selects + applies the active layers with the
// shared contracts engine — runtime never sorts layers or re-checks conflicts.

import { resolveSceneForPlayer, type PlayerScene, type ResolvedScene } from '@las-flores/api-contracts';
import type { FlagStateRepository } from '../flags.js';

export async function resolvePlayerScene(
  artifact: ResolvedScene,
  playerId: string,
  flags: FlagStateRepository,
): Promise<PlayerScene> {
  return resolveSceneForPlayer(artifact, await flags.getTrueFlags(playerId));
}
