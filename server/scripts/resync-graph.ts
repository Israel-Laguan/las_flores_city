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
import { runGraphResyncNow } from '../src/services/GraphResyncService.js';

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
  const result = await runGraphResyncNow();

  console.log(`✅ Graph resynced. Source nodes: ${result.total}, edges: ${result.edges}, upserted: ${result.nodes}, deleted nodes: ${result.deletedNodes}, deleted edges: ${result.deletedEdges}`);

  if (result.status === 'failed') {
    console.error('❌ Graph resync reported failure:', result.error);
    process.exitCode = 1;
  }
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
