// ============================================================
// StoryBuilderMigration - staged-plan migration + verification
//
// `migrateStagedPlan` flips a staged/approved plan to migrated, and
// `verifyPlan` runs the cross-reference harness on the migrated plan.
// Split out of StoryBuilderSolidify.ts to keep that file within the
// eslint max-lines budget.
// ============================================================

import { ContentPlanSchema, type VerificationReport } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { migrateContent } from '../content/migrate.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { verifyPlanCrossReferences } from './PlanVerificationService.js';
import { recordMigrationCanon } from './RevisionService.js';
import { PlanNotFoundError, PlanStatusError } from './errors.js';
import type { MigrationResult } from './StoryBuilderOrchestrator.js';

/**
 * Migrate a staged/approved plan to the database. Takes ownership of the
 * `migrating` transition here so callers do not flip status before validation.
 */
export async function migrateStagedPlan(planId: string, client?: import('pg').PoolClient, files?: string[], userId?: string): Promise<MigrationResult> {
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
      throw new PlanStatusError(`Plan must be staged or approved before migration. Current status: ${result.rows[0].status}. Use the retry flow to re-stage a failed plan first.`);
    }

    // Take ownership of the migrating transition here so callers do not set
    // status to migrating before this function validates the plan. The UPDATE is
    // conditional on the plan still being staged/approved so two concurrent
    // migration requests cannot both claim the row: exactly one caller observes
    // a rowCount of 1 and proceeds, the loser throws PlanStatusError below.
    const claim = await exec(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2 AND status IN (\'staged\', \'approved\')',
      ['migrating', planId]
    );
    if (claim.rowCount === 0) {
      throw new PlanStatusError(`Plan was already claimed by another migration. Current status: ${result.rows[0].status}`);
    }

    const contentDir = resolveContentDir();

    const migrationResult = await migrateContent(contentDir, files);

    // Propagate migration failure: do not flip to 'migrated' on partial failure.
    if (!migrationResult.success) {
      await exec(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId]
      );

      // M24 audit gap: earlier files may already be committed to canon tables +
      // migration_log, but no patch/canon_revisions row was recorded for them.
      // Record an applied patch + per-entity canon revisions for every file that
      // did succeed (action !== 'skipped' and not in the error list) so a failed
      // migration still has full audit/rollback coverage for the partial canon
      // change. Best-effort: a recording failure must not mask the original
      // migration error.
      try {
        const applied = (migrationResult.appliedMigrations ?? [])
          .filter((m) => m.action === 'created' || m.action === 'updated')
          .map((m) => ({
            contentType: m.contentType,
            contentId: m.contentId,
            action: m.action,
          }));
        if (applied.length > 0) {
          await recordMigrationCanon({
            planId,
            title: `Migrate plan ${planId} (partial)`,
            description: `Snapshot canon produced by content migration for plan ${planId} (partial — migration failed after ${applied.length} file(s) succeeded)`,
            userId,
            appliedMigrations: applied,
          });
        }
      } catch (verr: any) {
        console.warn(`[revision] Could not record partial migration canon for plan ${planId}:`, verr?.message);
      }

      return {
        success: false,
        migrationResult,
        error: migrationResult.errors.join('; '),
      };
    }

    // M24: Record the canon changes produced by this migration as a patch +
    // per-entity canon revisions so rollback is a lookup, not inverse reasoning.
    // Best-effort: a failure to record versioning must not fail the migration.
    try {
      const applied = (migrationResult.appliedMigrations ?? []).map((m) => ({
        contentType: m.contentType,
        contentId: m.contentId,
        action: m.action,
      }));
      await recordMigrationCanon({
        planId,
        title: `Migrate plan ${planId}`,
        description: `Snapshot canon produced by content migration for plan ${planId}`,
        userId,
        appliedMigrations: applied,
      });
    } catch (verr: any) {
      console.warn(`[revision] Could not record migration canon for plan ${planId}:`, verr?.message);
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
    // Permanent validation/claim failures must stay typed so runSolidify's
    // isPermanent check can classify them and preserve plan status. They must be
    // rethrown BEFORE the generic failure-status update: a request for an already
    // migrated plan, or a concurrent request that lost the conditional claim, is
    // NOT a migration failure and must never flip a valid plan to `failed`.
    if (error instanceof PlanNotFoundError || error instanceof PlanStatusError) {
      throw error;
    }

    // Only an attempted migration that reached the generic failure path (an
    // unexpected error) marks the plan `failed`.
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
