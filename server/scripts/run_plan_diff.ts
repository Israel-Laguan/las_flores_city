// CLI standalone plan diff — render a plan's canonical-before vs proposed-after
// field-by-field, on demand, without re-running any intake/amend action against it.
//
// Like `plan:intake`/`plan:amend`, this stops at `proposed`: it only reads the
// plan's existing graph deltas and the canonical `:Content` base nodes to compare
// them. New entities (ADD deltas) show as pure "proposed" with no "before" side;
// DELETE deltas invert that (no "after").
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parsePlanDiffArgs,
  reviewUrl,
  type PlanDiffCliOptions,
} from '../src/planIntakeCore.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

async function main(): Promise<void> {
  const options: PlanDiffCliOptions = parsePlanDiffArgs(process.argv);
  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { closeNeo4j } = await import('../src/services/Neo4jClient.js');

  try {
    const planRow = await infra.queryOLTP<{ id: string; status: string }>(
      `SELECT id, status FROM content_plans WHERE id = $1`,
      [options.planId],
    );
    if (planRow.rows.length === 0) {
      throw new Error(`Plan ${options.planId} not found`);
    }
    const status = planRow.rows[0].status;

    const diff = await graphIntakeService.buildPlanDiff(options.planId);

    // Machine-parseable JSON on stdout: per-delta before/after field comparison
    // plus the raw deltas/edges so an automated check can assert on the shape.
    console.log(JSON.stringify({
      planId: options.planId,
      status,
      deltaCount: diff.deltas.length,
      edgeCount: diff.edges.length,
      deltas: diff.deltas,
      edges: diff.edges,
      reviewUrl: reviewUrl(
        options.adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
        options.planId,
      ),
    }, null, 2));

    // Human-readable summary on stderr (keeps stdout JSON pristine).
    for (const d of diff.deltas) {
      const changed = d.fields.filter((f) => f.change !== 'unchanged');
      const summary = changed.length > 0
        ? changed.map((f) => `${f.field}: ${f.change}`).join(', ')
        : 'no field changes';
      console.error(`[diff] ${d.op} ${d.nodeType}:${d.nodeId} (${d.name}) — ${summary}`);
    }
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:diff] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
