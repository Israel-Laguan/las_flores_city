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
import { chunkDescription, mergeCandidates, buildSynopsisFromCandidates, type EntityCandidate } from './OutlineChunking.js';
import { buildEntityExtractionPrompt } from './LLMPrompts.js';
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

  async parseDescription(description: string): Promise<PlanWithUsage> {
    const context = await this.gatherContext();

    const { plan: rawPlan, usage } = await this.provider.parseDescription(description, context);

    const validated = ContentPlanSchema.parse(rawPlan);

    validated.description = description;

    injectAssetNeeds(validated.items);

    // Resolve identities BEFORE dispatching the background lore job so the lore
    // job generates against the identity-resolved item set (canonical slug /
    // entity_id / new_candidate) rather than the pre-resolution aliases.
    await this.attachIdentityResolutions(validated);

    generateForPlan(validated, this.provider, context).catch(err => {
      console.warn(`[ContentPlanService] Lore generation failed: ${err.message}`);
    });

    return { plan: validated, usage };
  }

  async generateOutline(description: string): Promise<PlanWithUsage> {
    const context = await this.gatherContext();
    const maxInputChars = finiteInt(process.env.PLAN_OUTLINE_MAX_INPUT_CHARS, 10000);

    let plan: ContentPlan;
    let usage: LLMUsage | null = null;
    let roster: EntityCandidate[] | undefined;

    if (description.length <= maxInputChars) {
      // Small input: single-pass (current behavior)
      const result = await this.provider.generateOutline(description, context);
      plan = result.plan;
      usage = result.usage;
    } else {
      // Large input: two-pass chunked ingestion
      console.log(`[ContentPlanService] Large input (${description.length} chars), using two-pass ingestion`);
      const result = await this.twoPassOutline(description, context);
      plan = result.plan;
      usage = result.usage;
      roster = result.roster;
    }

    plan.description = description;

    const validated = this.validateAndRepairOutline(plan, description);

    if (roster) {
      validated._meta = { ...validated._meta, entity_roster: roster };
    }

    injectAssetNeeds(validated.items);

    await this.attachIdentityResolutions(validated);

    return { plan: validated, usage };
  }

  private async twoPassOutline(
    description: string,
    context: ExistingContentContext,
  ): Promise<{ plan: ContentPlan; usage: LLMUsage | null; roster?: EntityCandidate[] }> {
    const maxInputChars = finiteInt(process.env.PLAN_OUTLINE_MAX_INPUT_CHARS, 10000);
    const initialMaxItems = finiteInt(process.env.LLM_OUTLINE_INITIAL_MAX_ITEMS, 15);

    // 1. Chunk the description
    const chunks = chunkDescription(description, maxInputChars);
    console.log(`[ContentPlanService] Split into ${chunks.length} chunks`);

    // 2. Per-chunk entity extraction (parallel, bounded)
    const extractionPrompt = buildEntityExtractionPrompt(context);
    const allCandidates: EntityCandidate[] = [];
    const BATCH_SIZE = 3;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(chunk => this.provider.extractEntities(extractionPrompt, chunk))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allCandidates.push(...result.value.entities);
        } else {
          console.warn(`[ContentPlanService] Entity extraction failed for a chunk: ${result.reason}`);
        }
      }
    }
    console.log(`[ContentPlanService] Extracted ${allCandidates.length} entity candidates`);

    if (allCandidates.length === 0 && chunks.length > 1) {
      console.warn(`[ContentPlanService] All ${chunks.length} chunks failed entity extraction — falling back to truncated description`);
    }

    // 3. Merge/dedupe
    const merged = mergeCandidates(allCandidates);
    console.log(`[ContentPlanService] Merged to ${merged.length} unique entities`);

    // 4. Synthesize synopsis + bounded outline call (with item count cap)
    const synopsis = buildSynopsisFromCandidates(merged, description, { maxItems: initialMaxItems });
    const result = await this.provider.generateOutline(synopsis, context);
    return { ...result, roster: merged };
  }

  validateAndRepairOutline(plan: ContentPlan, description: string): ContentPlan {
    return validateAndRepairOutline(plan, description);
  }

  private generateFallbackPlan(description: string): ContentPlan {
    return generateFallbackPlan(description);
  }

  async refinePlan(planId: string, feedback: string): Promise<PlanWithUsage> {
    // 1. Load existing plan from DB
    const result = await queryOLTP<{ id: string; plan_json: any; description: string }>(
      'SELECT id, plan_json, description FROM content_plans WHERE id = $1',
      [planId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }

    let existingPlan;
    try {
      existingPlan = ContentPlanSchema.parse(result.rows[0].plan_json);
    } catch {
      throw new Error('Stored plan failed schema validation');
    }

    // 2. Gather context
    const context = await this.gatherContext();

    // 3. Call LLM to refine — returns plan + usage directly, no shared state
    const { plan: rawRefined, usage } = await this.provider.refinePlan(existingPlan, feedback, context);

    // 4. Validate
    const validated = ContentPlanSchema.parse(rawRefined);

    // 5. Re-run the dedicated identity pass so refinements that add or rename an
    //    item never bypass resolution (and existing names retain identity).
    await this.attachIdentityResolutions(validated);

    // 6. Re-inject asset needs for any new items
    injectAssetNeeds(validated.items);

    // 7. Generate lore for NEW items only (skip existing to preserve user edits)
    const existingItemIds = new Set(existingPlan.items.map(i => i.id));
    const newItems = validated.items.filter(i => !existingItemIds.has(i.id));
    if (newItems.length > 0) {
      const partialPlan: ContentPlan = {
        ...validated,
        items: newItems,
      };
      generateForPlan(partialPlan, this.provider, context).catch(err => {
        console.warn(`[ContentPlanService] Lore generation for new items in refine failed: ${err.message}`);
      });
    }

    // 8. Create a NEW plan row (versioning) instead of updating in place
    const newPlanId = uuidv4();
    validated.id = newPlanId;
    const feedbackEntry = {
      feedback,
      timestamp: new Date().toISOString(),
      planSnapshot: existingPlan,
    };

    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status, feedback_log, parent_plan_id)
       VALUES ($1, $2, $3, 'proposed', $4::jsonb, $5)`,
      [newPlanId, validated.description, validated, JSON.stringify([feedbackEntry]), planId]
    );

    return { plan: validated, usage };
  }

  async refinePlanItems(planId: string, feedback: string, itemIds: string[]): Promise<PlanWithUsage> {
    // 1. Load existing plan from DB
    const result = await queryOLTP<{ id: string; plan_json: any; description: string }>(
      'SELECT id, plan_json, description FROM content_plans WHERE id = $1',
      [planId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }

    let existingPlan;
    try {
      existingPlan = ContentPlanSchema.parse(result.rows[0].plan_json);
    } catch {
      throw new Error('Stored plan failed schema validation');
    }

    // 2. Extract only the selected items
    const selectedItems = existingPlan.items.filter(i => itemIds.includes(i.id));
    if (selectedItems.length === 0) {
      throw new Error('None of the specified item IDs were found in the plan');
    }

    // 3. Gather context
    const context = await this.gatherContext();

    // 4. Call LLM with dedicated item-scoped prompt
    const { items: refinedItems, usage } = await this.provider.refinePlanItems(selectedItems, existingPlan, feedback, context);

    // 5. Merge refined items back into the full plan (replace by ID)
    const selectedIds = new Set(selectedItems.map(i => i.id));
    const refinedMap = new Map(refinedItems.filter(i => selectedIds.has(i.id)).map(i => [i.id, i]));
    const mergedItems = existingPlan.items.map(item => {
      const refined = refinedMap.get(item.id);
      if (!refined) return item;
      // If the type changed, discard old assetNeeds so injectAssetNeeds can
      // generate correct defaults for the new type. Otherwise preserve them.
      const { assetNeeds: originalAssetNeeds, dependsOn: originalDependsOn, ...rest } = item;
      const assetNeeds = refined.type !== item.type ? [] : originalAssetNeeds;
      const dependsOn = refined.type !== item.type ? [] : originalDependsOn;
      return { ...rest, ...refined, id: item.id, assetNeeds, dependsOn };
    });

    const mergedPlan: ContentPlan = {
      ...existingPlan,
      items: mergedItems,
      links: existingPlan.links,
      status: 'proposed',
    };

    // 7. Validate
    const validated = ContentPlanSchema.parse(mergedPlan);

    // 7b. Re-run the identity pass: item-scoped refinement must also resolve any
    //     newly added/renamed identities instead of bypassing resolution.
    await this.attachIdentityResolutions(validated);

    // 8. Re-inject asset needs
    injectAssetNeeds(validated.items);

    // 9. Create a NEW plan row (versioning)
    const newPlanId = uuidv4();
    validated.id = newPlanId;
    const feedbackEntry = {
      feedback: `[item-scoped] ${feedback}`,
      timestamp: new Date().toISOString(),
      planSnapshot: existingPlan,
    };

    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status, feedback_log, parent_plan_id)
       VALUES ($1, $2, $3, 'proposed', $4::jsonb, $5)`,
      [newPlanId, validated.description, validated, JSON.stringify([feedbackEntry]), planId]
    );

    return { plan: validated, usage };
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
   * In-memory refine for the two-phase intake "Refine Instead" path. Refines the
   * outline without persisting anything, then re-runs the intake conflict scan on
   * the refined plan so the author sees an updated preview.
   */
  async refinePlanPreview(plan: ContentPlan, feedback: string): Promise<{ plan: ContentPlan; conflicts: IntakeConflictPreview[]; usage: LLMUsage | null }> {
    const context = await this.gatherContext();
    const { plan: rawRefined, usage } = await this.provider.refinePlan(plan, feedback, context);
    // Re-inject asset needs so any new visual items get portrait/background
    // needs (Zod defaults missing assetNeeds to [], which would scaffold with
    // nothing to generate).
    const refined = ContentPlanSchema.parse(rawRefined);
    injectAssetNeeds(refined.items);
    // Re-run the identity pass on the in-memory refine so new/renamed identities
    // are resolved (and surfaced) here too, not only on the persisted paths.
    await this.attachIdentityResolutions(refined);
    // The conflict re-scan is advisory (Moment 1) — a scan outage must not fail
    // the refinement. Fall back to an empty conflict list so the author still
    // receives the refined outline.
    let conflicts: IntakeConflictPreview[] = [];
    try {
      const scan = await this.provider.analyzeIntakeConflicts(refined, context);
      conflicts = scan.conflicts;
    } catch (conflictErr) {
      console.warn('[ContentPlanService] Intake conflict scan failed; continuing with empty conflicts:', (conflictErr as Error).message);
    }
    return { plan: refined, conflicts, usage };
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
}

// Export singleton instance
export const contentPlanService = new ContentPlanService();
