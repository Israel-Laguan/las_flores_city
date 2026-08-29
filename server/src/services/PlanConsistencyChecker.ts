// ============================================================
// PlanConsistencyChecker — M50 semantic consistency validation
//
// Runs at approve time (after the drift check, before the status flips to
// approved). It reports semantic conflicts WITHOUT failing the plan: the graph
// advises, the admin decides. The earlier structural "Unmapped edge type" failure
// still blocks; this layer only *warns*.
//
// Rules:
//   - location_district_mismatch : a scene's referenced location lives in a
//     different district than the scene's `district` field.
//   - prose_district_contradiction : a delta's prose still names a district other
//     than the one set in its `district` field.
//   - orphan_relationship : a delta edge targets a canonical node absent from the
//     canonical graph.
//
// The checker talks to the canonical graph through an injected `CanonicalGraphView`
// so it is fully unit-testable without a live Neo4j. `Neo4jGraphView` is the
// production binding.
// ============================================================

import type { GraphDelta, GraphDeltaEdge, ConsistencyReport, ConsistencyFinding } from '@las-flores/shared';

/** Read-only view of the canonical graph the checker needs. */
export interface CanonicalGraphView {
  getNode(nodeType: string, nodeId: string): Promise<{ nodeType: string; nodeId: string; name: string; fields: Record<string, unknown> } | null>;
  resolveByName(nodeType: string, name: string): Promise<{ nodeType: string; nodeId: string; name: string } | null>;
  hasNode(nodeType: string, nodeId: string): Promise<boolean>;
  listDistrictNames(): Promise<Array<{ name: string; aliases: string[] }>>;
}

function deltaKey(d: GraphDelta): string {
  return `${d.nodeType}:${d.nodeId.toLowerCase()}`;
}

export class PlanConsistencyChecker {
  constructor(private readonly view: CanonicalGraphView) {}

  /**
   * Check a plan's deltas + edges for semantic conflicts. `deltas`/`edges` are
   * the plan's `:ContentDelta` set; the `view` supplies canonical-graph lookups.
   * Always returns a report (never throws for a "conflict" — only on a genuine
   * view error, which callers may catch and ignore).
   */
  async check(planId: string, deltas: GraphDelta[], edges: GraphDeltaEdge[]): Promise<ConsistencyReport> {
    const findings: ConsistencyFinding[] = [];

    const deltaByKey = new Map<string, GraphDelta>();
    for (const d of deltas) deltaByKey.set(deltaKey(d), d);

    // ---- Rule A: location-district mismatch ----
    for (const scene of deltas.filter((d) => d.nodeType === 'Scene')) {
      const sceneDistrictRaw = (scene.fields as Record<string, unknown> | undefined)?.district;
      if (typeof sceneDistrictRaw !== 'string' || !sceneDistrictRaw) continue;
      const sceneDistrict = await this.view.resolveByName('District', sceneDistrictRaw);
      if (!sceneDistrict) continue;

      // Edges from this scene delta to a Location node.
      const locEdges = edges.filter(
        (e) =>
          e.sourceNodeType === 'Scene' &&
          e.sourceNodeId.toLowerCase() === scene.nodeId.toLowerCase() &&
          e.targetNodeType === 'Location',
      );
      for (const e of locEdges) {
        const locNode = await this.view.getNode('Location', e.targetNodeId);
        // Prefer a district this plan explicitly sets on the Location delta over
        // the canonical node's (possibly stale) value.
        const locationDelta = deltaByKey.get(`Location:${e.targetNodeId.toLowerCase()}`);
        const deltaFields = locationDelta?.fields as Record<string, unknown> | undefined;
        const locDistrictRaw = Object.prototype.hasOwnProperty.call(deltaFields ?? {}, 'district')
          ? deltaFields?.district
          : locNode?.fields?.district;
        if (typeof locDistrictRaw !== 'string' || !locDistrictRaw) continue;
        const locDistrict = await this.view.resolveByName('District', locDistrictRaw);
        if (!locDistrict) continue;
        if (locDistrict.nodeId !== sceneDistrict.nodeId) {
          findings.push({
            code: 'location_district_mismatch',
            severity: 'warning',
            message: `Scene "${scene.fields?.name ?? scene.nodeId}" references location in ${locDistrict.name} but its district field says ${sceneDistrict.name}.`,
            nodeType: 'Scene',
            nodeId: scene.nodeId,
            field: 'district',
            detail: {
              sceneDistrict: sceneDistrict.name,
              locationDistrict: locDistrict.name,
              locationNodeId: e.targetNodeId,
            },
          });
        }
      }
    }

    // ---- Rule B: prose-vs-field district contradiction ----
    const districts = await this.view.listDistrictNames();
    const districtAliasIndex = new Map<string, string[]>();
    for (const d of districts) districtAliasIndex.set(d.name.toLowerCase(), [d.name, ...d.aliases]);

    for (const delta of deltas) {
      const fields = (delta.fields as Record<string, unknown> | undefined) ?? {};
      const districtRaw = fields.district;
      const prose = typeof fields.description === 'string' ? fields.description : '';
      if (typeof districtRaw !== 'string' || !districtRaw || !prose) continue;
      const resolved = await this.view.resolveByName('District', districtRaw);
      if (!resolved) continue;
      // Tokenize the prose and look for any OTHER district's name/alias.
      const proseLower = prose.toLowerCase();
      for (const [districtName, names] of districtAliasIndex) {
        if (districtName === resolved.name.toLowerCase()) continue;
        const hit = names.some((n) => n && n.length > 2 && proseLower.includes(n.toLowerCase()));
        if (hit) {
          findings.push({
            code: 'prose_district_contradiction',
            severity: 'warning',
            message: `${delta.nodeType} "${delta.fields?.name ?? delta.nodeId}" description still names "${districtName}" after its district was set to ${resolved.name}.`,
            nodeType: delta.nodeType,
            nodeId: delta.nodeId,
            field: 'description',
            detail: { setDistrict: resolved.name, mentionedDistrict: districtName },
          });
          break;
        }
      }
    }

    // ---- Rule C: orphan relationship ----
    for (const e of edges) {
      const exists = await this.view.hasNode(e.targetNodeType, e.targetNodeId);
      if (!exists) {
        findings.push({
          code: 'orphan_relationship',
          severity: 'warning',
          message: `Edge ${e.type} targets ${e.targetNodeType}:${e.targetNodeId} which does not exist in the canonical graph.`,
          nodeType: e.sourceNodeType,
          nodeId: e.sourceNodeId,
          field: 'links',
          detail: { edgeType: e.type, targetNodeType: e.targetNodeType, targetNodeId: e.targetNodeId },
        });
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      hasConflicts: findings.length > 0,
      findings,
    };
  }
}

// ---- Production binding: canonical graph read via Neo4j ----

import { isNeo4jEnabled, runNeo4jQuery } from './Neo4jClient.js';

export class Neo4jGraphView implements CanonicalGraphView {
  async getNode(nodeType: string, nodeId: string): Promise<{ nodeType: string; nodeId: string; name: string; fields: Record<string, unknown> } | null> {
    if (!isNeo4jEnabled()) return null;
    const rows = await runNeo4jQuery<{ name: unknown; fieldsJson: unknown }>(
      `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId })
       WHERE c.planId IS null
       RETURN c.name AS name, c.fieldsJson AS fieldsJson`,
      { nodeType, nodeId: nodeId.toLowerCase() },
    );
    if (rows.length === 0) return null;
    const fields: Record<string, unknown> = {};
    const raw = rows[0].fieldsJson;
    if (typeof raw === 'string') {
      try { Object.assign(fields, JSON.parse(raw)); } catch { /* ignore */ }
    } else if (raw && typeof raw === 'object') {
      Object.assign(fields, raw as Record<string, unknown>);
    }
    return {
      nodeType,
      nodeId,
      name: typeof rows[0].name === 'string' ? rows[0].name : nodeId,
      fields,
    };
  }

  async resolveByName(nodeType: string, name: string): Promise<{ nodeType: string; nodeId: string; name: string } | null> {
    if (!isNeo4jEnabled()) return null;
    const rows = await runNeo4jQuery<{ nodeId: string; name: string }>(
      `MATCH (c:Content { nodeType: $nodeType })
       WHERE c.planId IS null AND (c.name = $name OR toLower(c.name) = toLower($name))
       RETURN c.nodeId AS nodeId, c.name AS name LIMIT 1`,
      { nodeType, name },
    );
    if (rows.length === 0) {
      // Also try curated aliases.
      const aliasRows = await runNeo4jQuery<{ nodeId: string; name: string }>(
        `MATCH (a:Alias)-[:ALIAS_OF]->(c:Content)
         WHERE c.nodeType = $nodeType AND toLower(a.name) = toLower($name)
         RETURN c.nodeId AS nodeId, c.name AS name LIMIT 1`,
        { nodeType, name },
      );
      if (aliasRows.length === 0) return null;
      return { nodeType, nodeId: aliasRows[0].nodeId, name: aliasRows[0].name };
    }
    return { nodeType, nodeId: rows[0].nodeId, name: rows[0].name };
  }

  async hasNode(nodeType: string, nodeId: string): Promise<boolean> {
    if (!isNeo4jEnabled()) return false;
    const rows = await runNeo4jQuery<{ count: unknown }>(
      `MATCH (c:Content { nodeType: $nodeType, nodeId: $nodeId })
       WHERE c.planId IS null
       RETURN count(c) AS count`,
      { nodeType, nodeId: nodeId.toLowerCase() },
    );
    return rows[0]?.count != null ? Number(rows[0].count) > 0 : false;
  }

  async listDistrictNames(): Promise<Array<{ name: string; aliases: string[] }>> {
    if (!isNeo4jEnabled()) return [];
    const rows = await runNeo4jQuery<{ name: string; aliases: unknown }>(
      `MATCH (c:Content { nodeType: 'District' }) WHERE c.planId IS null
       OPTIONAL MATCH (a:Alias)-[:ALIAS_OF]->(c)
       RETURN c.name AS name, collect(DISTINCT a.name) AS aliases`,
    );
    return rows
      .filter((r) => typeof r.name === 'string')
      .map((r) => ({
        name: r.name as string,
        aliases: Array.isArray(r.aliases) ? (r.aliases.filter((x) => typeof x === 'string') as string[]) : [],
      }));
  }
}
