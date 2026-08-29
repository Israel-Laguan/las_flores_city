// ============================================================
// GraphAliasService — M50 curated alias seeding + pruning
//
// Seeds `(:Alias)-[:ALIAS_OF]->(:Content)` nodes from a small, reviewed
// `seed-aliases.json` (NOT LLM-generated, to avoid the orphan-edge class of bug).
// Aliases let the resolution service match common alternate names ("El Centro" ->
// City District, "Industrial Zone" -> Industrial District) to canonical nodes.
//
// `pruneOrphanAliases` removes `(:Alias)` nodes whose `ALIAS_OF` target no longer
// exists, so aliases stay consistent when canonical content is resynced. Mirrors
// `GraphBaseService` write patterns (guarded by `isNeo4jEnabled`, no new pools).
// ============================================================

import { existsSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import path from 'node:path';
import { isNeo4jEnabled, runNeo4jQuery } from './Neo4jClient.js';

/** A curated alias entry linking an alternate name to a canonical node. */
export interface SeedAlias {
  nodeType: string;
  alias: string;
  targetName: string;
  note?: string;
}

/** Resolve seed-aliases.json without `import.meta` (which breaks the jest CJS
 * transform). Try cwd-relative candidates so it works both from the server
 * workspace (tsx scripts, jest) and from the repo root. */
function resolveSeedAliasesPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'src', 'data', 'seed-aliases.json'),
    path.resolve(process.cwd(), 'server', 'src', 'data', 'seed-aliases.json'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

/** Load the curated alias list from disk. */
export async function loadSeedAliases(): Promise<SeedAlias[]> {
  const raw = await readFileAsync(resolveSeedAliasesPath(), 'utf-8');
  const parsed = JSON.parse(raw) as SeedAlias[];
  if (!Array.isArray(parsed)) throw new Error('seed-aliases.json must be an array');
  return parsed;
}

function aliasKey(nodeType: string, alias: string): string {
  return `alias:${nodeType}:${alias.toLowerCase()}`;
}

/** Result of a seed pass. */
export interface SeedAliasResult {
  linked: number;
  skipped: number;
}

/**
 * Seed all curated aliases into Neo4j, linking each to the canonical `:Content`
 * node matched by `(nodeType, targetName)`. Aliases whose target node is missing
 * (e.g. a district not yet in the graph) are skipped and counted. Idempotent via
 * `MERGE` on the alias `key`. No-op when Neo4j is disabled.
 */
export async function seedAliases(): Promise<SeedAliasResult> {
  if (!isNeo4jEnabled()) return { linked: 0, skipped: 0 };
  const aliases = await loadSeedAliases();
  let linked = 0;
  let skipped = 0;
  for (const a of aliases) {
    const target = await runNeo4jQuery<{ nodeId: string; name: string }>(
      `MATCH (c:Content { nodeType: $nodeType, name: $name })
       WHERE c.planId IS null
       RETURN c.nodeId AS nodeId, c.name AS name LIMIT 1`,
      { nodeType: a.nodeType, name: a.targetName },
    );
    if (target.length === 0) {
      skipped += 1;
      continue;
    }
    const targetNodeId = target[0].nodeId;
    await runNeo4jQuery(
      `// Drop any ALIAS_OF relationships to non-target Content nodes so a
       // re-seeded alias resolves only to its current target (and never both
       // the current and an obsolete :Content node from a prior target).
       MATCH (a:Alias { key: $key })-[r:ALIAS_OF]->(old:Content)
       WHERE NOT (old.nodeType = $nodeType AND old.nodeId = $targetNodeId)
       DELETE r
       WITH a
       MERGE (a:Alias { key: $key })
       SET a.name = $alias, a.nodeType = $nodeType, a.targetNodeId = $targetNodeId, a.targetName = $targetName
       WITH a
       MATCH (c:Content { nodeType: $nodeType, nodeId: $targetNodeId })
       WHERE c.planId IS null
       MERGE (a)-[:ALIAS_OF]->(c)`,
      {
        key: aliasKey(a.nodeType, a.alias),
        alias: a.alias,
        nodeType: a.nodeType,
        targetNodeId,
        targetName: a.targetName,
      },
    );
    linked += 1;
  }
  return { linked, skipped };
}

/**
 * Remove `(:Alias)` nodes whose `ALIAS_OF` target no longer exists (the canonical
 * node was resynced away). Returns the number of orphans removed. No-op when
 * Neo4j is disabled.
 */
export async function pruneOrphanAliases(): Promise<number> {
  if (!isNeo4jEnabled()) return 0;
  const countRows = await runNeo4jQuery<{ count: unknown }>(
    `MATCH (a:Alias)
     WHERE NOT EXISTS { MATCH (a)-[:ALIAS_OF]->(:Content) }
     RETURN count(a) AS count`,
  );
  const count = countRows[0]?.count != null ? Number(countRows[0].count) : 0;
  if (count > 0) {
    await runNeo4jQuery(
      `MATCH (a:Alias)
       WHERE NOT EXISTS { MATCH (a)-[:ALIAS_OF]->(:Content) }
       DETACH DELETE a`,
    );
  }
  return count;
}
