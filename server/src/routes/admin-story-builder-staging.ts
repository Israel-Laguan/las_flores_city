import path from 'node:path';
import { queryOLTP } from '../database/connection.js';
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

export interface StagingOutcome {
  plan: ContentPlan;
  success: boolean;
  error?: string;
}

// Loads a plan by id, guarding on the allowed current status, and parses it.
export async function loadPlanForStaging(
  id: string,
  allowedStatuses: string[],
): Promise<{ plan: ContentPlan; error?: { status: number; message: string } }> {
  const result = await queryOLTP<{ plan_json: any; status: string }>(
    'SELECT plan_json, status FROM content_plans WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) {
    return { plan: null as any, error: { status: 404, message: 'Plan not found' } };
  }

  const currentStatus = result.rows[0].status;
  if (!allowedStatuses.includes(currentStatus)) {
    return {
      plan: null as any,
      error: {
        status: 400,
        message: `Plan must be ${allowedStatuses.join(' or ')} before staging. Current status: ${currentStatus}`,
      },
    };
  }

  try {
    return { plan: ContentPlanSchema.parse(result.rows[0].plan_json) };
  } catch {
    return { plan: null as any, error: { status: 400, message: 'Stored plan failed schema validation' } };
  }
}

// Runs LLM staging and the non-fatal local auto-draft generation, persisting
// results back to the database.
export async function runStagingPipeline(plan: ContentPlan, id: string): Promise<StagingOutcome> {
  const provider = createLLMProvider();
  const context = await contentPlanService.gatherContext();
  const stagingResult = await stagePlan(plan, { provider, context });

  if (!stagingResult.success) {
    return { plan, success: false, error: stagingResult.error };
  }

  await queryOLTP('UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2', [plan, id]);

  const contentDir = path.resolve(process.cwd(), 'content');
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
