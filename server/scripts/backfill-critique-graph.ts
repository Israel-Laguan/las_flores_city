// ============================================================
// backfill-critique-graph — promote M26 Postgres rows into graph nodes
//
// M27-b one-off operational script: reads durable `critique_annotations` rows
// (Postgres) and writes them as `:Conflict` / `:Suggestion` graph nodes with
// `-[:FLAGGED_IN]-> (:Content)` edges, WITHOUT re-deriving the critique.
// Clean-run cache markers are recreated as `:CacheMarker` nodes so the graph
// cache (ai_model, input_hash) matches Postgres.
//
// Usage:  NEO4J_ENABLED=true npm run backfill:critique-graph --workspace=server
// ============================================================

import { queryOLTP, closeConnections } from '@las-flores/infra';
import type { CritiqueAnnotation, CritiqueStatus, CritiqueScope } from '@las-flores/shared';
import { graphCritiqueService } from '../src/services/GraphCritiqueService.js';
import { isNeo4jEnabled, closeNeo4j } from '../src/services/Neo4jClient.js';

interface CritiqueRow {
  id: string;
  type: 'conflict' | 'suggestion';
  severity: string;
  description: string;
  evidence: Array<Record<string, unknown>>;
  related_entities: Array<Record<string, unknown>>;
  scope: CritiqueScope;
  ai_model: string;
  input_hash: string;
  status: CritiqueStatus;
  plan_id: string;
  item_ids: string[];
  created_at: Date | string | null;
  is_marker: boolean;
}

/**
 * Coerce a timestamp to ISO. A legacy row with an explicit null `created_at`
 * must not abort the whole backfill: fall back to the epoch so the row is still
 * promoted and simply sorts as the oldest (it can never trump a real run in the
 * per-scope "keep newest" selection because other runs' timestamps are >= epoch).
 */
function toIso(v: Date | string | null): string {
  if (v == null) return new Date(0).toISOString();
  return typeof v === 'string' ? v : v.toISOString();
}

function toAnnotation(row: CritiqueRow): CritiqueAnnotation {
  return {
    id: String(row.id),
    type: row.type,
    severity: (row.severity as CritiqueAnnotation['severity']) ?? 'warning',
    description: String(row.description ?? ''),
    evidence: (row.evidence ?? []) as CritiqueAnnotation['evidence'],
    relatedEntities: (row.related_entities ?? []) as CritiqueAnnotation['relatedEntities'],
    scope: row.scope,
    aiModel: String(row.ai_model),
    inputHash: String(row.input_hash),
    status: row.status ?? 'open',
    planId: String(row.plan_id),
    itemIds: Array.isArray(row.item_ids) ? (row.item_ids as string[]) : [],
    createdAt: toIso(row.created_at),
  };
}

async function main(): Promise<number> {
  if (!isNeo4jEnabled()) {
    console.error('[backfill-critique-graph] NEO4J_ENABLED !== "true" — aborting.');
    process.exit(1);
  }

  const result = await queryOLTP<CritiqueRow>(
    `SELECT id, type, severity, description, evidence, related_entities,
            scope, ai_model, input_hash, status, plan_id, item_ids, created_at, is_marker
       FROM critique_annotations
      ORDER BY plan_id, scope, input_hash, ai_model`,
  );
  const rows = result.rows;
  if (rows.length === 0) {
    console.log('[backfill-critique-graph] No critique_annotations rows to promote.');
    return 0;
  }

  // Group by (plan, scope, input_hash, ai_model): each group is one critique run.
  const groups = new Map<string, { annotations: CritiqueAnnotation[]; hadMarker: boolean; meta: { planId: string; scope: CritiqueScope; inputHash: string; model: string } }>();
  for (const row of rows) {
    const key = `${row.plan_id}|${row.scope}|${row.input_hash}|${row.ai_model}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        annotations: [],
        hadMarker: false,
        meta: { planId: String(row.plan_id), scope: row.scope, inputHash: String(row.input_hash), model: String(row.ai_model) },
      };
      groups.set(key, group);
    }
    if (row.is_marker) {
      group.hadMarker = true;
    } else {
      group.annotations.push(toAnnotation(row));
    }
  }

  // Only one run per (plan, scope) can survive in the graph: writeAnnotations
  // retires prior open nodes + markers for that pair. Keep the newest run.
  const newestByScope = new Map<string, { key: string; createdAt: string }>();
  for (const [key, group] of groups) {
    const scopeKey = `${group.meta.planId}|${group.meta.scope}`;
    // Include the marker's createdAt if present, so a clean-run marker timestamps
    // the group and prevents selecting an older non-marker run in its place.
    const markerCreatedAt = group.hadMarker ? (group.annotations.length > 0 ? group.annotations[group.annotations.length - 1].createdAt : '') : '';
    const annotationCreatedAt = group.annotations.reduce(
      (max, a) => (a.createdAt > max ? a.createdAt : max),
      markerCreatedAt,
    );
    const createdAt = annotationCreatedAt > markerCreatedAt ? annotationCreatedAt : markerCreatedAt;
    const current = newestByScope.get(scopeKey);
    if (!current || createdAt > current.createdAt) newestByScope.set(scopeKey, { key, createdAt });
  }
  const selected = new Set([...newestByScope.values()].map((v) => v.key));

  let promoted = 0;
  let markers = 0;
  let skipped = 0;
  for (const [key, group] of groups) {
    if (!selected.has(key)) {
      skipped += 1;
      continue;
    }
    if (group.annotations.length > 0) {
      await graphCritiqueService.writeAnnotations(group.annotations, group.meta);
      promoted += group.annotations.length;
    } else if (group.hadMarker) {
      // Clean-plan run: recreate the CacheMarker so graph cache hits match Postgres.
      await graphCritiqueService.writeAnnotations([], group.meta);
      markers += 1;
    }
  }

  console.log(`[backfill-critique-graph] Promoted ${promoted} annotation node(s) across ${groups.size} run(s), recreated ${markers} cache marker(s), skipped ${skipped} older run(s).`);
  return groups.size;
}

main()
  .then(async (count) => {
    await closeNeo4j();
    await closeConnections();
    console.log(`[backfill-critique-graph] Done (${count} run group(s)).`);
    process.exit(0);
  })
  .catch(async (err: Error) => {
    console.error('[backfill-critique-graph] Failed:', err.message);
    await closeNeo4j();
    await closeConnections();
    process.exit(1);
  });
