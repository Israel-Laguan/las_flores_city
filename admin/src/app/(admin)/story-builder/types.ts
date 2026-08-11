// The wizard has 3 internal steps, shown as 2 indicator dots (Describe, Results):
//   1 = Describe     (free-text intake)
//   2 = Review       (edit / refine / choose drafts; "Approve & Ship" lives here)
//   3 = Results      (verification report + live-content links)
export type Step = 1 | 2 | 3;

export type GenerationPlanStatus = 'idle' | 'generating' | 'filling' | 'pending' | 'done' | 'failed' | 'proposed';
export type GenerationItemStatus = 'pending' | 'filling' | 'done' | 'failed';

export interface GenerationStatus {
  planId?: string;
  status: GenerationPlanStatus;
  progress?: { total: number; completed: number; failed: number };
  items?: Array<{ itemId: string; status: GenerationItemStatus; error?: string }>;
  startedAt?: string;
  updatedAt?: string;
}

export type { IntakeConflictPreview } from '@las-flores/shared';

/**
 * Phase-1 intake preview state. `conflicts` are the LLM conflict scan (Moment 1);
 * `fileConflicts` are the advisory filesystem collision check. Both are advisory
 * until the author explicitly commits via "Generate Full Plan" (POST /plan/scaffold).
 */
export interface IntakePreview {
  conflicts: import('@las-flores/shared').IntakeConflictPreview[];
  fileConflicts: string[];
}

