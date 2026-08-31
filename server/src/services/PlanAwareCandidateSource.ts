// ============================================================
// PlanAwareCandidateSource — M50 Part 2 candidate source
//
// Supplies `EntityResolutionService` with canonical candidates (via an
// inner `CandidateSource`, default `Neo4jCandidateSource`) PLUS the plan's
// own pending `:ContentDelta` nodes. This lets the resolver match a natural-
// language reference in a free-form instruction to a plan-local delta, so a
// remake can be classified as `resolved` against that delta's nodeId (and the
// proposal path can reuse it to MERGE in place).
// ============================================================

import { getDeltasForPlan } from './GraphDeltaService.js';
import { Neo4jCandidateSource } from './Neo4jCandidateSource.js';
import type { CanonicalCandidate, CandidateSource } from './EntityResolutionService.js';

export class PlanAwareCandidateSource implements CandidateSource {
  private readonly inner: CandidateSource;
  private readonly planId: string;

  constructor(planId: string, inner: CandidateSource = new Neo4jCandidateSource()) {
    this.planId = planId;
    this.inner = inner;
  }

  async listCandidates(): Promise<CanonicalCandidate[]> {
    const [canonical, deltas] = await Promise.all([
      this.inner.listCandidates(),
      getDeltasForPlan(this.planId),
    ]);

    // De-dupe by (nodeType, nodeId): a plan-local delta that also exists as a
    // canonical node is the same entity — keep the canonical entry (it carries
    // neighbors/aliases). Plan-local-only deltas are appended.
    const seen = new Set(canonical.map((c) => `${c.nodeType}:${c.nodeId.toLowerCase()}`));
    for (const d of deltas) {
      const key = `${d.nodeType}:${d.nodeId.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = (d.fields as Record<string, unknown> | undefined)?.name;
      canonical.push({
        nodeType: d.nodeType,
        nodeId: d.nodeId,
        name: typeof name === 'string' && name.length > 0 ? name : d.nodeId,
      });
    }
    return canonical;
  }
}
