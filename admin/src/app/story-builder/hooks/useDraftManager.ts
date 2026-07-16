'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from './useStoryBuilderApi';

interface UseDraftManagerOptions {
  planId: string | null;
  handleGenerateDrafts: (count?: number) => Promise<void>;
  handleChooseDraft: (itemId: string, promptType: string, filename: string) => Promise<void>;
}

export function useDraftManager({ planId, handleGenerateDrafts, handleChooseDraft }: UseDraftManagerOptions) {
  const [draftAssetsByItem, setDraftAssetsByItem] = useState<Record<string, api.DraftAsset[]>>({});
  const [draftLoading, setDraftLoading] = useState(false);

  const loadDrafts = useCallback(async (pid: string) => {
    const res = await api.listDrafts(pid);
    if (!res.success || !res.data) return;
    const byItem: Record<string, api.DraftAsset[]> = {};
    for (const item of res.data.items) {
      byItem[item.itemId] = item.assets;
    }
    setDraftAssetsByItem(byItem);
  }, []);

  useEffect(() => {
    if (planId) {
      loadDrafts(planId);
    }
  }, [planId, loadDrafts]);

  const onGenerateDrafts = async (count?: number) => {
    if (!planId) return;
    setDraftLoading(true);
    try {
      await handleGenerateDrafts(count);
      await loadDrafts(planId);
    } finally {
      setDraftLoading(false);
    }
  };

  const onChooseDraft = async (itemId: string, promptType: string, filename: string) => {
    if (!planId) return;
    setDraftLoading(true);
    try {
      await handleChooseDraft(itemId, promptType, filename);
      await loadDrafts(planId);
    } finally {
      setDraftLoading(false);
    }
  };

  return { draftAssetsByItem, draftLoading, onGenerateDrafts, onChooseDraft };
}
