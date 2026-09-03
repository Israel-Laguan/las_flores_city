/**
 * Integration test — plan→migration effectiveness (M43).
 *
 * Exercises the complete scoped flow end-to-end:
 *   PlanTemplateBuilders (mission/location) → ContentPlan →
 *   StoryBuilderFileWriter.writePlanItems/applyLink inside executePlan →
 *   migrateContent (real OLTP) → PlanVerificationService.verifyPlanCrossReferences.
 *
 * Covered acceptance criteria:
 *   1. Mission and location plans solidify into migrated rows with correct links
 *      (mysteries row + scenes row resolving to the right districts.id).
 *   2. Re-running the same plan is idempotent — no ghost files, no duplicate rows,
 *      migration_log checksum-skips unchanged files.
 *   3. An invalid (XSS) plan fails validation WITHOUT mutating canon — created
 *      files are rolled back and no DB rows appear.
 *
 * Isolation per AGENTS.md: dedicated synthetic UUIDs, file writes redirected to a
 * temp content dir via a process.cwd spy (re-created in beforeEach because jest
 * restoreMocks strips beforeAll spies between tests), cleanup in afterAll.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { oltpPool, closeConnections } from '@las-flores/infra';

import {
  buildMissionTemplatePlan,
  buildLocationTemplatePlan,
} from '../../src/services/PlanTemplateBuilders.js';
import type { ContentPlan } from '@las-flores/shared';
import { executePlan } from '../../src/services/StoryBuilderPlanOps.js';
import { generateLoreStubs } from '../../src/services/StoryBuilderLore.js';
import { verifyPlanCrossReferences } from '../../src/services/PlanVerificationService.js';

// Dedicated synthetic IDs (collision-avoidance per AGENTS.md).
const MISSION_ID = 'e4300000-0000-4000-8000-0000000000a1';
const LOCATION_ID = 'e4300000-0000-4000-8000-0000000000a2';
const BAD_MISSION_ID = 'e4300000-0000-4000-8000-0000000000a3';
const DISTRICT_NAME = 'M43 Pipeline Fixture District';

// Shared lazy OLTP pool from @las-flores/infra (sanctioned access pattern).
let tmpDir: string;
let contentDir: string;
let cwdSpy: any;

function combinedPlan(): ContentPlan {
  const mission = buildMissionTemplatePlan({
    name: 'M43 Pipeline Mission',
    slug: 'm43_pipeline_mission',
    description: 'Recover the ledger before the syndicate notices.',
  });
  const location = buildLocationTemplatePlan({
    name: 'M43 Pipeline Annex',
    slug: 'm43_pipeline_location',
    district: DISTRICT_NAME,
    description: 'A flooded records annex used as a dead drop.',
    tags: ['fixture'],
  });
  const plan: ContentPlan = {
    ...mission,
    items: [location.items[0], mission.items[0]],
    links: [],
  };
  plan.items[1].id = MISSION_ID;
  plan.items[0].id = LOCATION_ID;
  return plan;
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(contentDir, full));
    }
  }
  await walk(dir);
  return out.sort();
}

async function clearDbState(): Promise<void> {
  await oltpPool.query(`DELETE FROM mysteries WHERE id = ANY($1::uuid[])`, [
    [MISSION_ID, BAD_MISSION_ID],
  ]);
  await oltpPool.query(`DELETE FROM scenes WHERE id = $1::uuid`, [LOCATION_ID]);
  // Scenes are deleted above, so the fixture district has no remaining dependents.
  await oltpPool.query(`DELETE FROM districts WHERE name = $1`, [DISTRICT_NAME]);
  await oltpPool.query(
    `DELETE FROM migration_log WHERE file_path LIKE '%m43_pipeline%'`,
  );
}

beforeAll(async () => {
  await clearDbState();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'm43-pipeline-'));
  // resolveContentDir() resolves ../content when cwd basename is 'server'.
  await fs.mkdir(path.join(tmpDir, 'server'), { recursive: true });
  contentDir = path.join(tmpDir, 'content');
});

afterAll(async () => {
  cwdSpy?.mockRestore();
  await clearDbState();
  await closeConnections();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  // restoreMocks strips spies before each test — re-create the cwd redirect.
  cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(path.join(tmpDir, 'server'));
});

describe('plan → file write → migrateContent → verification (mission + location)', () => {
  test('solidifies a mission+location plan into linked canon rows', async () => {
    const plan = combinedPlan();

    const result = await executePlan(plan);
    expect(result.success).toBe(true);

    // Files written at the canonical per-folder paths.
    const files = await listFilesRecursive(contentDir);
    expect(files).toContain('missions/m43_pipeline_mission/mission_m43_pipeline_mission.yaml');
    expect(files).toContain('locations/m43_pipeline_location/location_m43_pipeline_location.yaml');

    // Migrated rows exist with correct links.
    const mystery = await oltpPool.query<{ id: string; title: string; status: string }>(
      'SELECT id, title, status FROM mysteries WHERE id = $1::uuid',
      [MISSION_ID],
    );
    expect(mystery.rows).toHaveLength(1);
    expect(mystery.rows[0].title).toBe('M43 Pipeline Mission');
    expect(mystery.rows[0].status).toBe('ACTIVE');

    const scene = await oltpPool.query<{ id: string; metadata: any; district_name: string | null }>(
      `SELECT s.id, s.metadata, d.name AS district_name
         FROM scenes s LEFT JOIN districts d ON d.id = s.district_id
        WHERE s.id = $1::uuid`,
      [LOCATION_ID],
    );
    expect(scene.rows).toHaveLength(1);
    // "correct links": the location resolves its district FK and carries the
    // location type marker through scene metadata.
    expect(scene.rows[0].district_name).toBe(DISTRICT_NAME);
    expect(scene.rows[0].metadata?.type).toBe('location');

    // Lore stubs + verification report pass (read-only gate after migration).
    await generateLoreStubs(plan.items, contentDir);
    const report = await verifyPlanCrossReferences(plan, contentDir);
    expect(report.passed).toBe(true);
  }, 60000);

  test('re-running the same plan is idempotent (no ghost files, no duplicate rows)', async () => {
    const plan = combinedPlan();
    const filesBefore = await listFilesRecursive(contentDir);
    const mysteriesBefore = await oltpPool.query('SELECT COUNT(*)::int AS c FROM mysteries WHERE id = $1::uuid', [MISSION_ID]);
    const logBefore = await oltpPool.query<{ file_path: string }>(
      `SELECT file_path FROM migration_log WHERE file_path LIKE '%m43_pipeline%' ORDER BY file_path`,
    );

    const result = await executePlan(plan);
    expect(result.success).toBe(true);

    // No ghost files: same file set, nothing appended or duplicated.
    const filesAfter = await listFilesRecursive(contentDir);
    expect(filesAfter).toEqual(filesBefore);

    // No duplicate rows.
    const mysteriesAfter = await oltpPool.query('SELECT COUNT(*)::int AS c FROM mysteries WHERE id = $1::uuid', [MISSION_ID]);
    expect(mysteriesAfter.rows[0].c).toBe(Math.max(mysteriesBefore.rows[0].c, 1));

    // migration_log still holds exactly one entry per plan file (checksum skip).
    const logAfter = await oltpPool.query<{ file_path: string }>(
      `SELECT file_path FROM migration_log WHERE file_path LIKE '%m43_pipeline%' ORDER BY file_path`,
    );
    expect(logAfter.rows.map((r) => r.file_path)).toEqual(logBefore.rows.map((r) => r.file_path));
  }, 60000);

  test('an invalid plan fails validation WITHOUT mutating canon', async () => {
    // Sentinel pre-existing canon that must remain untouched.
    const sentinel = await oltpPool.query<{ title: string }>(
      'SELECT title FROM mysteries WHERE id = $1::uuid',
      [MISSION_ID],
    );
    expect(sentinel.rows).toHaveLength(1); // left by the success tests above

    const badPlan = buildMissionTemplatePlan({
      name: 'M43 Bad Mission',
      slug: 'm43_pipeline_bad',
      // XSS payload must trip checkForXSS during validation.
      description: 'Steal data <script>alert(1)</script> from the terminal.',
    });
    badPlan.items[0].id = BAD_MISSION_ID;

    const result = await executePlan(badPlan);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.validationErrors)).toMatch(/XSS/i);

    // Rolled back off disk — no ghost files.
    await expect(
      fs.access(path.join(contentDir, 'missions', 'm43_pipeline_bad', 'mission_m43_pipeline_bad.yaml')),
    ).rejects.toThrow();

    // No canon mutation: no row for the rejected entity, sentinel unchanged.
    const badRow = await oltpPool.query('SELECT id FROM mysteries WHERE id = $1::uuid', [BAD_MISSION_ID]);
    expect(badRow.rows).toHaveLength(0);
    const sentinelAfter = await oltpPool.query<{ title: string }>(
      'SELECT title FROM mysteries WHERE id = $1::uuid',
      [MISSION_ID],
    );
    expect(sentinelAfter.rows[0].title).toBe(sentinel.rows[0].title);
  }, 60000);
});
