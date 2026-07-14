'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/client-api';
import { LinkOp } from '../types';

export function usePendingOps() {
  const [pendingOps, setPendingOps] = useState<LinkOp[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addPendingOp = useCallback((op: LinkOp) => {
    setPendingOps(prev => [...prev, op]);
  }, []);

  const removePendingOp = useCallback((index: number) => {
    setPendingOps(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async (config: { listEndpoint: string }, selectedId: string, setSelectedData: (data: any) => void) => {
    if (pendingOps.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    let allOk = true;
    for (const op of pendingOps) {
      try {
        const data = await adminFetch<{ success: boolean; error?: string }>(
          '/admin/content/link',
          { method: 'POST', body: JSON.stringify(op) },
        );
        if (!data.success) { allOk = false; setError(`Failed: ${data.error}`); break; }
      } catch { allOk = false; setError('Link request failed'); break; }
    }

    if (allOk) {
      setPendingOps([]);
      setSuccess(true);
      if (selectedId) {
        const detailRes = await fetch(`${config.listEndpoint}/${selectedId}`);
        const detailData = await detailRes.json();
        if (detailData.success) setSelectedData(detailData.data);
      }
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  const resetOps = () => {
    setPendingOps([]);
    setSuccess(false);
    setError(null);
  };

  return {
    pendingOps, saving, error, success,
    addPendingOp, removePendingOp, handleSave, resetOps,
  };
}
