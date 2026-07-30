'use client';

import { useState, useCallback } from 'react';
import { dump } from 'js-yaml';
import { adminFetch } from '@/lib/client-api';

export interface EntityYamlSaveState {
  saving: boolean;
  error: string | null;
  success: boolean;
}

export function useEntityYamlSave() {
  const [state, setState] = useState<EntityYamlSaveState>({
    saving: false,
    error: null,
    success: false,
  });

  const save = useCallback(async (path: string, yamlObj: Record<string, unknown>) => {
    setState({ saving: true, error: null, success: false });
    try {
      const content = dump(yamlObj, { lineWidth: -1, noRefs: true });
      const data = await adminFetch<{ success: boolean; data?: { path: string; modifiedAt: string }; error?: string }>(
        '/admin/content/file',
        {
          method: 'PUT',
          body: JSON.stringify({ path, content }),
        },
      );
      if (data.success) {
        setState({ saving: false, error: null, success: true });
        return true;
      }
      setState({ saving: false, error: data.error || 'Save failed', success: false });
      return false;
    } catch (err: any) {
      setState({ saving: false, error: err?.message || 'Save failed', success: false });
      return false;
    }
  }, []);

  const migrate = useCallback(async () => {
    setState({ saving: true, error: null, success: false });
    try {
      const data = await adminFetch<{ success: boolean; data?: unknown; error?: string }>(
        '/admin/content/migrate',
        { method: 'POST' },
      );
      if (data.success) {
        setState({ saving: false, error: null, success: true });
        return true;
      }
      setState({ saving: false, error: data.error || 'Migration failed', success: false });
      return false;
    } catch (err: any) {
      setState({ saving: false, error: err?.message || 'Migration failed', success: false });
      return false;
    }
  }, []);

  const reset = useCallback(() => setState({ saving: false, error: null, success: false }), []);

  return { ...state, save, migrate, reset };
}
