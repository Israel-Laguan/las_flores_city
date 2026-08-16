// ============================================================
// resync-graph.ts — M28 graph drift re-sync CLI
//
// Re-derives the canonical `:Content` base graph from the migrated content
// store (idempotent MERGE, mirroring seed-graph.ts). Used by the approve gate
// when `detectGraphDrift()` reports the graph has drifted (e.g. a YAML was
// edited directly outside the graph).
//
// Usage: npm run resync:graph --workspace=server
//   Requires NEO4J_ENABLED=true and a reachable Neo4j. When disabled, prints a
//   clear message and exits 0 (never aborts — mirrors the non-fatal boot rule).
// ============================================================

import dotenv from 'dotenv';
import { closeConnections } from '@las-flores/infra';
import { isNeo4jEnabled, verifyNeo4j, closeNeo4j } from '../src/services/Neo4jClient.js';
import { ensureGraphConstraints, upsertContentNode, upsertContentRelationship } from '../src/services/GraphBaseService.js';
import { gatherBaseGraphData } from '../src/services/GraphSeedSource.js';

async function main(): Promise<void> {
  dotenv.config();

  if (!isNeo4jEnabled()) {
    console.log('⏭️  NEO4J_ENABLED is not "true" — graph resync skipped.');
    return;
  }

  const reachable = await verifyNeo4j();
  if (!reachable) {
    console.error('❌ Neo4j enabled but unreachable. Check NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD.');
    process.exitCode = 1;
    return;
  }

  console.log('🔄 Re-syncing canonical graph from content store...');
  const data = await gatherBaseGraphData({ strict: true });
  await ensureGraphConstraints();

  console.log(`   Writing ${data.nodes.length} canonical :Content nodes...`);
  for (let i = 0; i < data.nodes.length; i++) {
    await upsertContentNode(data.nodes[i]);
    if ((i + 1) % 100 === 0) console.log(`     ...${i + 1}/${data.nodes.length}`);
  }

  console.log(`   Writing ${data.edges.length} FK relationships...`);
  for (let i = 0; i < data.edges.length; i++) {
    await upsertContentRelationship(data.edges[i]);
    if ((i + 1) % 200 === 0) console.log(`     ...${i + 1}/${data.edges.length}`);
  }

  console.log(`✅ Graph resynced. Source nodes: ${data.nodes.length}, edges: ${data.edges.length}`);
}

main()
  .catch((err) => {
    console.error('❌ Graph resync failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4j();
    await closeConnections();
  });
