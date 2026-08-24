/**
 * Admin tests — createPlanFromTemplate API helper (M43).
 *
 * Covers the success and rejected paths of the admin client for the scoped
 * plan-template endpoint: a successful creation returns the proposed plan,
 * while an unknown template / invalid slug surfaces the server error without
 * throwing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdminFetch = vi.fn();
vi.mock('@/lib/client-api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

import { createPlanFromTemplate } from '../hooks/useStoryBuilderApi';

describe('createPlanFromTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to /plans/from-template and returns the created plan (success path)', async () => {
    const plan = {
      id: 'b4300000-0000-4000-8000-000000000009',
      description: 'Mission template: Tapes',
      items: [{ id: 'b4300000-0000-4000-8000-00000000000a', type: 'mission', action: 'create', name: 'Tapes', slug: 'tapes', fields: {}, assetNeeds: [], dependsOn: [] }],
      links: [],
      status: 'proposed',
    };
    mockAdminFetch.mockResolvedValueOnce({ success: true, data: { planId: plan.id, plan } });

    const res = await createPlanFromTemplate('mission', { name: 'Tapes', slug: 'tapes' });

    expect(mockAdminFetch).toHaveBeenCalledWith(
      '/admin/story-builder/plans/from-template',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockAdminFetch.mock.calls[0][1].body);
    expect(body).toEqual({ templateId: 'mission', name: 'Tapes', slug: 'tapes' });
    expect(res.success).toBe(true);
    expect(res.data?.plan.status).toBe('proposed');
    expect(res.data?.plan.items[0].type).toBe('mission');
  });

  it('surfaces the server rejection for an unknown template (rejected path)', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      success: false,
      error: 'Unknown plan template "wizard". Known templates: mission, location',
    });

    const res = await createPlanFromTemplate('wizard', { name: 'X', slug: 'x' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unknown plan template "wizard"/);
  });

  it('converts a thrown fetch failure into a structured error (rejected path)', async () => {
    mockAdminFetch.mockRejectedValueOnce(new Error('HTTP 400: Invalid template params'));

    const res = await createPlanFromTemplate('mission', { name: 'Bad Slug', slug: 'Bad Slug!' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid template params/);
  });
});
