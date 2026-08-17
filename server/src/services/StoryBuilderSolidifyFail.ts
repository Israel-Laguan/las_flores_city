// ============================================================
// StoryBuilderSolidify fail-path helpers.
//
// Splits the terminal failure writers out of StoryBuilderSolidify.ts
// to keep that file within the eslint max-lines budget.
// ============================================================
import { type VerificationReport, type HarnessReport } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { setJobStatus } from './StoryBuilderJobStatus.js';
import type { StagingResult, MigrationResult } from './StoryBuilderOrchestrator.js';
import type { PublishResult } from './AssetPublishService.js';
import { emitAdminEvent } from './AdminEventEmitter.js';

async function failWithHarnessReport(
  planId: string,
  harnessReport: HarnessReport,
  userId?: string,
): Promise<void> {
  const blocking = harnessReport.findings.filter(f => f.severity === 'error');
  const message = blocking.map(f => f.message).join('; ');
  const verificationReport: VerificationReport = {
    planId,
    checkedAt: new Date().toISOString(),
    passed: false,
    checks: harnessReport.findings.map(f => ({
      name: f.code,
      description: f.message,
      status: f.severity === 'error' ? 'fail' : 'warn',
      details: f.itemIds,
    })),
    errors: blocking.map(f => f.message),
    warnings: harnessReport.findings.filter(f => f.severity === 'warning').map(f => f.message),
  };
  await queryOLTP(
    'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
    ['failed', JSON.stringify(verificationReport), planId],
  );
  await setJobStatus(planId, {
    status: 'failed',
    verificationReport,
    error: `Validation harness blocked approval: ${message}`,
  });
  emitAdminEvent('plan_failed', { status: 'failed', error: message, harness: harnessReport }, planId, userId);
}

async function failWithVerificationReport(
  planId: string,
  stageResult: StagingResult,
  publishResult: PublishResult,
  migrationResult: MigrationResult,
  verificationReport: VerificationReport,
  userId?: string,
): Promise<void> {
  await queryOLTP(
    'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
    ['failed', JSON.stringify(verificationReport), planId],
  );
  await setJobStatus(planId, {
    status: 'failed',
    stage: stageResult,
    publish: publishResult,
    migration: migrationResult,
    verificationReport,
    error: verificationReport.errors[0] || 'Verification failed',
  });
  const failMessage = verificationReport.errors[0] || 'Verification failed';
  emitAdminEvent('plan_failed', { status: 'failed', error: failMessage }, planId, userId);
}

export { failWithHarnessReport, failWithVerificationReport };
