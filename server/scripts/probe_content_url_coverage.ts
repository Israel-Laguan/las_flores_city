// ============================================================
// probe_content_url_coverage.ts — M32 Pin gate
//
// Verifies that every `dialogue_trees` and `dialogue_chunks` row has a
// reachable `content_url` before the M23 JSONB columns can be dropped.
//
// Usage: npm run probe:content-urls --workspace=server
//
// Exit codes:
//   0 — every row's content_url resolves (or no rows need one)
//   1 — one or more rows are missing a content_url or the blob is unreachable
//
// The probe uses the same S3/HTTP fetch path as DialogueResolver
// (StorageService.fetchContentString), so a green result is a reliable
// indicator that the resolver can stop falling back to in-DB JSONB.
// ============================================================

import dotenv from 'dotenv';
import { queryContent, closeConnections } from '@las-flores/infra';
import { fetchContentString } from '../src/services/StorageService.js';

dotenv.config();

dotenv.config({ path: new URL('../../../.env', import.meta.url) });

interface Gap {
  table: 'dialogue_trees' | 'dialogue_chunks';
  id: string;
  contentUrl: string | null;
  reason: 'missing' | 'unreachable';
  detail?: string;
}

async function probeRows(
  table: 'dialogue_trees' | 'dialogue_chunks',
): Promise<{ checked: number; gaps: Gap[] }> {
  const isChunk = table === 'dialogue_chunks';
  const idCol = isChunk ? 'id, chunk_key' : 'id, name';
  const sql = `SELECT id, content_url${isChunk ? ', chunk_key' : ', name'} FROM ${table}`;
  const result = await queryContent<{ id: string; content_url: string | null; chunk_key?: string; name?: string }>(sql);

  const gaps: Gap[] = [];
  const checked = result.rows.length;

  for (const row of result.rows) {
    if (!row.content_url) {
      gaps.push({
        table,
        id: row.id,
        contentUrl: null,
        reason: 'missing',
        detail: isChunk ? `chunk_key=${row.chunk_key}` : `name=${row.name}`,
      });
      continue;
    }

    try {
      // Reuse the resolver's fetch path and VALIDATE the blob shape. A blob
      // that returns HTTP 200 but contains malformed/empty/wrongly-shaped JSON
      // would still trip the resolver at runtime — the M32 drop must not pass
      // just because the byte fetch succeeded. Trees must carry a non-empty
      // `nodes` record; chunks must carry `nodes` (and `leaves`).
      const raw = await fetchContentString(row.content_url);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`blob is not valid JSON (${raw.slice(0, 80)}…)`);
      }
      const nodes = (parsed as { nodes?: unknown })?.nodes;
      const isRecordOfRecords =
        nodes &&
        typeof nodes === 'object' &&
        !Array.isArray(nodes) &&
        Object.keys(nodes).length > 0 &&
        Object.values(nodes as Record<string, unknown>).every(
          (n) => typeof n === 'object' && n !== null && !Array.isArray(n),
        );
      if (!isRecordOfRecords) {
        throw new Error(
          isChunk
            ? `blob is missing a non-empty nodes record (${Object.keys(parsed as object).join(',') || 'empty'})`
            : `blob is missing a non-empty nodes record (${Object.keys(parsed as object).join(',') || 'empty'})`,
        );
      }
      if (isChunk) {
        const leaves = (parsed as { leaves?: unknown })?.leaves;
        const validLeaves = leaves && typeof leaves === 'object' && !Array.isArray(leaves) && Object.values(leaves as Record<string, unknown>).every((leaf) => typeof leaf === 'object' && leaf !== null && !Array.isArray(leaf));
        if (!validLeaves) throw new Error(`blob is missing a valid leaves record (${Object.keys(parsed as object).join(',') || 'empty'})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gaps.push({
        table,
        id: row.id,
        contentUrl: row.content_url,
        reason: 'unreachable',
        detail: message,
      });
    }
  }

  return { checked, gaps };
}

async function main(): Promise<void> {
  console.log('🔍 Probing dialogue content_url coverage...\n');

  let totalChecked = 0;
  const allGaps: Gap[] = [];

  for (const table of ['dialogue_trees', 'dialogue_chunks'] as const) {
    const { checked, gaps } = await probeRows(table);
    totalChecked += checked;
    allGaps.push(...gaps);
    console.log(`  ${table}: ${checked} rows checked, ${gaps.length} gaps`);
  }

  if (allGaps.length === 0) {
    console.log(`\n✅ All ${totalChecked} rows have reachable content_url values.`);
    console.log('   Safe to drop dialogue_trees.nodes and dialogue_chunks.nodes/leaves.');
    await closeConnections();
    process.exit(0);
  }

  console.error(`\n❌ ${allGaps.length} row(s) are not ready for the JSONB drop:`);
  for (const gap of allGaps) {
    console.error(`   [${gap.table}] id=${gap.id} reason=${gap.reason} url=${gap.contentUrl ?? '<null>'}${gap.detail ? ` (${gap.detail})` : ''}`);
  }
  console.error('\n   Fix the gaps (republish missing blobs or re-run content migration) before running the M32 column-drop migration.');
  await closeConnections();
  process.exit(1);
}

main().catch(async (error) => {
  console.error('💥 Probe failed:', error);
  await closeConnections().catch(() => {});
  process.exit(1);
});
