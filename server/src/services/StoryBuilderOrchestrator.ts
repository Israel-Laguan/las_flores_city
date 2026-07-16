import { ContentPlanSchema, type VerificationReport } from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { migrateContent } from '../content/migrate.js';
import { ContentPlanService } from './ContentPlanService.js';
import { publishChosenDrafts } from './AssetPublishService.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { verifyPlanCrossReferences } from './PlanVerificationService.js';
import { PlanNotFoundError, PlanStatusError } from './errors.js';
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

export async function migrateStagedPlan(planId: string, client?: import('pg').PoolClient): Promise<MigrationResult> {
  const exec = (text: string, params: any[]) =>
    client ? client.query<any>(text, params) : queryOLTP<any>(text, params);
  try {
    const result = await exec(
      'SELECT plan_json, status FROM content_plans WHERE id = $1',
      [planId]
    );

    if (result.rows.length === 0) {
      throw new PlanNotFoundError(planId);
    }

    if (result.rows[0].status !== 'staged' && result.rows[0].status !== 'approved') {
      throw new PlanStatusError(`Plan must be staged before migration. Current status: ${result.rows[0].status}`);
    }

    const contentDir = resolveContentDir();

    const migrationResult = await migrateContent(contentDir);

    // Propagate migration failure: do not flip to 'migrated' on partial failure.
    if (!migrationResult.success) {
      await exec(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId]
      );
      return {
        success: false,
        migrationResult,
        error: migrationResult.errors.join('; '),
      };
    }

    const newStatus = 'migrated';
    await exec(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, planId]
    );

    return {
      success: true,
      migrationResult,
      error: undefined,
    };
  } catch (error: any) {
    try {
      await exec(
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
  // Serialize concurrent approve-and-solidify calls per-plan using an
  // advisory lock held for the duration of the transaction. This prevents
  // two requests from racing the SELECT + status flip on the same plan.
  return withOLTPTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [planId]);

    const load = await client.query<{ plan_json: any; status: string }>(
      'SELECT plan_json, status FROM content_plans WHERE id = $1 FOR UPDATE',
      [planId],
    );
    if (load.rows.length === 0) {
      throw new PlanNotFoundError(planId);
    }

    const currentStatus = load.rows[0].status;
    if (currentStatus !== 'proposed' && currentStatus !== 'approved' && currentStatus !== 'failed') {
      throw new PlanStatusError(`Plan must be 'proposed', 'approved', or 'failed' to approve. Current: ${currentStatus}`);
    }

    const plan = ContentPlanSchema.parse(load.rows[0].plan_json);

    try {
      // 1. Lock the plan (no more refinement).
      await ContentPlanService.setStatus(planId, 'approved', client);

      // 2. Stage — write YAML + lore + prompt files to disk.
      const stageResult = await stagePlan(plan);
      if (!stageResult.success) {
        await ContentPlanService.setStatus(planId, 'failed', client);
        return { success: false, status: 'failed', stage: stageResult, error: stageResult.error ?? 'Staging failed' };
      }
      await ContentPlanService.setStatus(planId, 'staged', client);

      // 3. Publish chosen drafts — upload to MinIO, tag portrait_urls label:'dev'.
      const publishResult = await publishChosenDrafts(planId, client);
      if (!publishResult.success) {
        await ContentPlanService.setStatus(planId, 'failed', client);
        return {
          success: false,
          status: 'failed',
          stage: stageResult,
          publish: publishResult,
          error: 'Asset publish failed',
        };
      }

      // 4. Migrate to the database.
      const migrationResult = await migrateStagedPlan(planId, client);
      if (!migrationResult.success) {
        await ContentPlanService.setStatus(planId, 'failed', client);
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
        await client.query(
          'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
          ['failed', JSON.stringify(verificationReport), planId],
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

      await client.query(
        'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
        ['verified', JSON.stringify(verificationReport), planId],
      );

      return {
        success: true,
        status: 'verified',
        stage: stageResult,
        publish: publishResult,
        migration: migrationResult,
        verificationReport,
      };
    } catch (error: any) {
      // Any unexpected throw along the chain leaves the plan in a failed
      // state (within the same transaction) so the user can re-trigger.
      await client.query(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId],
      );
      throw error;
    }
  });
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
    throw new PlanNotFoundError(planId);
  }

  if (result.rows[0].status !== 'migrated') {
    throw new PlanStatusError(`Plan must be migrated before verification. Current status: ${result.rows[0].status}`);
  }

  const plan = ContentPlanSchema.parse(result.rows[0].plan_json);
  const contentDir = resolveContentDir();

  return verifyPlanCrossReferences(plan, contentDir);
}
