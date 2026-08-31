/* eslint-disable max-lines-per-function */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { queryOLTP, deleteCache } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';
import {
  startJobRun,
  commitStage,
  hasCommittedStage,
  nextAttempt,
  markOrphanedResumable,
  getJobRun,
} from '../../src/services/JobRunService.js';
import { resumeSolidify } from '../../src/services/StoryBuilderOrchestrator.js';
import { JOB_CACHE_PREFIX } from '../../src/services/StoryBuilderJobStatus.js';

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
  // migrations 047/062/074 are fully idempotent (CREATE ... IF NOT EXISTS /
  // ADD COLUMN IF NOT EXISTS), so any thrown error is a genuine connection/syntax
  // failure that must not be swallowed.
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

  it('legacy resumable run with no runToken still surfaces a terminal plan status', async () => {
    // A pre-074 resumable run left behind after a crash has no run_token, and the
    // job-status cache has been evicted. resumeSolidify must reject the unguarded
    // resume (newer-run protection) AND record the failure via the DB plan status
    // so the polling endpoint stops reporting a nonterminal `staging`/`migrating`
    // state and the user can retry.
    await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status)
       VALUES ($1, 'resume-legacy', '{}'::jsonb, 'staging')
       ON CONFLICT (id) DO UPDATE SET status = 'staging', plan_json = '{}'::jsonb`,
      [TEST_PLAN_ID],
    );
    // Simulate a cache eviction for this plan's job-status key.
    await deleteCache(`${JOB_CACHE_PREFIX}${TEST_PLAN_ID}`);
    // Insert a legacy resumable run with a NULL run_token (pre-074).
    await queryOLTP(
      `INSERT INTO job_runs (plan_id, job_type, status, attempt, max_attempts, run_token)
       VALUES ($1, 'solidify', 'resumable', 1, 3, NULL)`,
      [TEST_PLAN_ID],
    );

    await resumeSolidify(TEST_PLAN_ID);

    const run = await getJobRun(TEST_PLAN_ID, 'solidify');
    expect(run!.status).toBe('failed');
    const plan = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1', [TEST_PLAN_ID],
    );
    expect(plan.rows[0].status).toBe('failed');
  });

  it.each(['staged', 'migrated'])(
    'legacy no-token resume also flips a mid-pipeline %s plan to failed',
    async (midStatus) => {
      // A crash after solidify commits `staged`/`migrated` strands the plan
      // there (the retry route only accepts `failed`). The no-token resume
      // rejection must still flip these mid-pipeline statuses terminal.
      await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
      await queryOLTP(
        `INSERT INTO content_plans (id, description, plan_json, status)
         VALUES ($1, 'resume-legacy', '{}'::jsonb, $2)
         ON CONFLICT (id) DO UPDATE SET status = $2, plan_json = '{}'::jsonb`,
        [TEST_PLAN_ID, midStatus],
      );
      await deleteCache(`${JOB_CACHE_PREFIX}${TEST_PLAN_ID}`);
      await queryOLTP(
        `INSERT INTO job_runs (plan_id, job_type, status, attempt, max_attempts, run_token)
         VALUES ($1, 'solidify', 'resumable', 1, 3, NULL)`,
        [TEST_PLAN_ID],
      );

      await resumeSolidify(TEST_PLAN_ID);

      const plan = await queryOLTP<{ status: string }>(
        'SELECT status FROM content_plans WHERE id = $1', [TEST_PLAN_ID],
      );
      expect(plan.rows[0].status).toBe('failed');
    },
  );

  it('legacy no-token resume does NOT clobber a newer solidify run', async () => {
    // Simulate the race the ownership guard defends against: the legacy
    // resumable run is the one resumeSolidify reads, but a NEWER solidify run
    // has since been started (e.g. a retry) and advanced the plan. The stale
    // terminal write must no-op because the legacy run is no longer the latest.
    await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status)
       VALUES ($1, 'resume-legacy', '{}'::jsonb, 'staging')
       ON CONFLICT (id) DO UPDATE SET status = 'staging', plan_json = '{}'::jsonb`,
      [TEST_PLAN_ID],
    );
    await deleteCache(`${JOB_CACHE_PREFIX}${TEST_PLAN_ID}`);

    // Legacy resumable run (no run_token), created FIRST.
    const legacy = await queryOLTP<{ id: string }>(
      `INSERT INTO job_runs (plan_id, job_type, status, attempt, max_attempts, run_token)
       VALUES ($1, 'solidify', 'resumable', 1, 3, NULL)
       RETURNING id`,
      [TEST_PLAN_ID],
    );
    // getJobRun reads the legacy row (it is the latest at read time).
    const readByResume = await getJobRun(TEST_PLAN_ID, 'solidify');
    expect(readByResume!.id).toBe(legacy.rows[0].id);

    // A NEWER solidify run starts and owns the plan.
    await startJobRun(TEST_PLAN_ID, 'solidify', { runToken: 'newer-token' });

    // Even though resumeSolidify would flip the legacy run, the plan-status
    // write is bound to the legacy run still being latest — which it is not.
    await resumeSolidify(TEST_PLAN_ID);

    const plan = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1', [TEST_PLAN_ID],
    );
    // The newer run's `staging` status is preserved, not clobbered to `failed`.
    expect(plan.rows[0].status).toBe('staging');
  });
});
