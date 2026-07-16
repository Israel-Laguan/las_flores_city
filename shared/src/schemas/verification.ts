import { z } from 'zod';

export const CheckResultSchema = z.object({
  name: z.string(),
  description: z.string(),
  status: z.enum(['pass', 'fail', 'warn']),
  details: z.array(z.string()).optional(),
});

export const VerificationReportSchema = z.object({
  planId: z.string().uuid(),
  checkedAt: z.string(),
  passed: z.boolean(),
  checks: z.array(CheckResultSchema),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type CheckResult = z.infer<typeof CheckResultSchema>;
export type VerificationReport = z.infer<typeof VerificationReportSchema>;
