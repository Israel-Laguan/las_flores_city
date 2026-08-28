// Live-stack probe for the plan:intake CLI (M50 acceptance criterion #1 + #3).
//
// Requires a live local stack with Neo4j + LiteLLM enabled:
//   - Neo4j: NEO4J_ENABLED=true and reachable at NEO4J_URI
//   - LiteLLM: provider returning deltas for the description
//   - A seeded admin user (npm run seed:dev)
//
// Run:
//   tsx scripts/probe_plan_intake.ts path/to/intake.md \
//     --user-email admin@example.com
//
// It invokes the same createPlanFromDescription path the CLI uses, then asserts
// the OLTP persistence (status=proposed, created_by=actor), the Neo4j delta/edge
// counts, and a well-formed review URL. Exits non-zero on any assertion failure.
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseArgs,
  resolveActor,
  reviewUrl,
} from '../src/planIntakeCore.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const inputPath = path.resolve(process.cwd(), options.inputPath);
  const description = (await fs.readFile(inputPath, 'utf8')).trim();
  if (!description) throw new Error(`Intake Markdown is empty: ${inputPath}`);

  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { runNeo4jTransaction, isNeo4jEnabled, closeNeo4j } = await import('../src/services/Neo4jClient.js');

  if (!isNeo4jEnabled()) {
    throw new Error('NEO4J_ENABLED is false — the live-stack probe requires Neo4j.');
  }

  let failures = 0;
  const check = (label: string, ok: boolean, detail?: unknown) => {
    if (ok) {
      console.log(`  PASS  ${label}`);
    } else {
      failures += 1;
      console.error(`  FAIL  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
    }
  };

  try {
    const actor = await resolveActor(infra.queryOLTP, options);
    const result = await graphIntakeService.createPlanFromDescription(description, [], actor.id);
    const planId = result.planId;

    // OLTP persistence
    const row = await infra.queryOLTP<{ status: string; created_by: string | null }>(
      `SELECT status, created_by FROM content_plans WHERE id = $1`,
      [planId],
    );
    const plan = row.rows[0];

    console.log(`\nPlan ${planId} (actor ${actor.id}/${actor.role}):`);
    check('content_plans.status = proposed', plan?.status === 'proposed', plan?.status);
    check('content_plans.created_by = actor', plan?.created_by === actor.id, plan?.created_by);

    // Neo4j deltas + edges
    const neo = await runNeo4jTransaction(async (tx: any) => {
      const d = await tx.run(
        'MATCH (d:ContentDelta { planId: $planId }) RETURN count(d) AS c',
        { planId },
      );
      const e = await tx.run(
        `MATCH (s:ContentDelta { planId: $planId })-[r]->(t) RETURN count(r) AS c`,
        { planId },
      );
      return {
        deltaCount: Number(d.records[0]?.get('c') ?? 0),
        edgeCount: Number(e.records[0]?.get('c') ?? 0),
      };
    });

    check('Neo4j ContentDelta nodes exist', neo.deltaCount > 0, neo.deltaCount);
    check('Neo4j delta/edge counts match service',
      neo.deltaCount === result.deltaCount && neo.edgeCount === result.edgeCount,
      { neo, service: { deltaCount: result.deltaCount, edgeCount: result.edgeCount } });

    // M50: entity-resolution blocks present on the plan's deltas, and any
    // ambiguous/unresolved references surfaced for human confirmation.
    const planDeltas = await graphIntakeService.getPlanDeltas(planId);
    const blocks = planDeltas.deltas.flatMap((d) => d._resolution ?? []);
    check('plan deltas carry _resolution blocks', blocks.length > 0, blocks.length);
    const needsReview = blocks.filter(
      (b) => b.status === 'ambiguous' || b.status === 'unresolved',
    );
    if (needsReview.length > 0) {
      console.warn(
        `\n  ⚠️  ${needsReview.length} reference(s) need admin confirmation before approval:`,
      );
      for (const b of needsReview) {
        console.warn(`     - "${b.raw}" -> ${b.status} (${b.candidates.map((c) => `${c.name}@${c.confidence}`).join(', ') || 'no candidates'})`);
      }
    } else {
      console.log('  (no ambiguous/unresolved references detected)');
    }

    // Review URL
    const url = reviewUrl(
      options.adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
      planId,
    );
    const urlOk = /^https?:\/\/.+\/story-builder\?planId=.+$/.test(url);
    check('review URL well-formed', urlOk, url);

    console.log(`\nreviewUrl: ${url}`);
    console.log(`deltaCount: ${neo.deltaCount}  edgeCount: ${neo.edgeCount}`);

    if (failures > 0) {
      throw new Error(`${failures} plan-intake probe assertion(s) failed`);
    }
    console.log('\nPROBE OK');
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[probe:plan-intake] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
