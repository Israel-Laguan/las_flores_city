// ============================================================
// ConflictDetector — integration tests (M25, §15.6)
//
// Verifies bounded, neighborhood-scoped conflict detection:
//   * `location_conflict` — a character home district vs the district of a
//     scene that references them (bounded to the plan's neighborhood)
//   * `lineage_conflict`  — two characters claiming the same exclusive
//     relationship slot to the same target
//   * `checkedScope` is recorded honestly (what did we actually check?)
//   * a `conflict_reports` row is persisted for the plan
//
// Uses dedicated synthetic UUIDs + a self-owned test user/plan, cleaned up in
// afterAll (AGENTS.md isolation rules).
// ============================================================

import { withSchemaLock } from '../helpers/schemaLock.js';
import { queryOLTP, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { conflictDetector } from '../../src/services/ConflictDetector.js';
import type { ContentPlan } from '@las-flores/shared';

// --- Dedicated synthetic IDs (collision-avoidance per AGENTS.md) ---
const TEST_USER_ID = 'd0000000-0000-4000-8000-0000000000cd';
const TEST_PLAN_ID = 'd0000000-1111-4111-8111-0000000000cd';
const CHARACTER_ID = 'd0000000-2222-4111-8111-0000000000c1';

function makePlan(items: Array<Record<string, any>>): ContentPlan {
  return {
    id: TEST_PLAN_ID,
    description: 'M25 conflict-detector integration plan',
    status: 'draft',
    links: [],
    _meta: {},
    items: items as any,
  };
}

const item = (overrides: Record<string, any>): Record<string, any> => ({
  id: crypto.randomUUID(),
  type: 'character',
  action: 'create',
  name: 'Character',
  slug: 'character',
  fields: {},
  assetNeeds: [],
  dependsOn: [],
  ...overrides,
});

describe('ConflictDetector (bounded, neighborhood-scoped)', () => {
  beforeAll(async () => {
    // Ensure the M25 `conflict_reports` table exists. Inline single-statement
    // DDL (same pattern as aftermath.worker.test.ts) so it works regardless of
    // whether the migration runner has applied 069 yet.
    await withSchemaLock(async (client) => {
      await client.query(
        `CREATE TABLE IF NOT EXISTS conflict_reports (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           plan_id UUID REFERENCES content_plans(id) ON DELETE CASCADE,
           patch_id UUID REFERENCES patches(id) ON DELETE SET NULL,
           checked_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
           findings JSONB NOT NULL DEFAULT '[]'::jsonb,
           passed BOOLEAN NOT NULL DEFAULT TRUE,
           created_at TIMESTAMPTZ DEFAULT NOW()
         )`,
      );
    });

    // Self-owned test user + plan (FK targets for conflict_reports).
    await queryOLTP(
      `INSERT INTO users (id, username, email, display_name, password_hash)
       VALUES ($1, 'conflict_detector_t', 'conflict_detector_t@example.com', 'Conflict Detector', 'x')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID],
    );

    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status, created_by)
       VALUES ($1, 'M25 conflict-detector integration', '{}'::jsonb, 'draft', $2)
       ON CONFLICT (id) DO NOTHING`,
      [TEST_PLAN_ID, TEST_USER_ID],
    );
  });

  afterAll(async () => {
    await queryOLTP(`DELETE FROM conflict_reports WHERE plan_id = $1`, [TEST_PLAN_ID]).catch(() => {});
    await queryOLTP(`DELETE FROM content_plans WHERE id = $1`, [TEST_PLAN_ID]).catch(() => {});
    await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]).catch(() => {});
    await closeConnections();
    await closeRedis();
  });

  test('flags a location_conflict when a character home district differs from a scene referencing them', async () => {
    const scene = item({
      id: 'd0000000-3333-4111-8111-0000000000c2',
      type: 'scene',
      name: 'Dockside Bar',
      slug: 'dockside_bar',
      entity_id: CHARACTER_ID,
      fields: { district: 'Port District', characters: ['Marcus'] },
    });
    const character = item({
      id: 'd0000000-4444-4111-8111-0000000000c3',
      name: 'Marcus',
      slug: 'marcus',
      entity_id: CHARACTER_ID,
      fields: { district: 'North District' },
    });

    const plan = makePlan([scene, character]);
    const report = await conflictDetector.detectConflicts(plan);

    const location = report.findings.filter((f) => f.rule === 'location_conflict');
    expect(location.length).toBe(1);
    expect(location[0].severity).toBe('warning');
    expect(location[0].description).toContain('North District');
    expect(location[0].description).toContain('Port District');

    // Checked scope is recorded honestly and includes both entities.
    const locScope = report.checkedScopes.find((s) => s.rule === 'location_conflict');
    expect(locScope).toBeDefined();
    expect(locScope!.entityIdsChecked).toContain(CHARACTER_ID);

    // Report is persisted.
    const persisted = await queryOLTP<any>(
      `SELECT id FROM conflict_reports WHERE plan_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [TEST_PLAN_ID],
    );
    expect(persisted.rows.length).toBe(1);
  });

  test('flags a lineage_conflict when two characters claim the same exclusive slot', async () => {
    const plan = makePlan([
      item({ id: 'd0000000-5555-4111-8111-0000000000c4', name: 'Alicia', slug: 'alicia', fields: { relationships: [{ type: 'spouse', name: 'Marcus' }] } }),
      item({ id: 'd0000000-6666-4111-8111-0000000000c15', name: 'Beatriz', slug: 'beatriz', fields: { relationships: [{ type: 'spouse', name: 'Marcus' }] } }),
    ]);

    const report = await conflictDetector.detectConflicts(plan);

    const lineage = report.findings.filter((f) => f.rule === 'lineage_conflict');
    expect(lineage.length).toBe(1);
    expect(lineage[0].severity).toBe('error');
    expect(lineage[0].description).toContain('spouse');
    expect(lineage[0].description).toContain('Marcus');

    const scope = report.checkedScopes.find((s) => s.rule === 'lineage_conflict');
    expect(scope).toBeDefined();
  });

  test('records a clean checked scope when no conflicts are present', async () => {
    const plan = makePlan([
      item({ id: 'd0000000-7777-4111-8111-0000000000c16', name: 'Carla', slug: 'carla', fields: { district: 'Port District' } }),
      item({ id: 'd0000000-8888-4111-8111-0000000000c17', type: 'scene', name: 'Harbor', slug: 'harbor', fields: { district: 'Port District', characters: ['Carla'] } }),
    ]);

    const report = await conflictDetector.detectConflicts(plan);

    expect(report.findings.length).toBe(0);
    // Checked scope reflects exactly what was checked for each rule.
    expect(report.checkedScopes.length).toBeGreaterThan(0);
    for (const scope of report.checkedScopes) {
      expect(typeof scope.scopeDescriptor).toBe('string');
      expect(Array.isArray(scope.entityIdsChecked)).toBe(true);
    }
  });
});