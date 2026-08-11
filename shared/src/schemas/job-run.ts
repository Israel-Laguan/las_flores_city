import { z } from 'zod';
import { zodUuid } from './uuid.js';

/**
 * Job-run tracking for the intake-worker (Milestone 22 — durable, resumable,
 * idempotent jobs). Mirrors the `job_runs` OLTP table.
 *
 * `committedStages` is the idempotency guard: stages whose commit has already
 * been persisted. A resumed run consults it so it never re-applies an
 * already-committed stage (no double-apply on retry).
 */
export const JobRunSchema = z.object({
  id: zodUuid(),
  planId: zodUuid(),
  jobType: z.enum(['solidify', 'plan_fill', 'asset_generation']),
  status: z.enum(['running', 'resumable', 'succeeded', 'failed']).default('running'),
  attempt: z.number().int().min(1).default(1),
  maxAttempts: z.number().int().min(1).default(3),
  stage: z.string().optional(),
  committedStages: z.array(z.string()).default([]),
  partialResult: z.unknown().optional(),
  error: z.string().optional(),
  nextRetryAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JobRun = z.infer<typeof JobRunSchema>;