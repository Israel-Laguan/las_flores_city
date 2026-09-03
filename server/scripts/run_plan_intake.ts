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
      // The full delta list (fields + prose) so the effect of intake is inspectable
      // without a separate call. Each delta carries its `_resolution` notes when the
      // LLM referenced a natural-language entity the graph could not pin down.
      deltas: graph.deltas,
      edges: graph.edges,
      // Everything the graph could not confidently resolve. Intake is fail-open:
      // these are advisory, the plan is already persisted, and each one carries an
      // `annotationId` you can reply to with `plan:amend`.
      notes: result.notes,
      updatedAt: plan.updated_at,
      reviewUrl: reviewUrl(
        options.adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
        result.planId,
      ),
      next: result.notes.length > 0
        ? 'The plan was created with notes. Reply to each note with plan:amend, then review before approval/solidify.'
        : 'Review the plan before invoking approval/solidify; no content files or canonical rows were changed.',
    }, null, 2));

    // Human-readable, directly actionable form on stderr so the JSON on stdout
    // stays machine-parseable.
    for (const note of result.notes) {
      const where = note.field ? ` (${note.field})` : '';
      const candidates = note.candidates.length > 0
        ? ` — ${note.candidates.map((c) => `${c.name} (${c.confidence.toFixed(2)})`).join(' or ')}`
        : '';
      const suggestion = note.suggestion ? ` ${note.suggestion}` : '';
      console.error(`[note] ${note.nodeType}:${note.nodeId}${where} "${note.raw}" is ${note.status}${candidates}.${suggestion}`);
      if (note.annotationId) {
        console.error(`  → npm run plan:amend --workspace=server -- ${result.planId} --annotation ${note.annotationId}:"<your comment>"`);
      }
    }
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:intake] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
