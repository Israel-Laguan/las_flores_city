// ============================================================
// run_plan_template_flow.ts — M43 manual flow runner
//
// Drives the complete plan→migration pipeline for a scoped
// mission+location template plan and prints the evidence M43 asks
// for: the plan ID, the migrated rows, and the verification result.
// Pipeline stages exercised (identical to solidify, minus LLM fill
// and asset publish which are no-ops for these templates):
//   create plan row → stagePlan → migrateStagedPlan → verifyPlan
//
// Usage:
//   cd server && npx tsx scripts/run_plan_template_flow.ts [--cleanup]
//
// Default keeps the artifacts for inspection; `--cleanup` removes the
// plan row, canon rows, migration_log entries, and content files after
// printing the evidence.
// ============================================================
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config();
dotenv.config({ path: new URL('../../../.env', import.meta.url) });

const { queryOLTP, closeConnections } = await import('@las-flores/infra');
const { buildMissionTemplatePlan, buildLocationTemplatePlan } = await import('../src/services/PlanTemplateBuilders.js');
const { stagePlan } = await import('../src/services/StoryBuilderPlanOps.js');
const { migrateStagedPlan, verifyPlan } = await import('../src/services/StoryBuilderMigration.js');
const { resolveContentDir } = await import('../src/services/StoryBuilderLore.js');

const CLEANUP = process.argv.includes('--cleanup');

async function main(): Promise<void> {
  const missionId = randomUUID();
  const locationId = randomUUID();

  // 1. Build the scoped template plan (mission + location inputs).
  const mission = buildMissionTemplatePlan({
    name: 'M43 Manual Flow Mission',
    slug: 'm43_manual_mission',
    description: 'Manual-flow fixture: recover the ledger before the syndicate notices.',
  });
  const location = buildLocationTemplatePlan({
    name: 'M43 Manual Annex',
    slug: 'm43_manual_location',
    district: 'M43 Manual District',
    description: 'Manual-flow fixture: a flooded records annex used as a dead drop.',
    tags: ['fixture'],
  });
  const plan = { ...mission, items: [location.items[0], mission.items[0]], links: [] };
  plan.items[1].id = missionId;
  plan.items[0].id = locationId;

  // 2. Create the plan row (proposed → approved), as POST /plans/from-template does.
  const inserted = await queryOLTP<{ id: string }>(
    `INSERT INTO content_plans (description, plan_json, status)
     VALUES ($1, $2::jsonb, 'proposed') RETURNING id`,
    [plan.description, JSON.stringify(plan)],
  );
  const planId = inserted.rows[0].id;
  await queryOLTP(`UPDATE content_plans SET status = 'approved', updated_at = NOW() WHERE id = $1`, [planId]);
  console.log('PLAN_ID      :', planId);
  console.log('MISSION_ID   :', missionId);
  console.log('LOCATION_ID  :', locationId);

  try {
    // 3. Stage (writes YAML + lore stubs via StoryBuilderFileWriter).
    const staged = await stagePlan(plan);
    if (!staged.success) throw new Error(`staging failed: ${staged.error ?? staged.validationErrors.join('; ')}`);
    await queryOLTP(`UPDATE content_plans SET status = 'staged', updated_at = NOW() WHERE id = $1`, [planId]);
    console.log('STAGED       :', [...staged.createdFiles, ...(staged.loreFiles ?? [])].join(', '));

    // 4. Migrate through the canonical gated path.
    const migration = await migrateStagedPlan(planId, undefined, staged.createdFiles);
    if (!migration.success) throw new Error(`migration failed: ${migration.error}`);
    const applied = (migration.migrationResult?.appliedMigrations ?? [])
      .map((m: any) => `${m.contentType}=${m.contentId}(${m.action})`)
      .join(', ');
    console.log('MIGRATED     :', applied);

    // 5. Verify cross-references.
    const report = await verifyPlan(planId);
    console.log('VERIFY       :', `passed=${report.passed}`, `checks=${report.checks.length}`,
      report.errors.length ? `errors=${JSON.stringify(report.errors)}` : 'errors=[]');

    // 6. Show the migrated rows.
    const mystery = await queryOLTP<any>('SELECT id, title, status FROM mysteries WHERE id = $1', [missionId]);
    const sceneRow = await queryOLTP<any>(
      `SELECT s.id, s.name, d.name AS district FROM scenes s LEFT JOIN districts d ON d.id = s.district_id WHERE s.id = $1`,
      [locationId],
    );
    console.log('MYSTERY ROW  :', JSON.stringify(mystery.rows[0]));
    console.log('SCENE ROW    :', JSON.stringify(sceneRow.rows[0]));
  } finally {
    if (CLEANUP) {
      const contentDir = resolveContentDir();
      await queryOLTP(`DELETE FROM mysteries WHERE id = ANY($1::uuid[])`, [[missionId]]);
      await queryOLTP(`DELETE FROM scenes WHERE id = $1`, [locationId]);
      await queryOLTP(
        `DELETE FROM districts WHERE name = 'M43 Manual District'
         AND id NOT IN (SELECT district_id FROM scenes WHERE district_id IS NOT NULL)`,
      );
      await queryOLTP(`DELETE FROM migration_log WHERE file_path LIKE '%m43_manual%'`);
      await queryOLTP(`DELETE FROM patches WHERE plan_id = $1`, [planId]);
      await queryOLTP(`DELETE FROM canon_revisions WHERE plan_id = $1`, [planId]);
      await queryOLTP(`DELETE FROM content_plans WHERE id = $1`, [planId]);
      for (const rel of [
        'missions/m43_manual_mission',
        'locations/m43_manual_location',
      ]) {
        await fs.rm(path.join(contentDir, rel), { recursive: true, force: true });
      }
      console.log('CLEANUP      : done');
    }
    await closeConnections();
  }
}

main().catch((err) => {
  console.error('flow failed:', err);
  process.exit(1);
});
