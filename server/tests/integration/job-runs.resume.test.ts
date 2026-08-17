import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { queryOLTP, closeConnections, deleteCache } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';
import {
  startJobRun,
  commitStage,
  hasCommittedStage,
  nextAttempt,
  markOrphanedResumable,
  getJobRun,
  getJobRunById,
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
  await applyMigration('049_content_plans_verified.sql');
  await applyMigration('050_content_plans_verification.sql');
  await applyMigration('055_content_plans_async.sql');
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

  it.each(['staged'])(
    'legacy no-token resume also flips a mid-pipeline %s plan to failed',
    async (midStatus) => {
      // A crash after solidify commits `staged` strands the plan there (the
      // retry route only accepts `failed`). The no-token resume rejection must
      // still flip this mid-pipeline status terminal.
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
    // The ownership guard's reachable protection: resumeSolidify first reads the
    // NEWEST solidify run for the plan. If a newer run has since started and is
    // `running`, getJobRun returns it (non-resumable) and resumeSolidify
    // short-circuits — so the newer run is never failed and its `staging` plan
    // status is preserved. (The in-flight race — a newer run inserted between
    // the read and the write — is additionally covered by the plan-row lock +
    // ownership subquery inside resumeSolidify, which no-ops the write when the
    // legacy run is no longer the latest.)
    await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status)
       VALUES ($1, 'resume-legacy', '{}'::jsonb, 'staging')
       ON CONFLICT (id) DO UPDATE SET status = 'staging', plan_json = '{}'::jsonb`,
      [TEST_PLAN_ID],
    );
    await deleteCache(`${JOB_CACHE_PREFIX}${TEST_PLAN_ID}`);

    // Legacy resumable run (no run_token) created FIRST.
    await queryOLTP(
      `INSERT INTO job_runs (plan_id, job_type, status, attempt, max_attempts, run_token)
       VALUES ($1, 'solidify', 'resumable', 1, 3, NULL)`,
      [TEST_PLAN_ID],
    );
    // A NEWER solidify run starts and now owns the plan (it is the latest run).
    const newer = await startJobRun(TEST_PLAN_ID, 'solidify', { runToken: 'f0000000-e29b-41d4-a716-4466554400aa' });

    // getJobRun must now return the NEWER run, proving the guard's read path.
    const readByResume = await getJobRun(TEST_PLAN_ID, 'solidify');
    expect(readByResume!.id).toBe(newer.id);

    await resumeSolidify(TEST_PLAN_ID);

    // The newer run is never failed by the stale legacy resume, and its plan
    // status is preserved (not clobbered to `failed`).
    const newerRun = await getJobRunById(newer.id);
    expect(newerRun!.status).toBe('running');
    const plan = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1', [TEST_PLAN_ID],
    );
    expect(plan.rows[0].status).toBe('staging');

    // The older legacy resumable run is left untouched (still resumable), since
    // resumeSolidify only ever acts on the newest run.
    const legacy = await getJobRun(TEST_PLAN_ID, 'solidify');
    expect(legacy!.id).toBe(newer.id);
  });

  it('legacy resume does not flip plan after a newer approve committed pending + run', async () => {
    // Regression for the cubic finding: when an approval has committed `pending`
    // AND inserted its newer job_runs row (both under the content_plans row lock
    // in approveAndSolidifyPlan), a concurrent legacy resume that takes the same
    // row lock must observe the NEWER run as latest and no-op instead of flipping
    // the plan to a terminal `failed`. Previously the run row was inserted OUTSIDE
    // the lock, leaving a window where the plan was `pending` but the old run was
    // still the latest — letting the legacy resume clobber it to `failed` and
    // block /verify. This test pins the serialized invariant.
    await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
    // Plan left `staged` by the old resumable run (the state a legacy resume
    // would normally flip to `failed`).
    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status)
       VALUES ($1, 'resume-legacy', '{}'::jsonb, 'staged')
       ON CONFLICT (id) DO UPDATE SET status = 'staged', plan_json = '{}'::jsonb`,
      [TEST_PLAN_ID],
    );
    await deleteCache(`${JOB_CACHE_PREFIX}${TEST_PLAN_ID}`);

    // OLD legacy resumable run created FIRST (no run_token, the stale one a
    // legacy resume would act on).
    await queryOLTP(
      `INSERT INTO job_runs (plan_id, job_type, status, attempt, max_attempts, run_token)
       VALUES ($1, 'solidify', 'resumable', 1, 3, NULL)`,
      [TEST_PLAN_ID],
    );
    // NEWER run now owns the plan (this is exactly what approveAndSolidifyPlan
    // inserts under the row lock: status running, carrying the fresh run_token,
    // and the plan is `pending`/`staging`).
    const newer = await startJobRun(TEST_PLAN_ID, 'solidify', { runToken: 'f0000000-e29b-41d4-a716-4466554400bb' });
    // The approve also sets the plan to `pending` (nonterminal, owned by newer).
    await queryOLTP('UPDATE content_plans SET status = $1 WHERE id = $2', ['pending', TEST_PLAN_ID]);

    await resumeSolidify(TEST_PLAN_ID);

    // The newer run owns the plan, so the legacy resume must be a no-op: the
    // plan stays nonterminal and is NOT clobbered to `failed`.
    const plan = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1', [TEST_PLAN_ID],
    );
    expect(plan.rows[0].status).toBe('pending');

    // The newer run remains alive (not failed by the stale legacy resume).
    const newerRun = await getJobRunById(newer.id);
    expect(newerRun!.status).toBe('running');

    // The old legacy resumable run is untouched (resumeSolidify only ever acts
    // on the newest run; it never flips the older one to failed here).
    const legacy = await getJobRun(TEST_PLAN_ID, 'solidify');
    expect(legacy!.id).toBe(newer.id);
  });

  it('legacy no-token resume flips the plan when its own run is the latest', async () => {
    // Complements the test above: when the legacy resumable run IS the latest
    // solidify run (no newer run exists), the no-token branch reaches the
    // ownership-guarded UPDATE, marks THIS run failed, and flips the stranded
    // plan to `failed`. This proves the guarded write is actually exercised
    // (not a no-op) so the previous test's protection is meaningful.
    await queryOLTP('DELETE FROM job_runs WHERE plan_id = $1', [TEST_PLAN_ID]);
    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status)
       VALUES ($1, 'resume-legacy', '{}'::jsonb, 'staging')
       ON CONFLICT (id) DO UPDATE SET status = 'staging', plan_json = '{}'::jsonb`,
      [TEST_PLAN_ID],
    );
    await deleteCache(`${JOB_CACHE_PREFIX}${TEST_PLAN_ID}`);

    const legacy = await queryOLTP<{ id: string }>(
      `INSERT INTO job_runs (plan_id, job_type, status, attempt, max_attempts, run_token)
       VALUES ($1, 'solidify', 'resumable', 1, 3, NULL)
       RETURNING id`,
      [TEST_PLAN_ID],
    );

    await resumeSolidify(TEST_PLAN_ID);

    const run = await getJobRunById(legacy.rows[0].id);
    expect(run!.status).toBe('failed');
    const plan = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1', [TEST_PLAN_ID],
    );
    expect(plan.rows[0].status).toBe('failed');
  });
});
