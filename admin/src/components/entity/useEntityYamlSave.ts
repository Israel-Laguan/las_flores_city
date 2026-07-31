'use client';

import { useState, useCallback, useRef } from 'react';
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

  // Request-generation token: each call to save()/migrate() captures the current
  // token value. When it resolves, it only applies state if the token still matches
  // (i.e. no newer op or reset has superseded it). This prevents stale in-flight
  // results from overwriting after the user edits the form or navigates away.
  const opTokenRef = useRef(0);

  const save = useCallback(async (path: string, yamlObj: Record<string, unknown>) => {
    const token = ++opTokenRef.current;
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
      if (token !== opTokenRef.current) return false; // stale — a newer op/reset superseded this
      if (data.success) {
        setState({ saving: false, error: null, success: true });
        return true;
      }
      setState({ saving: false, error: data.error || 'Save failed', success: false });
      return false;
    } catch (err: any) {
      if (token !== opTokenRef.current) return false;
      setState({ saving: false, error: err?.message || 'Save failed', success: false });
      return false;
    }
  }, []);

  const migrate = useCallback(async () => {
    const token = ++opTokenRef.current;
    setState({ saving: true, error: null, success: false });
    try {
      const data = await adminFetch<{ success: boolean; data?: { success?: boolean; filesFailed?: number; [k: string]: unknown }; error?: string }>(
        '/admin/content/migrate',
        { method: 'POST' },
      );
      if (token !== opTokenRef.current) return false;
      // Gate on the nested MigrationResult.success — the top-level success is always
      // true on non-exception, even when individual files fail.
      const migrationResult = data.data;
      if (data.success && migrationResult && migrationResult.success !== false && (migrationResult.filesFailed ?? 0) === 0) {
        setState({ saving: false, error: null, success: true });
        return true;
      }
      const detail = migrationResult?.success === false
        ? 'Migration reported failures'
        : (data.error || 'Migration failed');
      setState({ saving: false, error: detail, success: false });
      return false;
    } catch (err: any) {
      if (token !== opTokenRef.current) return false;
      setState({ saving: false, error: err?.message || 'Migration failed', success: false });
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    opTokenRef.current++; // invalidate any in-flight op
    setState({ saving: false, error: null, success: false });
  }, []);

  return { ...state, save, migrate, reset };
}
