import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { queryOLTP, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';
import {
  startJobRun,
  commitStage,
  hasCommittedStage,
  nextAttempt,
  markOrphanedResumable,
  getJobRun,
} from '../../src/services/JobRunService.js';

// Dedicated synthetic UUIDs reserved for this suite. They must not collide with
// seed data or with fixtures in other integration suites.
const TEST_PLAN_ID = 'e0000000-e29b-41d4-a716-446655440099';

async function cleanUp() {
  await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
  await queryOLTP('DELETE FROM content_plans WHERE id = $1', [TEST_PLAN_ID]);
}

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  // Run on the locked client so the DDL actually executes under the advisory
  // lock (a separate pool connection via queryOLTP would not be). No catch:
  // migrations 047/062 are fully idempotent (CREATE ... IF NOT EXISTS), so any
  // thrown error is a genuine connection/syntax failure that must not be swallowed.
  await withSchemaLock(async (client) => {
    await client.query(sql);
  });
}

beforeAll(async () => {
  await applyMigration('047_content_plans.sql');
  await applyMigration('062_job_runs.sql');
  await applyMigration('074_job_runs_run_token.sql');

  await cleanUp();
  await queryOLTP(
    `INSERT INTO content_plans (id, description, plan_json, status)
     VALUES ($1, 'test plan', '{}'::jsonb, 'staged')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_PLAN_ID],
  );
});

afterAll(async () => {
  await cleanUp();
});

describe('job_runs resume integration', () => {
  beforeEach(async () => {
    await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
  });

  it('commitStage guards against double-apply', async () => {
    const run = await startJobRun(TEST_PLAN_ID, 'solidify');
    await commitStage(run.id, 'staging');
    await commitStage(run.id, 'staging');
    const after = await getJobRun(TEST_PLAN_ID, 'solidify');
    expect(after!.committedStages).toEqual(['staging']);
  });

  it('hasCommittedStage returns true for committed stages', async () => {
    const run = await startJobRun(TEST_PLAN_ID, 'solidify');
    await commitStage(run.id, 'staging');
    await commitStage(run.id, 'migrated');
    expect(await hasCommittedStage(TEST_PLAN_ID, 'solidify', 'staging')).toBe(true);
    expect(await hasCommittedStage(TEST_PLAN_ID, 'solidify', 'migrated')).toBe(true);
    expect(await hasCommittedStage(TEST_PLAN_ID, 'solidify', 'verified')).toBe(false);
  });

  it('nextAttempt increments attempt with backoff delay', async () => {
    await startJobRun(TEST_PLAN_ID, 'plan_fill');
    const adv = await nextAttempt(TEST_PLAN_ID, 'plan_fill');
    expect(adv.exhausted).toBe(false);
    expect(adv.delayMs).toBeGreaterThan(0);
    const run = await getJobRun(TEST_PLAN_ID, 'plan_fill');
    expect(run!.attempt).toBe(2);
    expect(run!.status).toBe('running');
  });

  it('nextAttempt exhausts after maxAttempts', async () => {
    await startJobRun(TEST_PLAN_ID, 'solidify', { maxAttempts: 2 });
    await nextAttempt(TEST_PLAN_ID, 'solidify'); // attempt -> 2
    const adv = await nextAttempt(TEST_PLAN_ID, 'solidify'); // exhausted
    expect(adv.exhausted).toBe(true);
    const run = await getJobRun(TEST_PLAN_ID, 'solidify');
    expect(run!.status).toBe('failed');
  });

  it('markOrphanedResumable flips running jobs and returns them', async () => {
    await startJobRun(TEST_PLAN_ID, 'solidify');
    const orphaned = await markOrphanedResumable();
    expect(orphaned.some(o => o.planId === TEST_PLAN_ID && o.jobType === 'solidify')).toBe(true);
    const run = await getJobRun(TEST_PLAN_ID, 'solidify');
    expect(run!.status).toBe('resumable');
  });
});
