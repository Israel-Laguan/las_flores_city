// CLI-first plan intake. This intentionally stops at `proposed`: it creates a
// reviewable AI plan and graph deltas, but never stages, migrates, or solidifies.
// The future admin endpoint should preserve this same boundary.
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseArgs,
  resolveActor,
  reviewUrl,
  type CliOptions,
} from '../src/planIntakeCore.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

async function main(): Promise<void> {
  const options: CliOptions = parseArgs(process.argv);
  const inputPath = path.resolve(process.cwd(), options.inputPath);
  const description = (await fs.readFile(inputPath, 'utf8')).trim();
  if (!description) throw new Error(`Intake Markdown is empty: ${inputPath}`);

  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { closeNeo4j } = await import('../src/services/Neo4jClient.js');

  try {
    const actor = await resolveActor(infra.queryOLTP, options);
    const result = await graphIntakeService.createPlanFromDescription(
      description,
      [],
      actor.id,
    );
    const row = await infra.queryOLTP<{
      id: string;
      status: string;
      created_by: string | null;
      updated_at: string;
    }>(
      `SELECT id, status, created_by, updated_at
       FROM content_plans WHERE id = $1`,
      [result.planId],
    );
    const plan = row.rows[0];
    if (!plan || plan.status !== 'proposed' || plan.created_by !== actor.id) {
      throw new Error(`Plan ${result.planId} failed review-ready persistence checks`);
    }
    const graph = await graphIntakeService.getPlanDeltas(result.planId);

    console.log(JSON.stringify({
      planId: result.planId,
      status: plan.status,
      actor: { id: actor.id, email: actor.email, role: actor.role },
      source: inputPath,
      descriptionLength: description.length,
      deltaCount: graph.deltas.length,
      edgeCount: graph.edges.length,
      updatedAt: plan.updated_at,
      reviewUrl: reviewUrl(
        options.adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
        result.planId,
      ),
      next: 'Review the plan before invoking approval/solidify; no content files or canonical rows were changed.',
    }, null, 2));
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:intake] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
