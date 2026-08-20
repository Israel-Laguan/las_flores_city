import { queryOLTP } from '@las-flores/infra';
import { contentPlanService } from '../services/ContentPlanService.js';
import { stagePlan } from '../services/StoryBuilderOrchestrator.js';
import {
  generateLocalDrafts,
  listLocalAssets,
  resolveEntityRootDir,
  writeAssetPathsToYaml,
  autoSelectDefaultDrafts,
} from '../services/LocalDraftService.js';
import { markDrafted, markChosen } from '../services/AssetNeedsService.js';
import { createLLMProvider } from '../services/LLMService.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { resolveContentDir } from '../services/StoryBuilderLore.js';
import { graphIntakeService } from '../services/GraphIntakeService.js';
import { isNeo4jEnabled } from '../services/Neo4jClient.js';

export interface StagingOutcome {
  plan: ContentPlan;
  success: boolean;
  error?: string;
}

// Loads a plan by id, atomically claiming it by transitioning from an allowed
// status into `staging`. This prevents concurrent stage/retry/approve operations
// from racing and overwriting each other's lifecycle state.
export async function loadPlanForStaging(
  id: string,
  allowedStatuses: string[],
): Promise<{ plan: ContentPlan; error?: { status: number; message: string } }> {
  const result = await queryOLTP<{ plan_json: any; status: string }>(
    `UPDATE content_plans
     SET status = 'staging', updated_at = NOW()
     WHERE id = $1 AND status = ANY($2::text[])
     RETURNING plan_json, status`,
    [id, allowedStatuses],
  );

  if (result.rows.length === 0) {
    const current = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1',
      [id],
    );
    const currentStatus = current.rows[0]?.status;
    return {
      plan: null as any,
      error: {
        status: currentStatus ? 400 : 404,
        message: currentStatus
          ? `Plan must be ${allowedStatuses.join(' or ')} before staging. Current status: ${currentStatus}`
          : 'Plan not found',
      },
    };
  }

  try {
    return { plan: ContentPlanSchema.parse(result.rows[0].plan_json) };
  } catch {
    // Graph-authored plans persist an empty plan_json until export; synthesize
    // a legacy ContentPlan from the graph deltas so staging can proceed.
    if (isNeo4jEnabled()) {
      try {
        const synthesized = await graphIntakeService.synthesizeLegacyPlan(id);
        if (synthesized) return { plan: synthesized };
      } catch {
        /* fall through to the validation error below */
      }
    }
    return { plan: null as any, error: { status: 400, message: 'Stored plan failed schema validation' } };
  }
}

// Runs LLM staging and the non-fatal local auto-draft generation, persisting
// results back to the database.
export async function runStagingPipeline(plan: ContentPlan, id: string): Promise<StagingOutcome> {
  const provider = createLLMProvider();
  const context = await contentPlanService.gatherContext();
  const stagingResult = await stagePlan(plan, { provider, context, planId: id });

  if (!stagingResult.success) {
    return { plan, success: false, error: stagingResult.error };
  }

  await queryOLTP('UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2', [plan, id]);

  const contentDir = resolveContentDir();
  try {
    for (const item of plan.items) {
      const pendingNeeds = item.assetNeeds.filter((n) => n.status === 'pending');
      if (pendingNeeds.length === 0) continue;

      const entityRoot = resolveEntityRootDir(item, contentDir);
      await generateLocalDrafts(item, entityRoot, 1);

      const assets = await listLocalAssets(entityRoot);
      if (assets.length > 0) {
        const firstDraft = assets[0].filename;
        for (const need of pendingNeeds) {
          markDrafted(need);
        }
        if (!(item.fields as any).asset_paths) (item.fields as any).asset_paths = {};
        for (const need of pendingNeeds) {
          const assetFieldName = need.targetField.split('.').pop()!;
          (item.fields as any).asset_paths[assetFieldName] = firstDraft;
          markChosen(need);
        }
        await writeAssetPathsToYaml(item, entityRoot, contentDir);
      }
    }
    await autoSelectDefaultDrafts(plan, contentDir);

    await queryOLTP('UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2', [plan, id]);
  } catch (err: any) {
    console.warn(`[story-builder] Auto-draft generation failed (non-fatal): ${err.message}`);
  }

  return { plan, success: true };
}
