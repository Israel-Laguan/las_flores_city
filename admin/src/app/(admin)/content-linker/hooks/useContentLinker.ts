'use client';

import { useState, useEffect } from 'react';
import { SectionConfig } from '../types';
import { useEntityList } from './useEntityList';
import { useEntityDetail } from './useEntityDetail';
import { usePendingOps } from './usePendingOps';
import { adminFetch } from '@/lib/client-api';

export interface TabConfigLike {
  label: string;
  listEndpoint: string;
  entityName: string;
  entityType: string;
  sections: SectionConfig[];
}

export function useContentLinker(tab: TabConfigLike, initialId?: string) {
  const [selectedId, setSelectedId] = useState<string>(initialId || '');
  const [contentPath, setContentPath] = useState<string | null>(null);

  const { entities, loading, loadError } = useEntityList(tab.listEndpoint);
  const { selectedData, setSelectedData, available } = useEntityDetail(tab.listEndpoint, tab.sections, selectedId);
  const { pendingOps, saving, error, success, addPendingOp, removePendingOp, handleSave, resetOps } = usePendingOps();

  // Resolve the canonical YAML content path for the selected entity via the
  // admin content resolver. The per-folder content layout means we cannot
  // construct the path from the entity id alone (e.g. characters/<slug>/char_<slug>.yaml).
  useEffect(() => {
    setContentPath(null);
    if (!selectedId) {
      return;
    }
    let active = true;
    adminFetch<{ success: boolean; data?: { path: string } }>(
      `/admin/content/by-id?type=${encodeURIComponent(tab.entityType)}&id=${encodeURIComponent(selectedId)}`
    ).then((data) => {
      if (active && data.success && data.data?.path) {
        setContentPath(data.data.path);
      }
    }).catch(() => {
      // Fall back to null; callers should guard against a missing path.
      if (active) setContentPath(null);
    });
    return () => { active = false; };
  }, [selectedId, tab.entityType]);

  const selectEntity = (id: string) => {
    setSelectedId(id);
    resetOps();
  };

  return {
    entities, loading, loadError, selectedId, selectedData, available, contentPath,
    pendingOps, saving, error, success,
    addPendingOp, removePendingOp, handleSave: (config: { listEndpoint: string }) => handleSave(config, selectedId, setSelectedData), selectEntity,
  };
}
