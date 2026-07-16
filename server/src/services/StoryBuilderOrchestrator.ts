import { ContentPlanSchema, type VerificationReport } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { migrateContent } from '../content/migrate.js';
import { ContentPlanService } from './ContentPlanService.js';
import { publishChosenDrafts } from './AssetPublishService.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { verifyPlanCrossReferences } from './PlanVerificationService.js';
import {
  executePlan,
  previewPlan,
  stagePlan,
} from './StoryBuilderPlanOps.js';
import type {
  ExecutionResult,
  PreviewResult,
  StagingResult,
} from './StoryBuilderPlanOps.js';

export {
  executePlan,
  previewPlan,
  stagePlan,
};
export type {
  ExecutionResult,
  PreviewResult,
  StagingResult,
};

export interface MigrationResult {
  success: boolean;
  migrationResult: any;
  error?: string;
}

export interface SolidifyResult {
  success: boolean;
  status: 'approved' | 'staged' | 'migrated' | 'verified' | 'failed';
  stage?: StagingResult;
  publish?: import('./AssetPublishService.js').PublishResult;
  migration?: MigrationResult;
  verificationReport?: VerificationReport;
  error?: string;
}

export async function migrateStagedPlan(planId: string): Promise<MigrationResult> {
  try {
    const result = await queryOLTP<{ plan_json: any; status: string }>(
      'SELECT plan_json, status FROM content_plans WHERE id = $1',
      [planId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (result.rows[0].status !== 'staged' && result.rows[0].status !== 'approved') {
      throw new Error(`Plan must be staged before migration. Current status: ${result.rows[0].status}`);
    }

    const contentDir = resolveContentDir();

    const migrationResult = await migrateContent(contentDir);

    const newStatus = migrationResult.success ? 'migrated' : 'failed';
    await queryOLTP(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, planId]
    );

    return {
      success: migrationResult.success,
      migrationResult,
      error: migrationResult.success ? undefined : migrationResult.errors.join('; '),
    };
  } catch (error: any) {
    try {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId]
      );
    } catch { /* ignore */ }

    return {
      success: false,
      migrationResult: null,
      error: error.message,
    };
  }
}

/**
 * Single-click "Approve & Solidify".
 *
 * Collapses the happy path (describe → review → stage → migrate → verify) into
 * one call. The intermediate `staged` / `migrated` / `verified` statuses become
 * an audit trail on the `content_plans` row rather than user-facing buttons.
 *
 * Sequence: lock → stage → publish chosen drafts → migrate → verify, flipping
 * the plan status at each step and recording `failed` (with partial state) if
 * any stage throws or returns unsuccessfully, so the user can re-trigger the
 * remaining steps manually.
 */
export async function approveAndSolidifyPlan(planId: string): Promise<SolidifyResult> {
  const load = await queryOLTP<{ plan_json: any; status: string }>(
    'SELECT plan_json, status FROM content_plans WHERE id = $1',
    [planId],
  );
  if (load.rows.length === 0) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const currentStatus = load.rows[0].status;
  if (currentStatus !== 'proposed' && currentStatus !== 'approved') {
    throw new Error(`Plan must be 'proposed' or 'approved' to approve. Current: ${currentStatus}`);
  }

  const plan = ContentPlanSchema.parse(load.rows[0].plan_json);

  // 1. Lock the plan (no more refinement).
  await ContentPlanService.setStatus(planId, 'approved');

  // 2. Stage — write YAML + lore + prompt files to disk.
  const stageResult = await stagePlan(plan);
  if (!stageResult.success) {
    await ContentPlanService.setStatus(planId, 'failed');
    return { success: false, status: 'failed', stage: stageResult, error: stageResult.error ?? 'Staging failed' };
  }
  await ContentPlanService.setStatus(planId, 'staged');

  // 3. Publish chosen drafts — upload to MinIO, tag portrait_urls label:'dev'.
  const publishResult = await publishChosenDrafts(planId);
  if (!publishResult.success) {
    await ContentPlanService.setStatus(planId, 'failed');
    return {
      success: false,
      status: 'failed',
      stage: stageResult,
      publish: publishResult,
      error: 'Asset publish failed',
    };
  }

  // 4. Migrate to the database.
  const migrationResult = await migrateStagedPlan(planId);
  if (!migrationResult.success) {
    await ContentPlanService.setStatus(planId, 'failed');
    return {
      success: false,
      status: 'failed',
      stage: stageResult,
      publish: publishResult,
      migration: migrationResult,
      error: migrationResult.error,
    };
  }
  // migrateStagedPlan() already sets status='migrated' on success.

  // 5. Verify cross-references.
  const verificationReport = await verifyPlan(planId);
  if (!verificationReport.passed) {
    await ContentPlanService.setStatus(planId, 'failed');
    await queryOLTP(
      'UPDATE content_plans SET verification_report = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(verificationReport), planId],
    );
    return {
      success: false,
      status: 'failed',
      stage: stageResult,
      publish: publishResult,
      migration: migrationResult,
      verificationReport,
      error: verificationReport.errors[0] || 'Verification failed',
    };
  }

  await ContentPlanService.setStatus(planId, 'verified');
  await queryOLTP(
    'UPDATE content_plans SET verification_report = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(verificationReport), planId],
  );

  return {
    success: true,
    status: 'verified',
    stage: stageResult,
    publish: publishResult,
    migration: migrationResult,
    verificationReport,
  };
}

/**
 * Verify a migrated plan's cross-references.
 * Loads the plan from DB, runs all cross-reference checks, and returns the report.
 */
export async function verifyPlan(planId: string): Promise<VerificationReport> {
  const result = await queryOLTP<{ plan_json: any; status: string }>(
    'SELECT plan_json, status FROM content_plans WHERE id = $1',
    [planId],
  );

  if (result.rows.length === 0) {
    throw new Error(`Plan not found: ${planId}`);
  }

  if (result.rows[0].status !== 'migrated') {
    throw new Error(`Plan must be migrated before verification. Current status: ${result.rows[0].status}`);
  }

  const plan = ContentPlanSchema.parse(result.rows[0].plan_json);
  const contentDir = resolveContentDir();

  return verifyPlanCrossReferences(plan, contentDir);
}
