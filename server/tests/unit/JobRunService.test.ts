import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const dbRows: Map<string, any> = new Map();
let queryCounter = 0;

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(async (_text: string, params?: any[]) => {
    const text = _text.toLowerCase();

    if (text.includes('insert into job_runs')) {
      const row = {
        id: `job-${++queryCounter}`,
        plan_id: params?.[0],
        job_type: params?.[1],
        status: 'running',
        attempt: 1,
        max_attempts: params?.[2] ?? 3,
        stage: null,
        committed_stages: [],
        partial_result: null,
        error: null,
        next_retry_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      dbRows.set(row.id, row);
      return { rows: [row], rowCount: 1 };
    }

    if (text.includes('select * from job_runs where id')) {
      const row = dbRows.get(params?.[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (text.includes('select * from job_runs') && text.includes('plan_id')) {
      const matches = Array.from(dbRows.values())
        .filter(r => r.plan_id === params?.[0] && r.job_type === params?.[1])
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id.localeCompare(a.id));
      return { rows: matches.slice(0, 1), rowCount: matches.length > 0 ? 1 : 0 };
    }

    if (text.includes('update job_runs')) {
      if (text.includes("status = 'resumable'") && text.includes("status = 'running'")) {
        const matches = Array.from(dbRows.values()).filter(r => r.status === 'running');
        for (const r of matches) r.status = 'resumable';
        return { rows: matches, rowCount: matches.length };
      }
      // commitStage uses a CASE expression that the regex below cannot parse.
      if (text.includes('committed_stages') && text.includes('case')) {
        const jobId = params?.[0];
        const stage = params?.[1];
        const row = dbRows.get(jobId);
        if (!row) return { rows: [], rowCount: 0 };
        if (stage && !row.committed_stages.includes(stage)) {
          row.committed_stages.push(stage);
        }
        row.updated_at = new Date().toISOString();
        return { rows: [row], rowCount: 1 };
      }
      const jobId = params?.[params.length - 1];
      const row = dbRows.get(jobId);
      if (!row) return { rows: [], rowCount: 0 };

      // Map each `SET col = $n` assignment to its positional parameter, so the
      // fake only mutates columns the service really writes.
      for (const [, col, idx] of _text.matchAll(/(\w+)\s*=\s*\$(\d+)/g)) {
        const value = params?.[Number(idx) - 1];
        if (col === 'committed_stages' || col === 'partial_result') {
          row[col] = typeof value === 'string' ? JSON.parse(value) : value;
        } else {
          row[col] = value;
        }
      }
      row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }),
}));

import {
  startJobRun,
  getJobRun,
  getJobRunById,
  updateJobRun,
  commitStage,
  hasCommittedStage,
  nextAttempt,
  markOrphanedResumable,
} from '../../src/services/JobRunService.js';
import { queryOLTP } from '@las-flores/infra';

beforeEach(() => {
  dbRows.clear();
  queryCounter = 0;
  jest.clearAllMocks();
});

describe('JobRunService', () => {
  it('starts a job run with defaults', async () => {
    const run = await startJobRun('plan-1', 'solidify');
    expect(run.planId).toBe('plan-1');
    expect(run.jobType).toBe('solidify');
    expect(run.status).toBe('running');
    expect(run.attempt).toBe(1);
    expect(run.maxAttempts).toBe(3);
    expect(run.committedStages).toEqual([]);
  });

  it('starts a job run with custom maxAttempts', async () => {
    const run = await startJobRun('plan-1', 'plan_fill', { maxAttempts: 5 });
    expect(run.maxAttempts).toBe(5);
  });

  it('getJobRun returns the latest run for a plan+jobType', async () => {
    await startJobRun('plan-a', 'solidify');
    await startJobRun('plan-a', 'solidify');
    const run = await getJobRun('plan-a', 'solidify');
    expect(run).not.toBeNull();
    expect(run!.id).toBe('job-2');
  });

  it('commitStage appends a stage only once', async () => {
    const run = await startJobRun('plan-x', 'solidify');
    await commitStage(run.id, 'staging');
    expect(dbRows.get(run.id).committed_stages).toEqual(['staging']);
    await commitStage(run.id, 'staging');
    expect(dbRows.get(run.id).committed_stages).toEqual(['staging']);
  });

  it('hasCommittedStage returns true for committed stages', async () => {
    const run = await startJobRun('plan-y', 'solidify');
    await updateJobRun(run.id, { committedStages: ['staging', 'migrated'] });
    expect(await hasCommittedStage('plan-y', 'solidify', 'staging')).toBe(true);
    expect(await hasCommittedStage('plan-y', 'solidify', 'verified')).toBe(false);
    expect(await hasCommittedStage('plan-y', 'plan_fill', 'staging')).toBe(false);
  });

  it('nextAttempt increments attempt and applies backoff', async () => {
    const run = await startJobRun('plan-z', 'solidify');
    const adv = await nextAttempt('plan-z', 'solidify');
    expect(adv.exhausted).toBe(false);
    expect(adv.delayMs).toBeGreaterThan(0);
    const updated = dbRows.get(run.id);
    expect(updated.attempt).toBe(2);
    expect(updated.status).toBe('running');
    expect(updated.next_retry_at).toMatch(/^\d{4}-/);
  });

  it('markOrphanedResumable flips running jobs to resumable', async () => {
    await startJobRun('plan-1', 'solidify');
    await startJobRun('plan-2', 'plan_fill');
    const orphaned = await markOrphanedResumable();
    expect(orphaned.length).toBe(2);
    expect(orphaned.some(o => o.planId === 'plan-1' && o.jobType === 'solidify')).toBe(true);
    expect(orphaned.some(o => o.planId === 'plan-2' && o.jobType === 'plan_fill')).toBe(true);
    for (const row of dbRows.values()) {
      expect(row.status).toBe('resumable');
    }
  });

  it('markOrphanedResumable passes a cutoff as a bound param so only pre-existing runs are claimed', async () => {
    await startJobRun('plan-1', 'solidify');
    const cutoff = new Date('2024-01-01T00:00:00.000Z');
    await markOrphanedResumable(cutoff);
    const calls = (queryOLTP as jest.MockedFunction<typeof queryOLTP>).mock.calls;
    const updateCall = calls.find(c => typeof c[0] === 'string' && c[0].includes('UPDATE job_runs SET status'));
    expect(updateCall).toBeDefined();
    expect(updateCall![0] as string).toContain('created_at <= $1');
    expect(updateCall![1]).toEqual([cutoff.toISOString()]);
  });
});
