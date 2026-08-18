import fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { finiteInt } from '../utils/env.js';
import { createLLMProvider } from './LLMService.js';
import type { LLMProvider, ExistingContentContext, LLMUsage, ExistingLocation } from './types/LLMTypes.js';
import type { IntakeConflictPreview } from '@las-flores/shared';
import { injectAssetNeeds } from './AssetNeedsService.js';
import { generateForPlan } from './LoreGenerator.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { validateAndRepairOutline, generateFallbackPlan, setStatus, updatePlanJson, uuidv4 } from './ContentPlanValidation.js';
import { identityResolver } from './IdentityResolver.js';

export interface PlanWithUsage {
  plan: ContentPlan;
  usage: LLMUsage | null;
}

export class ContentPlanService {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider || createLLMProvider();
  }

  validateAndRepairOutline(plan: ContentPlan, description: string): ContentPlan {
    return validateAndRepairOutline(plan, description);
  }

  private generateFallbackPlan(description: string): ContentPlan {
    return generateFallbackPlan(description);
  }

  async generateLore(item: ContentPlan['items'][number], context: ExistingContentContext): Promise<string> {
    return this.provider.generateLore(item, context);
  }

  /**
   * Surface-level LLM conflict preview (Moment 1). Reuses `gatherContext()`
   * to build the `ExistingContentContext` — no new data plumbing. Advisory only.
   */
  async analyzeIntakeConflicts(plan: ContentPlan): Promise<{ conflicts: IntakeConflictPreview[]; usage: LLMUsage | null }> {
    const context = await this.gatherContext();
    return this.provider.analyzeIntakeConflicts(plan, context);
  }

  /**
   * Set the status of a content plan. The DB CHECK constraint validates the value.
   * Throws if the plan is not found.
   */
  static async setStatus(planId: string, status: string, client?: import('pg').PoolClient): Promise<void> {
    return setStatus(planId, status, client);
  }

  /**
   * Update the plan_json for a content plan. Used by ContentAssetWorker
   * to persist asset-need status changes. Throws if plan not found.
   */
  static async updatePlanJson(planId: string, planJson: any, client?: import('pg').PoolClient): Promise<void> {
    return updatePlanJson(planId, planJson, client);
  }

  /**
   * Load existing location context from the file-based content store.
   * Locations are a YAML content type under content/districts/<district>/locations/ — there is no
   * `locations` DB table — so we read them directly from disk.
   */
  async gatherLocationContext(): Promise<ExistingLocation[]> {
    const contentDir = resolveContentDir();
    try {
      const files = await glob(`${contentDir}/districts/*/locations/*/*.yaml`, { absolute: true });
      const out: ExistingLocation[] = [];
      for (const file of files) {
        try {
          const raw = await fs.readFile(file, 'utf-8');
          const data: any = yaml.load(raw);
          if (!data || typeof data !== 'object' || !data.id) continue;
          out.push({
            id: String(data.id),
            name: String(data.name ?? ''),
            district: data.district ? String(data.district) : '',
            daytime: data.daytime ? String(data.daytime) : undefined,
            nightlife: data.nightlife ? String(data.nightlife) : undefined,
            history: data.history ? String(data.history) : undefined,
          });
        } catch {
          // skip files that fail to parse
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  async gatherContext(): Promise<ExistingContentContext> {
    const [characters, scenes, dialogues, missions, overlays, locations] = await Promise.all([
      queryOLTP<{ id: string; name: string; role?: string; faction?: string; personality?: string; description?: string }>('SELECT id, name, metadata->>\'role\' as role, metadata->>\'faction\' as faction, metadata->>\'personality\' as personality, description FROM characters ORDER BY name ASC'),
      queryOLTP<{ id: string; name: string; district: string; mood?: string; description?: string }>(
        `SELECT s.id, s.name, COALESCE(d.name, '') AS district, s.mood, s.description
         FROM scenes s LEFT JOIN districts d ON d.id = s.district_id
         ORDER BY s.name ASC`,
      ),
      queryOLTP<{ id: string; name: string }>('SELECT id, name FROM dialogue_trees ORDER BY name ASC'),
      queryOLTP<{ id: string; title: string; description?: string }>('SELECT id, title, description FROM mysteries ORDER BY title ASC'),
      queryOLTP<{ id: string; name: string }>('SELECT id, name FROM dialogue_overlays ORDER BY name ASC'),
      this.gatherLocationContext(),
    ]);

    return {
      characters: characters.rows,
      scenes: scenes.rows,
      dialogues: dialogues.rows,
      missions: missions.rows,
      overlays: overlays.rows,
      locations,
    };
  }

  /**
   * M25 — the dedicated, deterministic identity-resolution pass. Runs after the
   * LLM outline so a name is never silently merged: `IdentityResolver` returns
   * `matched` / `new_candidate` / `ambiguous` per item. Ambiguous items keep
   * `resolution.status === 'ambiguous'` so the admin can pick; a summary count
   * is surfaced on `_meta.identity_summary`.
   */
  private async attachIdentityResolutions(plan: ContentPlan): Promise<void> {
    let resolved: ContentPlan;
    try {
      resolved = await identityResolver.resolvePlanItems(plan);
    } catch (err) {
      // Fail closed (matching prior behavior — an identity failure must not
      // silently ship an un-resolved outline), but name the pass so the admin
      // error is diagnosable instead of a bare DB/Filesystem rejection.
      throw new Error(`Identity resolution pass failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    plan.items = resolved.items;

    let matched = 0;
    let ambiguous = 0;
    let newCandidates = 0;
    for (const item of resolved.items) {
      if (item.resolution?.status === 'matched') matched += 1;
      else if (item.resolution?.status === 'ambiguous') ambiguous += 1;
      // Only genuine new candidates count; items with no resolution status are
      // pre-existing/identity-stable `update` references, not new entities.
      else if (item.resolution?.status === 'new_candidate') newCandidates += 1;
    }
    plan._meta = {
      ...plan._meta,
      identity_summary: { matched, newCandidates, ambiguous },
    };
  }
}

// Export singleton instance
export const contentPlanService = new ContentPlanService();
