// ============================================================
// Neo4jCandidateSource — M50 production `CandidateSource`
//
// Supplies `EntityResolutionService` with the canonical `:Content` base graph
// plus curated `(:Alias)-[:ALIAS_OF]` nodes as matchable names. No-op empty list
// when Neo4j is disabled (resolution then reports `unresolved`, which is the safe
// default for an authoring graph that is not available).
// ============================================================

import { isNeo4jEnabled, runNeo4jQuery } from './Neo4jClient.js';
import type { CanonicalCandidate, CandidateSource } from './EntityResolutionService.js';

interface ContentRow {
  nodeType: string;
  nodeId: string;
  name: unknown;
  slug: unknown;
}

interface AliasRow {
  nodeType: string;
  nodeId: string;
  alias: unknown;
}

export class Neo4jCandidateSource implements CandidateSource {
  async listCandidates(): Promise<CanonicalCandidate[]> {
    if (!isNeo4jEnabled()) return [];

    const content = await runNeo4jQuery<ContentRow>(
      `MATCH (c:Content) WHERE c.planId IS null
       RETURN c.nodeType AS nodeType, c.nodeId AS nodeId, c.name AS name, c.slug AS slug`,
    );
    const aliases = await runNeo4jQuery<AliasRow>(
      `MATCH (a:Alias)-[:ALIAS_OF]->(c:Content)
       RETURN c.nodeType AS nodeType, c.nodeId AS nodeId, a.name AS alias`,
    );
    const edges = await runNeo4jQuery<{ st: string; sn: string; tt: string; tn: string }>(
      `MATCH (a:Content)-[:IN_DISTRICT|SET_IN|OWNED_BY|SERVES|OVERLAYS|HAS_CHARACTER|APPEARS_IN]->(b:Content)
       WHERE a.planId IS null AND b.planId IS null
       RETURN a.nodeType AS st, a.nodeId AS sn, b.nodeType AS tt, b.nodeId AS tn`,
    );

    const aliasByKey = new Map<string, string[]>();
    for (const row of aliases) {
      if (typeof row.alias !== 'string' || !row.alias) continue;
      const key = `${row.nodeType}:${String(row.nodeId).toLowerCase()}`;
      const list = aliasByKey.get(key) ?? [];
      list.push(row.alias);
      aliasByKey.set(key, list);
    }

    const neighborByKey = new Map<string, Array<{ nodeType: string; nodeId: string }>>();
    for (const e of edges) {
      const key = `${e.st}:${e.sn.toLowerCase()}`;
      const list = neighborByKey.get(key) ?? [];
      list.push({ nodeType: e.tt, nodeId: e.tn });
      neighborByKey.set(key, list);
    }

    return content.map((c) => {
      const key = `${c.nodeType}:${String(c.nodeId).toLowerCase()}`;
      return {
        nodeType: c.nodeType,
        nodeId: String(c.nodeId),
        name: typeof c.name === 'string' ? c.name : String(c.nodeId),
        slug: typeof c.slug === 'string' ? c.slug : undefined,
        aliasNames: aliasByKey.get(key) ?? [],
        neighbors: neighborByKey.get(key) ?? [],
      };
    });
  }
}
