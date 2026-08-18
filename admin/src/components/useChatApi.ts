'use client';

import { useCallback } from 'react';
import type { ChatMessage, GraphDelta, GraphDeltaEdge } from '@las-flores/shared';
import { adminFetch } from '@/lib/client-api';

interface ChatResponse {
  success: boolean;
  data?: {
    mode: 'explain' | 'propose';
    reply: string;
    deltas?: GraphDelta[];
    deltaEdges?: GraphDeltaEdge[];
  };
  error?: string;
}

interface ApplyDeltaResponse {
  success: boolean;
  data?: { appliedCount: number; mergedView: unknown };
  error?: string;
}

interface DiscardDeltaResponse {
  success: boolean;
  data?: { discarded: { nodeType: string; nodeId: string } };
  error?: string;
}

// M29 — client for the chat endpoints (POST .../chat, .../chat/apply-delta,
// .../chat/discard-delta over /admin/story-builder). Requests ride the existing
// adminFetch cookie credentials; no new auth surface is introduced.
export function useChatApi() {
  const chat = useCallback(async (
    planId: string,
    messages: ChatMessage[],
    mode: 'explain' | 'propose',
    annotationId?: string,
  ): Promise<{ reply: string; deltas: GraphDelta[]; deltaEdges: GraphDeltaEdge[] }> => {
    const res = await adminFetch<ChatResponse>(
      `/admin/story-builder/plans/${planId}/chat`,
      { method: 'POST', body: JSON.stringify({ messages, mode, annotationId: annotationId ?? null }) },
    );
    if (!res.success || !res.data) throw new Error(res.error || 'Chat request failed');
    return { reply: res.data.reply, deltas: res.data.deltas ?? [], deltaEdges: res.data.deltaEdges ?? [] };
  }, []);

  const applyDelta = useCallback(async (
    planId: string,
    deltas: GraphDelta[],
    deltaEdges: GraphDeltaEdge[] = [],
    annotationId?: string,
  ): Promise<{ appliedCount: number; mergedView: unknown }> => {
    const res = await adminFetch<ApplyDeltaResponse>(
      `/admin/story-builder/plans/${planId}/chat/apply-delta`,
      { method: 'POST', body: JSON.stringify({ deltas, deltaEdges, annotationId: annotationId ?? null }) },
    );
    if (!res.success || !res.data) throw new Error(res.error || 'Apply delta failed');
    return { appliedCount: res.data.appliedCount, mergedView: res.data.mergedView };
  }, []);

  const discardDelta = useCallback(async (
    planId: string,
    nodeType: string,
    nodeId: string,
  ): Promise<void> => {
    const res = await adminFetch<DiscardDeltaResponse>(
      `/admin/story-builder/plans/${planId}/chat/discard-delta`,
      { method: 'POST', body: JSON.stringify({ nodeType, nodeId }) },
    );
    if (!res.success) throw new Error(res.error || 'Discard delta failed');
  }, []);

  return { chat, applyDelta, discardDelta };
}