import { queryOLTP } from '@las-flores/infra';
import type { JobRun } from '@las-flores/shared';
import { backoffDelayMs } from '../utils/retryBackoff.js';

/**
 * JobRunService (M22) — durable, resumable, idempotent job tracking for the
 * intake-worker.
 *
 * Each background job (solidify / plan_fill / asset_generation) owns a row in
 * `job_runs` that records its attempt budget, the last persisted stage, and a
 * `committedStages` set acting as the idempotency guard for commit primitives.
 * A job that dies mid-stage is left `running`; on restart
 * `markOrphanedResumable()` flips it to `resumable` and the worker's resume
 * entry point re-enters from the last persisted stage (skipping already
 * committed stages via `hasCommittedStage`) instead of from scratch.
 */

export type JobType = 'solidify' | 'plan_fill' | 'asset_generation';
export type JobStatus = 'running' | 'resumable' | 'succeeded' | 'failed';

export type JobRunStage = string;

export interface JobRunPatch {
  status?: JobStatus;
  attempt?: number;
  stage?: string | null;
  committedStages?: string[];
  partialResult?: unknown | null;
  error?: string | null;
  nextRetryAt?: string | null;
}

interface JobRunRow {
  id: string;
  plan_id: string;
  job_type: JobType;
  status: JobStatus;
  attempt: number;
  max_attempts: number;
  stage: string | null;
  committed_stages: string[];
  partial_result: unknown | null;
  error: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: JobRunRow): JobRun {
  return {
    id: row.id,
    planId: row.plan_id,
    jobType: row.job_type,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    stage: row.stage ?? undefined,
    committedStages: Array.isArray(row.committed_stages) ? row.committed_stages : [],
    partialResult: row.partial_result ?? undefined,
    error: row.error ?? undefined,
    nextRetryAt: row.next_retry_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface StartJobRunOptions {
  maxAttempts?: number;
}

/** Create a fresh `running` job run for a plan + job type. Returns the row (with id). */
export async function startJobRun(
  planId: string,
  jobType: JobType,
  opts?: StartJobRunOptions,
): Promise<JobRun> {
  const result = await queryOLTP<JobRunRow>(
    `INSERT INTO job_runs (plan_id, job_type, status, attempt, max_attempts)
     VALUES ($1, $2, 'running', 1, $3)
     RETURNING *`,
    [planId, jobType, opts?.maxAttempts ?? 3],
  );
  return mapRow(result.rows[0]);
}

/** Load a single job run by id. Returns null when not found. */
export async function getJobRunById(jobId: string): Promise<JobRun | null> {
  const result = await queryOLTP<JobRunRow>(
    'SELECT * FROM job_runs WHERE id = $1',
    [jobId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/** Load the most recent job run for a plan + job type (latest attempt). */
export async function getJobRun(planId: string, jobType: JobType): Promise<JobRun | null> {
  const result = await queryOLTP<JobRunRow>(
    `SELECT * FROM job_runs
     WHERE plan_id = $1 AND job_type = $2
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [planId, jobType],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Partially update a job run. Only the provided fields are written; `updated_at`
 * is always bumped. `committedStages` / `partialResult` are serialized as jsonb.
 */
export async function updateJobRun(jobId: string, patch: JobRunPatch): Promise<JobRun | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, value: unknown, jsonb = false) => {
    params.push(value === undefined ? null : value);
    sets.push(`${col} = $${params.length}${jsonb ? '::jsonb' : ''}`);
  };

  if (patch.status !== undefined) push('status', patch.status);
  if (patch.stage !== undefined) push('stage', patch.stage);
  if (patch.committedStages !== undefined) push('committed_stages', JSON.stringify(patch.committedStages), true);
  if (patch.partialResult !== undefined) push('partial_result', JSON.stringify(patch.partialResult), true);
  if (patch.error !== undefined) push('error', patch.error);
  if (patch.nextRetryAt !== undefined) push('next_retry_at', patch.nextRetryAt);

  if (sets.length === 0) return getJobRunById(jobId);

  params.push(jobId);
  const result = await queryOLTP<JobRunRow>(
    `UPDATE job_runs SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING *`,
    params,
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Record that a stage's commit has been persisted (idempotency guard). Appends
 * the stage to `committedStages` only if not already present — so a resumed run
 * never re-applies an already-committed stage.
 */
export async function commitStage(jobId: string, stage: JobRunStage): Promise<JobRun | null> {
  const run = await getJobRunById(jobId);
  if (!run) return null;
  if (run.committedStages.includes(stage)) return run;
  return updateJobRun(jobId, { committedStages: [...run.committedStages, stage] });
}

/** Read-only guard: has the given stage already been committed for this plan/job? */
export async function hasCommittedStage(
  planId: string,
  jobType: JobType,
  stage: JobRunStage,
): Promise<boolean> {
  const run = await getJobRun(planId, jobType);
  return run ? run.committedStages.includes(stage) : false;
}

/**
 * Advance to the next attempt with exponential backoff. Returns the delay to
 * sleep before re-running, or `exhausted: true` when the attempt budget is spent
 * (the run is marked `failed`).
 */
export async function nextAttempt(
  planId: string,
  jobType: JobType,
  opts?: { maxAttempts?: number },
): Promise<{ exhausted: boolean; delayMs?: number }> {
  const run = await getJobRun(planId, jobType);
  if (!run) {
    return { exhausted: true };
  }
  const maxAttempts = opts?.maxAttempts ?? run.maxAttempts;
  if (run.attempt >= maxAttempts) {
    await updateJobRun(run.id, { status: 'failed' });
    return { exhausted: true };
  }
  const nextNum = run.attempt + 1;
  const delayMs = backoffDelayMs(nextNum);
  await updateJobRun(run.id, {
    attempt: nextNum,
    status: 'running',
    error: null,
    nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
  });
  return { exhausted: false, delayMs };
}

/**
 * Startup recovery: flip every `running` job run to `resumable` so workers can
 * resume from their last persisted stage instead of being reset to failed.
 * Returns the orphaned runs (plan_id + job_type) for dispatch.
 */
export async function markOrphanedResumable(): Promise<Array<{ planId: string; jobType: JobType }>> {
  const result = await queryOLTP<JobRunRow>(
    `UPDATE job_runs SET status = 'resumable', updated_at = NOW()
     WHERE status = 'running'
     RETURNING plan_id, job_type`,
  );
  return result.rows.map(r => ({ planId: r.plan_id, jobType: r.job_type }));
}