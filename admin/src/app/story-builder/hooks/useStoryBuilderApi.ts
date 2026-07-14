'use client';

import type { ContentPlan } from '@las-flores/shared';
import { adminFetch } from '@/lib/client-api';

async function postJSON<T>(url: string, payload: unknown): Promise<T> {
  return adminFetch<T>(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loadPlanFromDb(id: string) {
  return adminFetch<{ success: boolean; data?: { plan_json: ContentPlan; description: string }; error?: string }>(
    `/admin/story-builder/plans/${id}`,
  );
}

export async function generatePlan(description: string) {
  return postJSON<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(
    '/admin/story-builder/plan',
    { description },
  );
}

export async function savePlan(description: string, plan: ContentPlan) {
  return postJSON<{ success: boolean; data?: { planId: string } }>(
    '/admin/story-builder/plans',
    { description, plan },
  );
}

export async function refinePlan(planId: string, feedback: string) {
  return postJSON<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(
    `/admin/story-builder/plans/${planId}/refine`,
    { feedback },
  );
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
  return postJSON<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(
    `/admin/story-builder/templates/${templateId}`,
    { description },
  );
}

export async function fetchTemplates() {
  return adminFetch<{ success: boolean; data?: { templates: Array<{ id: string; label: string; description: string; icon: string }> } }>(
    '/admin/story-builder/templates',
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

export async function getPlanVersions(planId: string) {
  return adminFetch<{
    success: boolean;
    data?: {
      id: string;
      description: string;
      status: string;
      created_at: string;
      parent_plan_id: string | null;
      children: any[];
    };
    error?: string;
  }>(`/admin/story-builder/plans/${planId}/versions`);
}
