// CLI plan get — full state fetch by id.
//
// Read-only: surfaces the plan row, its graph deltas/edges, the canonical-before
// vs proposed-after diff, and the open intake annotations an author can reply
// to. Never mutates the plan.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseGetArgs,
  reviewUrl,
  type GetCliOptions,
} from '../src/planIntakeCore.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

async function main(): Promise<void> {
  const options: GetCliOptions = parseGetArgs(process.argv);
  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { closeNeo4j } = await import('../src/services/Neo4jClient.js');

  try {
    const state = await graphIntakeService.getPlanState(options.planId);
    if (!state) {
      throw new Error(`Plan ${options.planId} not found`);
    }

    console.log(JSON.stringify({
      planId: state.planId,
      status: state.status,
      createdBy: state.created_by,
      description: state.description,
      createdAt: state.created_at,
      updatedAt: state.updated_at,
      deltaCount: state.deltaCount,
      edgeCount: state.edgeCount,
      deltas: state.deltas,
      edges: state.edges,
      diff: state.diff,
      openAnnotations: state.openAnnotations,
      reviewUrl: reviewUrl(
        options.adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
        state.planId,
      ),
    }, null, 2));

    const openCount = state.openAnnotations.length;
    console.error(`[plan:get] ${state.planId} (${state.status}) — ${state.deltaCount} deltas, ${openCount} open annotation${openCount === 1 ? '' : 's'}`);
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:get] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
