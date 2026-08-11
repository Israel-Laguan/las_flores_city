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
        .sort((a, b) => b.id.localeCompare(a.id));
      return { rows: matches.slice(0, 1), rowCount: matches.length > 0 ? 1 : 0 };
    }

    if (text.includes('update job_runs')) {
      if (text.includes("status = 'resumable'") && text.includes("status = 'running'")) {
        const matches = Array.from(dbRows.values()).filter(r => r.status === 'running');
        for (const r of matches) r.status = 'resumable';
        return { rows: matches, rowCount: matches.length };
      }
      const jobId = params?.[params.length - 1];
      const row = dbRows.get(jobId);
      if (!row) return { rows: [], rowCount: 0 };

      // Best-effort mutation: if params contains a non-1 number, treat as attempt
      const numParam = params?.find(p => typeof p === 'number' && p !== 1 && p >= 0 && p < 100);
      if (numParam !== undefined) row.attempt = numParam;
      if (params?.includes('succeeded')) row.status = 'succeeded';
      if (params?.includes('failed')) row.status = 'failed';
      if (params?.includes('resumable')) row.status = 'resumable';
      if (params?.includes('running')) row.status = 'running';
      const isoParam = params?.find(p => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(p));
      if (isoParam !== undefined) row.next_retry_at = isoParam;
      const jsonParam = params?.find(p => typeof p === 'string' && (p.startsWith('[') || p.startsWith('{')));
      if (jsonParam !== undefined) {
        try { const parsed = JSON.parse(jsonParam); if (Array.isArray(parsed)) row.committed_stages = parsed; else row.partial_result = parsed; } catch { /* ignore */ }
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
  markOrphanedResumable,
} from '../../src/services/JobRunService.js';

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
});
