'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { adminFetch } from '@/lib/client-api';

export interface EntityYamlState<T = Record<string, unknown>> {
  yaml: T | null;
  path: string | null;
  loading: boolean;
  error: string | null;
}

export interface UseEntityYamlReturn<T = Record<string, unknown>> extends EntityYamlState<T> {
  refetch: () => void;
}

export function useEntityYaml<T = Record<string, unknown>>(type: string, id: string): UseEntityYamlReturn<T> {
  const [state, setState] = useState<EntityYamlState<T>>({
    yaml: null,
    path: null,
    loading: true,
    error: null,
  });

  // The (type, id) this component is CURRENTLY rendering. In-flight responses
  // that resolve after the caller navigated to a different entity are
  // discarded so a stale payload can never overwrite the new entity's content.
  const activeKeyRef = useRef(`${type}:${id}`);
  activeKeyRef.current = `${type}:${id}`;

  const fetchYaml = useCallback(async (signal?: AbortSignal) => {
    if (!type || !id) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    const key = `${type}:${id}`;
    // Clear previous content immediately: a stale draft/path from the prior
    // entity must never render (or save) under the new (type, id) while the
    // fresh fetch is in flight.
    setState({ yaml: null, path: null, loading: true, error: null });
    try {
      const data = await adminFetch<{ success: boolean; data?: { path: string; yaml: T }; error?: string }>(
        `/admin/content/by-id?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
        signal ? { signal } : {},
      );
      if (signal?.aborted || activeKeyRef.current !== key) return; // stale response
      if (data.success && data.data) {
        setState({ yaml: data.data.yaml, path: data.data.path, loading: false, error: null });
      } else {
        setState({ yaml: null, path: null, loading: false, error: data.error || 'Failed to load content' });
      }
    } catch (err: any) {
      if (signal?.aborted || activeKeyRef.current !== key) return;
      setState({ yaml: null, path: null, loading: false, error: err?.status === 404 ? 'Not found' : 'Failed to load content' });
    }
  }, [type, id]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchYaml(controller.signal);
    // Abort the in-flight request when the key changes or the component
    // unmounts, so a slow response from a previous entity cannot land here.
    return () => controller.abort();
  }, [fetchYaml]);

  return { ...state, refetch: () => void fetchYaml() };
}
