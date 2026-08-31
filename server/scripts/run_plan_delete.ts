// CLI plan delete — hard-delete a proposed/rejected plan.
//
// Removes the content_plans row, its graph deltas/edges, and its scope='intake'
// critique annotations. Irreversible — the CLI refuses to run without `--yes`
// and refuses plans already in the materialize pipeline. Canonical content is
// never touched (a plan's deltas are plan-scoped, never canonical).
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseDeleteArgs,
  deleteUsage,
  type DeleteCliOptions,
} from '../src/planIntakeCore.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

async function main(): Promise<void> {
  const options: DeleteCliOptions = parseDeleteArgs(process.argv);
  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { closeNeo4j } = await import('../src/services/Neo4jClient.js');

  try {
    const result = await graphIntakeService.deletePlan(options.planId);

    console.log(JSON.stringify({
      planId: result.planId,
      status: result.status,
      deltaPruned: result.deltaPruned,
      annotationCount: result.annotationCount,
      next: 'Plan permanently deleted. This cannot be undone.',
    }, null, 2));

    console.error(`[plan:delete] ${result.planId} hard-deleted (${result.annotationCount} annotations removed, deltas pruned: ${result.deltaPruned})`);
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:delete] ${error instanceof Error ? error.message : String(error)}`);
  console.error(deleteUsage());
  process.exitCode = 1;
});
