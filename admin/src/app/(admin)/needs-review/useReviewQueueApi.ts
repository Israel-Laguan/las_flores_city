'use client';

import { useCallback } from 'react';
import type { ReviewQueueItem, GraphDelta, GraphDeltaEdge, CritiqueAnnotation } from '@las-flores/shared';
import { adminFetch } from '@/lib/client-api';

interface ReviewQueueResponse {
  success: boolean;
  data?: { items: ReviewQueueItem[] };
  error?: string;
}

// M29 — client for the global needs_review queue. Reads /review-queue and
// resolves individual rows: dismiss (keep existing for annotation rows),
// accept-delta (apply), keep-delta (discard). All over the existing adminFetch
// cookie-credential path.
export function useReviewQueueApi() {
  const list = useCallback(async (): Promise<ReviewQueueItem[]> => {
    const res = await adminFetch<ReviewQueueResponse>('/admin/story-builder/review-queue');
    if (!res.success || !res.data) throw new Error(res.error || 'Failed to load review queue');
    return res.data.items;
  }, []);

  const dismiss = useCallback(async (annotation: CritiqueAnnotation): Promise<void> => {
    const res = await adminFetch<{ success: boolean; error?: string }>(
      `/admin/story-builder/plans/${annotation.planId}/annotations/${annotation.id}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) },
    );
    if (!res.success) throw new Error(res.error || 'Failed to dismiss annotation');
  }, []);

  const acceptDelta = useCallback(async (planId: string, delta: GraphDelta, deltaEdges: GraphDeltaEdge[] = []): Promise<{ appliedCount: number }> => {
    const res = await adminFetch<{ success: boolean; data?: { appliedCount: number }; error?: string }>(
      `/admin/story-builder/plans/${planId}/chat/apply-delta`,
      { method: 'POST', body: JSON.stringify({ deltas: [delta], deltaEdges }) },
    );
    if (!res.success || !res.data) throw new Error(res.error || 'Failed to accept delta');
    return { appliedCount: res.data.appliedCount };
  }, []);

  const keepDelta = useCallback(async (planId: string, nodeType: string, nodeId: string): Promise<void> => {
    const res = await adminFetch<{ success: boolean; error?: string }>(
      `/admin/story-builder/plans/${planId}/chat/discard-delta`,
      { method: 'POST', body: JSON.stringify({ nodeType, nodeId }) },
    );
    if (!res.success) throw new Error(res.error || 'Failed to keep existing');
  }, []);

  return { list, dismiss, acceptDelta, keepDelta };
}