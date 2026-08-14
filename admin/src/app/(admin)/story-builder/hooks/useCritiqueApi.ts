'use client';

import { useCallback, useEffect, useState } from 'react';
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
 */
export function useCritique(planId: string | null): CritiqueApiResult {
  const [annotations, setAnnotations] = useState<CritiqueAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnnotations = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ success: boolean; data?: { annotations: CritiqueAnnotation[] }; error?: string }>(
        `/admin/story-builder/plans/${planId}/annotations`,
      );
      if (res.success && res.data) setAnnotations(res.data.annotations ?? []);
      else setError(res.error || 'Failed to load critique annotations');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [planId]);

  const runCritique = useCallback(async (scope: 'entity' | 'cross_entity' = 'entity') => {
    if (!planId) return;
    setAnalyzeLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ success: boolean; data?: { annotations: CritiqueAnnotation[] }; error?: string }>(
        `/admin/story-builder/plans/${planId}/analyze`,
        { method: 'POST', body: JSON.stringify({ scope }) },
      );
      if (res.success && res.data) setAnnotations(res.data.annotations ?? []);
      else setError(res.error || 'Analyze failed');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setAnalyzeLoading(false);
    }
  }, [planId]);

  const dismiss = useCallback(async (id: string) => {
    setError(null);
    try {
      await adminFetch<{ success: boolean }>(
        `/admin/story-builder/plans/${planId}/annotations/${id}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) },
      );
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }, [planId]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  return { annotations, loading, analyzeLoading, error, runCritique, fetchAnnotations, dismiss };
}
