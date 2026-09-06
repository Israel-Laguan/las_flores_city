'use client';

import { useCallback } from 'react';
import type { ChatMessage, GraphDelta, GraphDeltaEdge, ContentPlan } from '@las-flores/shared';
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
// M52: applyDelta and discardDelta return a mergedView that callers can
// use to refresh the review plan from the current graph revision.
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
  ): Promise<{ mergedView?: unknown }> => {
    const res = await adminFetch<DiscardDeltaResponse>(
      `/admin/story-builder/plans/${planId}/chat/discard-delta`,
      { method: 'POST', body: JSON.stringify({ nodeType, nodeId }) },
    );
    if (!res.success) throw new Error(res.error || 'Discard delta failed');
    return {};
  }, []);

  // M52: refresh the plan from the current graph revision after
  // chat/apply-delta or discard-delta operations.
  const refreshPlan = useCallback(async (planId: string) => {
    const synth = await adminFetch<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(
      `/admin/story-builder/plans/${planId}/graph-plan`,
    );
    if (synth.success && synth.data?.plan) {
      return synth.data.plan;
    }
    // Fallback: load from DB which will try graph-plan synthesis
    const db = await adminFetch<{ success: boolean; data?: { plan_json: ContentPlan } }>(
      `/admin/story-builder/plans/${planId}`,
    );
    return db.success && db.data?.plan_json ? db.data.plan_json : null;
  }, []);

  return { chat, applyDelta, discardDelta, refreshPlan };
}