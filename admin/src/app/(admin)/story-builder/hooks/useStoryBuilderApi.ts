'use client';

import type { ContentPlan } from '@las-flores/shared';
import type { IntakeConflictPreview } from '@las-flores/shared';
import type { GenerationStatus } from '../types';
import { adminFetch } from '@/lib/client-api';

async function postJSON<T>(url: string, payload: unknown): Promise<T> {
  return adminFetch<T>(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loadPlanFromDb(id: string): Promise<{
  success: boolean;
  data?: { plan_json: ContentPlan; description: string };
  error?: string;
}> {
  const res = await adminFetch<{ success: boolean; data?: { plan_json: ContentPlan; description: string }; error?: string }>(
    `/admin/story-builder/plans/${id}`,
  );

  // M32 graph-based plans have no `plan_json` (deltas live in the graph). For
  // those, synthesize a ContentPlan from the plan's deltas/edges so the review
  // UI can render them.
  if (res.success && !res.data?.plan_json) {
    let synth;
    try { synth = await adminFetch<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(`/admin/story-builder/plans/${id}/graph-plan`); }
    catch (error: any) { return { success: false, data: undefined, error: error?.message || 'Failed to synthesize plan from graph deltas' }; }
    if (synth.success && synth.data?.plan) {
      return { success: true, data: { plan_json: synth.data.plan, description: res.data?.description ?? '' } };
    }
    return { success: false, data: undefined, error: synth.error || 'Plan has no plan_json and could not be synthesized from graph deltas' };
  }

  return res;
}

export async function generatePlan(description: string) {
  // M32: the legacy two-phase `/plan` → `/plan/scaffold` intake was retired in
  // favor of graph-based authoring. Create the plan (and its graph deltas)
  // synchronously via graph-intake, then synthesize a ContentPlan so the
  // existing review/approve/stage steps continue to work.
  let created: {
    success: boolean;
    data?: { planId: string; description: string; deltaCount: number; edgeCount: number };
    error?: string;
  };
  try {
    created = await postJSON<{
      success: boolean;
      data?: { planId: string; description: string; deltaCount: number; edgeCount: number };
      error?: string;
    }>(
      '/admin/story-builder/plans/graph-intake',
      { description },
    );
  } catch (error: any) {
    // postJSON throws for non-2xx (e.g. HTTP 409 when the graph is disabled),
    // so the success check below is unreachable on failure. Return the
    // documented structured failure instead of rejecting.
    return { success: false, error: error?.message || 'Failed to create graph-based plan' };
  }

  if (!created.success || !created.data?.planId) {
    return { success: created.success ?? false, error: created.error || 'Failed to create graph-based plan' };
  }

  const planId = created.data.planId;
  let synth;
  try { synth = await adminFetch<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(`/admin/story-builder/plans/${planId}/graph-plan`); }
  catch (error: any) { return { success: false, error: error?.message || 'Failed to load synthesized plan' }; }

  if (!synth.success || !synth.data?.plan) {
    return { success: false, error: synth.error || 'Failed to load synthesized plan' };
  }

  return {
    success: true,
    data: {
      plan: synth.data.plan,
      planId,
      status: 'proposed',
      conflicts: [],
      fileConflicts: [],
    } as {
      plan: ContentPlan;
      planId: string;
      status: string;
      conflicts: IntakeConflictPreview[];
      fileConflicts: string[];
    },
  };
}

/**
 * Phase-2 commit (\"Generate Full Plan\").
 * With graph-based intake the plan (and its deltas) are already persisted by
 * `generatePlan` → graph-intake, so this is a no-op that returns the existing
 * plan id rather than hitting the retired `/plan/scaffold` endpoint.
 */
export async function scaffoldPlan(plan: ContentPlan) {
  const planId = (plan as { id?: string }).id;
  if (!planId) {
    return { success: false, error: 'No plan id available; plan was not created' };
  }
  return { success: true, data: { planId, plan, status: 'proposed' } };
}

/**
 * In-memory refine of a phase-1 outline ("Refine Instead").
 * M32 retired the legacy `/plan/refine-preview` route in favor of the
 * graph-intake / conversational propose flow. Returns a clear structured error
 * so the stale control degrades gracefully instead of hitting a 404.
 */
export async function refinePlanPreview(plan: ContentPlan, feedback: string) {
  return {
    success: false,
    error: 'In-memory plan refinement was retired in M32 — use the graph-intake / chat propose flow to revise a plan.',
  } as { success: boolean; data?: { plan: ContentPlan; conflicts: IntakeConflictPreview[]; fileConflicts?: string[] }; error?: string };
}

export async function getGenerationStatus(planId: string) {
  // M32 graph-intake creates the plan synchronously (no background fill job),
  // so there is no `/plans/:id/generation-status` to poll. Report terminal
  // status so the surviving generation UI stops polling immediately.
  return {
    success: true,
    data: {
      planId,
      status: 'proposed',
      progress: { total: 0, completed: 0, failed: 0 },
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as GenerationStatus,
  };
}

export async function savePlan(description: string, plan: ContentPlan) {
  return postJSON<{ success: boolean; data?: { planId: string } }>(
    '/admin/story-builder/plans',
    { description, plan },
  );
}

export async function refinePlan(planId: string, feedback: string, itemIds?: string[]) {
  // M32 retired the single-turn `/plans/:id/refine` route; refinement now lives
  // in the chat/propose flow. Fail closed with a clear message rather than 404.
  return {
    success: false,
    error: 'Plan refinement has moved to the graph-intake / chat propose flow (M32); the legacy /plans/:id/refine endpoint is retired.',
  } as { success: boolean; data?: { plan: ContentPlan }; error?: string };
}

export async function previewPlan(planId: string) {
  return postJSON<{ success: boolean; data?: any; error?: string }>(
    `/admin/story-builder/plans/${planId}/preview`,
    {},
  );
}

export async function stagePlan(planId: string) {
  return postJSON<{ success: boolean; data?: any; error?: string }>(
    `/admin/story-builder/plans/${planId}/stage`,
    {},
  );
}

export async function migratePlan(planId: string) {
  return postJSON<{ success: boolean; data?: any; error?: string }>(
    `/admin/story-builder/plans/${planId}/migrate`,
    {},
  );
}

export async function retryPlan(planId: string) {
  return postJSON<{ success: boolean; data?: any; error?: string }>(
    `/admin/story-builder/plans/${planId}/retry`,
    {},
  );
}

export async function selectTemplate(templateId: string, description: string) {
  // M32 retired the templates/clone meta routes alongside the draft router.
  // The template picker is superseded by graph-intake description authoring.
  return {
    success: false,
    error: 'Plan templates were retired in M32 — author from a description via graph-intake instead.',
  } as { success: boolean; data?: { plan: ContentPlan }; error?: string };
}

export interface PlanTemplateParams {
  name: string;
  slug: string;
  description?: string;
}

/**
 * Create a plan from a registered scoped template (M43: mission, location).
 * The server builds a ContentPlanSchema-valid plan in 'proposed' status for
 * review; execution still flows through the standard stage → migrate →
 * verify pipeline.
 */
export async function createPlanFromTemplate(
  templateId: string,
  params: PlanTemplateParams & Record<string, unknown>,
): Promise<{ success: boolean; data?: { planId: string; plan: ContentPlan }; error?: string }> {
  try {
    return await postJSON<{ success: boolean; data?: { planId: string; plan: ContentPlan }; error?: string }>(
      '/admin/story-builder/plans/from-template',
      { templateId, ...params },
    );
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to create plan from template' };
  }
}

export async function fetchTemplates() {
  // M32 retired GET /admin/story-builder/templates; template authoring moved to
  // graph-intake description authoring. Return an empty catalog so the picker
  // degrades gracefully rather than 404ing.
  return { success: true, data: { templates: [] } as { templates: Array<{ id: string; label: string; description: string; icon: string }> } };
}

export async function cloneEntity(sourcePath: string, newName: string) {
  // M32 retired the clone route with the meta router.
  return {
    success: false,
    error: 'Entity cloning was retired in M32 — author new content via graph-intake.',
  } as { success: boolean; data?: { item: any }; error?: string };
}

export async function fetchContentTree() {
  return adminFetch<{ success: boolean; data?: { tree: Array<{ path: string; name: string; type: string; size: number; modifiedAt: string }> } }>(
    '/admin/content/tree',
  );
}

export async function approvePlan(planId: string, plan: ContentPlan) {
  return adminFetch<{ success: boolean; data?: { planId: string; status: string }; error?: string }>(
    `/admin/story-builder/plans/${planId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ plan, status: 'approved' }),
    },
  );
}

/**
 * Persist author edits to an in-flight (draft/proposed) plan without changing
 * its lifecycle status. Used to flush ReviewStep edits to the DB before
 * refine/ship so those operations run against the edited plan, not a stale copy.
 */
export async function updatePlan(planId: string, plan: ContentPlan, status?: string) {
  return adminFetch<{ success: boolean; data?: { planId: string; plan: ContentPlan; status: string }; error?: string }>(
    `/admin/story-builder/plans/${planId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ plan, status }),
    },
  );
}

/**
 * Single-click "Approve & Ship" (Milestone 04). Runs stage → publish →
 * migrate → verify server-side and returns the full `SolidifyResult`.
 */
export async function approveAndSolidify(planId: string) {
  return postJSON<{
    success: boolean;
    data?: {
      success: boolean;
      status: string;
      stage?: any;
      publish?: any;
      migration?: any;
      verificationReport?: any;
      error?: string;
    };
    error?: string;
  }>(`/admin/story-builder/plans/${planId}/approve-and-solidify`, {});
}

/** Poll async solidify job status. */
export async function getJobStatus(planId: string) {
  return adminFetch<{
    success: boolean;
    data?: {
      planId: string;
      status: string;
      stage?: any;
      publish?: any;
      migration?: any;
      verificationReport?: any;
      error?: string;
      startedAt?: string;
      updatedAt?: string;
    };
    error?: string;
  }>(`/admin/story-builder/plans/${planId}/status`);
}

/** Fetch the saved verification report for a plan. */
export async function getVerification(planId: string) {
  return adminFetch<{ success: boolean; data?: { verification_report: any; conflict_report?: any }; error?: string }>(
    `/admin/story-builder/plans/${planId}/verification`,
  );
}

/**
 * M25 — fetch the latest bounded conflict report (checked-scope + findings) for
 * a plan. Thin wrapper over the verification route so ResultsStep can render the
 * dedicated `ConflictScopeReport` surface.
 */
export async function fetchVerificationReport(planId: string) {
  return getVerification(planId);
}

export async function regenerateLore(planId: string, itemId: string) {
  return adminFetch<{ success: boolean; data?: { lorePath: string; content: string }; error?: string }>(
    `/admin/story-builder/plans/${planId}/items/${itemId}/lore`,
    {
      method: 'POST',
    },
  );
}

export async function listPlans(limit?: number, offset?: number) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  return adminFetch<{
    success: boolean;
    data?: {
      plans: Array<{
        id: string;
        description: string;
        status: string;
        created_at: string;
        updated_at: string;
        item_count: number;
      }>;
      total: number;
    };
    error?: string;
  }>(`/admin/story-builder/plans?${params.toString()}`);
}

export async function deletePlan(planId: string) {
  return adminFetch<{ success: boolean; error?: string }>(
    `/admin/story-builder/plans/${planId}`,
    { method: 'DELETE' },
  );
}

export async function generateDrafts(planId: string, count?: number) {
  // M32 retired the drafts router; asset drafting moved elsewhere.
  return { success: false, error: 'Draft generation was retired in M32 — asset authoring moved to graph-intake/CDN.' };
}

export interface DraftAsset {
  filename: string;
  sizeBytes: number;
  mtime: string;
  previewUrl: string;
}

export interface DraftItem {
  itemId: string;
  slug: string;
  assets: DraftAsset[];
  preSelected: string | null;
}

export async function listDrafts(planId: string) {
  // M32 retired the drafts router; the draft picker is superseded by asset
  // authoring via graph-intake/CDN. Fail closed with a clear message rather
  // than 404ing on the removed `/plans/:id/drafts` endpoint.
  return { success: false, error: 'Draft assets were retired in M32 — asset drafting moved to graph-intake/CDN.' } as {
    success: boolean;
    data?: { planId: string; items: DraftItem[] };
    error?: string;
  };
}

export async function chooseDraft(planId: string, itemId: string, promptType: string, filename: string) {
  // M32 retired the drafts router.
  return { success: false, error: 'Draft selection was retired in M32.' };
}

export async function getPlanVersions(planId: string) {
  // M32 retired the version-history meta route (`/plans/:id/versions`).
  return {
    success: true,
    data: { id: planId, description: '', status: '', created_at: '', updated_at: '', parent_plan_id: null, children: [] },
  };
}
