// The wizard has 3 internal steps, shown as 2 indicator dots (Describe, Results):
//   1 = Describe     (free-text intake)
//   2 = Review       (edit / refine / choose drafts; "Approve & Ship" lives here)
//   3 = Results      (verification report + live-content links)
export type Step = 1 | 2 | 3;

export interface GenerationStatus {
  planId: string;
  status: string;
  progress?: { total: number; completed: number; failed: number };
  items?: Array<{ itemId: string; status: string; error?: string }>;
  startedAt?: string;
  updatedAt?: string;
}

