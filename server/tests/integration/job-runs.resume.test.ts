import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';
import {
  startJobRun,
  commitStage,
  hasCommittedStage,
  nextAttempt,
  markOrphanedResumable,
  getJobRun,
} from '../../src/services/JobRunService.js';

const TEST_PLAN_ID = 'e0000000-e29b-41d4-a716-446655440099';
const TEST_USER_ID = 'e0000000-e29b-41d4-a716-446655440098';

async function cleanUp() {
  await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
  await queryOLTP('DELETE FROM content_plans WHERE id = $1', [TEST_PLAN_ID]);
}

beforeAll(async () => {
  await withSchemaLock(async () => {
    // Ensure job_runs table exists (idempotent)
    await queryOLTP(`
      CREATE TABLE IF NOT EXISTS job_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id UUID REFERENCES content_plans(id) ON DELETE CASCADE,
        job_type TEXT NOT NULL CHECK (job_type IN ('solidify', 'plan_fill', 'asset_generation')),
        status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'resumable', 'succeeded', 'failed')),
        attempt INTEGER NOT NULL DEFAULT 1,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        stage TEXT,
        committed_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
        partial_result JSONB,
        error TEXT,
        next_retry_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await queryOLTP('CREATE INDEX IF NOT EXISTS idx_job_runs_plan ON job_runs(plan_id, job_type)');
    await queryOLTP('CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status)');
  });

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
