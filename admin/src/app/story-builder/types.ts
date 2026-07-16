// The wizard is collapsed from 5 steps to 4:
//   1 = Describe     (free-text intake)
//   2 = Review       (edit / refine / choose drafts; "Approve & Ship" lives here)
//   3 = Approving    (transient: the single approve-and-solidify call runs)
//   4 = Results      (verification report + live-content links)
export type Step = 1 | 2 | 3 | 4;

