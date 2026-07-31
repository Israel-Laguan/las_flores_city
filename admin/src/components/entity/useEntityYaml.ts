'use client';

import { useState, useEffect, useCallback } from 'react';
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

  const fetchYaml = useCallback(async () => {
    if (!type || !id) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await adminFetch<{ success: boolean; data?: { path: string; yaml: T }; error?: string }>(
        `/admin/content/by-id?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
      );
      if (data.success && data.data) {
        setState({ yaml: data.data.yaml, path: data.data.path, loading: false, error: null });
      } else {
        setState({ yaml: null, path: null, loading: false, error: data.error || 'Failed to load content' });
      }
    } catch (err: any) {
      setState({ yaml: null, path: null, loading: false, error: err?.status === 404 ? 'Not found' : 'Failed to load content' });
    }
  }, [id, type]);

  useEffect(() => {
    fetchYaml();
  }, [fetchYaml]);

  return { ...state, refetch: fetchYaml };
}
