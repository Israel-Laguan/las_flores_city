// ============================================================
// This module mirrors types defined in the shared schema package
// (`DialogueNodeVisualSchema` in shared/src/schemas/dialogue.ts)
// and in the server route (server/src/routes/dialogue-speakers.ts:
// `DialogueSpeakerInfo` / `DialogueSpeakers`). The client has no
// dependency on the @las-flores/shared package, so these are
// intentionally mirrored copies that must be kept in sync with
// their sources — the client cannot import the shared schema
// package directly.
// ============================================================

export interface DialogueNode {
  id: string;
  type: string;
  text: string;
  thought?: string;
  speaker_id?: string;
  speaker?: {
    id: string;
    name: string;
    title: string;
    avatar_url: string | null;
  };
  choices?: Array<{
    id: string;
    text: string;
    next_node_id: string;
    time_block_cost?: { amount: number; description: string };
    relationship_change?: { stat: string; amount: number };
  }>;
  effects?: any;
  is_end?: boolean;
  // Visual Novel staging metadata (DialogueNodeVisualSchema from shared).
  visual?: DialogueNodeVisual;
}

export interface DialogueNodeVisual {
  expression?: string;
  background?: string;
  mood?: 'rain' | 'tense' | 'night' | 'soft_bloom' | 'alert' | 'none';
  position?: 'left' | 'center' | 'right';
  transition?: 'fade' | 'slide' | 'flash' | 'none';
  cinematic?: boolean;
}

export interface DialogueSpeakerInfo {
  name: string;
  title?: string | null;
  avatar_url?: string | null;
  portrait_urls?: Array<{ url: string; label?: string; expression?: string }> | null;
}

export type DialogueSpeakers = Record<string, DialogueSpeakerInfo>;
