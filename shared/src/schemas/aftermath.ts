import { z } from 'zod';

// ============================================================
// Aftermath (The Recycle Phase)
// ============================================================
// Authored as part of the mystery YAML and stored on the
// `mysteries.aftermath_payload` column. Executed atomically by
// LeaderboardWorker.finalizeMystery() when the 24h Breakthrough
// window closes — demotes clue items to mementos and scrubs
// temporary characters from live scenes.
//
// NOTE: `retire_overlays` is intentionally absent. ARCHIVED
// mystery status already drops overlays out of the live resolver
// (DialogueResolver.getActiveMysteries keys on status='ACTIVE'),
// so an `is_active` flag would duplicate the source of truth.
// ============================================================

export const AftermathSchema = z.object({
  // 1. Convert active clues into historical mementos.
  //    Worker guards with `WHERE item_type = 'clue'` so premium_cg
  //    items that share the mystery are never clobbered.
  retire_vault_items: z.array(z.string().uuid()).optional(),

  // 2. Scrub temporary characters from live scenes.
  remove_scene_characters: z
    .array(
      z.object({
        scene_id: z.string().uuid(),
        character_id: z.string().uuid(),
      })
    )
    .optional(),
});

export type Aftermath = z.infer<typeof AftermathSchema>;
