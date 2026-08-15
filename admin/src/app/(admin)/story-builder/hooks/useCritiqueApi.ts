'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CritiqueAnnotation } from '@las-flores/shared';
import { adminFetch } from '@/lib/client-api';

interface CritiqueApiResult {
  annotations: CritiqueAnnotation[];
  loading: boolean;
  error: string | null;
  analyzeLoading: boolean;
  runCritique: (scope?: 'entity' | 'cross_entity') => Promise<unknown>;
  fetchAnnotations: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
}

/**
 * M26 — AI critique state + actions for a content plan.
 *
 * `runCritique` POSTs the analyze endpoint (LLM writes :Conflict/:Suggestion
 * annotations), then reloads the stored annotations. `dismiss` issues the live
 * override (false-positive). Reads always come from the DB via GET annotations.
 *
 * Requests are invalidated on plan change: the current AbortController is
 * aborted and a bump of the request sequence ensures a slow response for an old
 * plan can never overwrite the new plan's annotations/error/loading state.
 */
export function useCritique(planId: string | null): CritiqueApiResult {
  const [annotations, setAnnotations] = useState<CritiqueAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  // When the plan changes, abort any in-flight request, bump the sequence (so
  // stale continuations in the old closure are ignored), and clear critique state.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    seqRef.current += 1;
    setAnnotations([]);
    setError(null);
    setLoading(false);
    setAnalyzeLoading(false);
  }, [planId]);

  const fetchAnnotations = useCallback(async () => {
    if (!planId) return;
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ success: boolean; data?: { annotations: CritiqueAnnotation[] }; error?: string }>(
        `/admin/story-builder/plans/${planId}/annotations`,
        { signal: controller.signal },
      );
      if (seq !== seqRef.current) return;
      if (res.success && res.data) setAnnotations(res.data.annotations ?? []);
      else setError(res.error || 'Failed to load critique annotations');
    } catch (err: any) {
      if (seq !== seqRef.current) return;
      if (err?.name === 'AbortError') return;
      setError(err?.message || String(err));
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [planId]);

  const runCritique = useCallback(async (scope: 'entity' | 'cross_entity' = 'entity') => {
    if (!planId) return;
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzeLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ success: boolean; data?: { annotations: CritiqueAnnotation[] }; error?: string }>(
        `/admin/story-builder/plans/${planId}/analyze`,
        { method: 'POST', body: JSON.stringify({ scope }), signal: controller.signal },
      );
      if (seq !== seqRef.current) return;
      if (res.success && res.data) setAnnotations(res.data.annotations ?? []);
      else setError(res.error || 'Analyze failed');
    } catch (err: any) {
      if (seq !== seqRef.current) return;
      if (err?.name === 'AbortError') return;
      setError(err?.message || String(err));
    } finally {
      if (seq === seqRef.current) setAnalyzeLoading(false);
    }
  }, [planId]);

  const dismiss = useCallback(async (id: string) => {
    if (!planId) return;
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    try {
      await adminFetch<{ success: boolean }>(
        `/admin/story-builder/plans/${planId}/annotations/${id}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }), signal: controller.signal },
      );
      if (seq !== seqRef.current) return;
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      if (seq !== seqRef.current) return;
      if (err?.name === 'AbortError') return;
      setError(err?.message || String(err));
    }
  }, [planId]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  return { annotations, loading, analyzeLoading, error, runCritique, fetchAnnotations, dismiss };
}
