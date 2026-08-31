// CLI plan reject — soft-terminal a proposed/rejected plan.
//
// Keeps the row (status = 'rejected', still visible in plan:get/plan:list for
// audit), prunes its authoring-graph deltas/edges, and closes open intake
// annotations. Never touches canonical content. Refuses plans already in the
// materialize pipeline (approved/staged/migrated/verified).
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseRejectArgs,
  rejectUsage,
  type RejectCliOptions,
} from '../src/planIntakeCore.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

async function main(): Promise<void> {
  const options: RejectCliOptions = parseRejectArgs(process.argv);
  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { closeNeo4j } = await import('../src/services/Neo4jClient.js');

  try {
    const result = await graphIntakeService.rejectPlan(options.planId);

    console.log(JSON.stringify({
      planId: result.planId,
      status: result.status,
      deltaPruned: result.deltaPruned,
      annotationCount: result.annotationCount,
      next: 'Plan rejected. Its row is retained for audit (visible in plan:get/plan:list); graph deltas were pruned and intake annotations closed.',
    }, null, 2));

    console.error(`[plan:reject] ${result.planId} → rejected (${result.annotationCount} annotations closed, deltas pruned: ${result.deltaPruned})`);
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:reject] ${error instanceof Error ? error.message : String(error)}`);
  console.error(rejectUsage());
  process.exitCode = 1;
});
