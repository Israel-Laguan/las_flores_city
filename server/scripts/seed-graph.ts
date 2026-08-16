// ============================================================
// seed-graph.ts — M27 base-graph seed CLI
//
// Reads the migrated content store (DB tables + location YAML) and writes the
// canonical `:Content` base graph (plan_id = null) into Neo4j, idempotently
// (MERGE on the `(nodeType, nodeId)` NODE KEY).
//
// Usage: npm run seed:graph --workspace=server
//   Requires NEO4J_ENABLED=true and a reachable Neo4j. When disabled, prints a
//   clear message and exits 0 (never aborts — mirrors the non-fatal boot rule).
// ============================================================

import dotenv from 'dotenv';
import { closeConnections } from '@las-flores/infra';
import { isNeo4jEnabled, verifyNeo4j, closeNeo4j } from '../src/services/Neo4jClient.js';
import { ensureGraphConstraints, upsertContentNode, upsertContentRelationship, countContentNodes } from '../src/services/GraphBaseService.js';
import { gatherBaseGraphData } from '../src/services/GraphSeedSource.js';

async function main(): Promise<void> {
  dotenv.config();

  if (!isNeo4jEnabled()) {
    console.log('⏭️  NEO4J_ENABLED is not "true" — graph seed skipped.');
    console.log('   Set NEO4J_ENABLED=true and ensure Neo4j is reachable to seed the base graph.');
    return;
  }

  const reachable = await verifyNeo4j();
  if (!reachable) {
    console.error('❌ Neo4j enabled but unreachable. Check NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD.');
    process.exitCode = 1;
    return;
  }

  console.log('🌐 Seeding base graph into Neo4j...');

  // Gather once: derive the summary from the same data object so the displayed
  // counts and the seeded content stay consistent. `strict: true` makes a
  // malformed/unreadable location YAML abort the seed instead of silently
  // producing a partial (incomplete) base graph.
  const data = await gatherBaseGraphData({ strict: true });
  const sourceSummary: Record<string, number> = {};
  for (const node of data.nodes) {
    sourceSummary[node.nodeType] = (sourceSummary[node.nodeType] ?? 0) + 1;
  }
  console.log('   Source counts:', JSON.stringify(sourceSummary, null, 2));

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

  const total = await countContentNodes();
  console.log(`✅ Base graph seeded. Canonical :Content nodes in graph: ${total}`);
}

main()
  .catch((err) => {
    console.error('❌ Graph seed failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4j();
    // gatherBaseGraphData() opens the shared OLTP pool — release it so the CLI
    // terminates promptly and doesn't hold Postgres connections open.
    await closeConnections();
  });
