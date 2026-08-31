// CLI plan list — enumerate plans with optional filters.
//
// Defaults to non-terminal plans (proposed + rejected) so a routine "what's
// open" check isn't buried under approved/solidified history. Resolves
// --created-by email to a user id before calling the service.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseListArgs,
  reviewUrl,
  type ListCliOptions,
} from '../src/planIntakeCore.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

async function main(): Promise<void> {
  const options: ListCliOptions = parseListArgs(process.argv);
  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { closeNeo4j } = await import('../src/services/Neo4jClient.js');

  try {
    // Resolve --created-by email to a user id (the service filters by created_by id).
    let createdBy: string | undefined;
    if (options.createdByEmail) {
      const userRow = await infra.queryOLTP<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [options.createdByEmail.trim()],
      );
      if (userRow.rows.length === 0) {
        throw new Error(`No user found for --created-by ${options.createdByEmail}`);
      }
      createdBy = userRow.rows[0].id;
    }

    const plans = await graphIntakeService.listPlans({
      status: options.status,
      createdBy,
      since: options.since,
    });

    console.log(JSON.stringify({
      count: plans.length,
      plans: plans.map((p) => ({
        id: p.id,
        status: p.status,
        createdBy: p.created_by,
        description: p.description,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        deltaCount: p.deltaCount,
        reviewUrl: reviewUrl(
          options.adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
          p.id,
        ),
      })),
    }, null, 2));

    console.error(`[plan:list] ${plans.length} plan${plans.length === 1 ? '' : 's'} found`);
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:list] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
